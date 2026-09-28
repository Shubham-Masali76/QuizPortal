import { useState, useEffect, useMemo } from "react";
import { doc, onSnapshot, collection, updateDoc } from "firebase/firestore";
import { ref as rtdbRef, onValue as rtdbOnValue } from "firebase/database";
import { db, rtdb } from "../services/firebase";
import ParticipantAvatarCluster from "../components/ParticipantAvatarCluster";
import Toast from "../components/Toast";

export default function HostWaitingRoom({
  quizId,
  initialTitle,
  initialDescription,
  initialCode,
  setPage,
  setQuizStatus,
}) {
  const [participants, setParticipants] = useState([]);
  const [presenceMap, setPresenceMap] = useState({});
  const [quizData, setQuizData] = useState({
    title: initialTitle,
    description: initialDescription,
    quizCode: initialCode,
    status: "waiting",
  });
  const [loading, setLoading] = useState(Boolean(quizId));
  const [error, setError] = useState(quizId ? "" : "No quiz selected.");
  const [isStarting, setIsStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [readingTimeLimit, setReadingTimeLimit] = useState(10);
  const [answeringTimeLimit, setAnsweringTimeLimit] = useState(20);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage("");
    }, 3500);
  };

  // Active participants: Firestore docs filtered by RTDB presence === 'online'
  const activeParticipants = useMemo(() => {
    return participants.filter((p) => {
      const pres = presenceMap[p.id];
      return pres && (pres === true || pres.state === "online");
    });
  }, [participants, presenceMap]);

  // Real-time listener for active participants in RTDB
  useEffect(() => {
    if (!quizId) {
      return;
    }

    const presenceRef = rtdbRef(rtdb, `presence/${quizId}`);
    const unsubPresence = rtdbOnValue(
      presenceRef,
      (snapshot) => {
        const val = snapshot.val();
        setPresenceMap(val || {});
      },
      (err) => {
        console.error(
          "Error listening to RTDB presence in host waiting room:",
          err,
        );
      },
    );

    return () => {
      unsubPresence();
    };
  }, [quizId]);

  useEffect(() => {
    if (!quizId) {
      return;
    }

    const quizDocRef = doc(db, "quizzes", quizId);
    const unsubQuiz = onSnapshot(
      quizDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setQuizData((prev) => ({
            ...prev,
            title: data.title || prev.title,
            description: data.description || prev.description,
            quizCode: data.quizCode || prev.quizCode,
            status: data.status || prev.status,
          }));
          if (data.status && setQuizStatus) {
            setQuizStatus(data.status);
          }
        } else {
          setError("This quiz could not be found or was deleted.");
        }
      },
      (err) => {
        console.error("Error listening to quiz doc:", err);
        setError("Failed to load quiz details.");
      },
    );

    const participantsRef = collection(db, "quizzes", quizId, "participants");
    const unsubParticipants = onSnapshot(
      participantsRef,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({
          id: d.id,
          name: d.data().name || "Anonymous",
          ...d.data(),
        }));
        setParticipants(list);
        setLoading(false);
      },
      (err) => {
        console.error("Error listening to participants:", err);
        setError("Failed to load participants.");
        setLoading(false);
      },
    );

    return () => {
      unsubQuiz();
      unsubParticipants();
    };
  }, [quizId, setQuizStatus]);

  const handleCopyCode = () => {
    if (quizData.quizCode) {
      navigator.clipboard.writeText(quizData.quizCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleStartQuiz = async () => {
    if (quizData.status !== "waiting") {
      showToast("Quiz can only be started when in waiting status.");
      return;
    }

    if (activeParticipants.length === 0) {
      showToast(
        "Waiting for at least one participant to join before starting.",
      );
      return;
    }

    setIsStarting(true);
    try {
      await updateDoc(doc(db, "quizzes", quizId), {
        status: "live",
        readingTimeLimit: readingTimeLimit || 10,
        answeringTimeLimit: answeringTimeLimit || 20,
      });
      if (setQuizStatus) {
        setQuizStatus("live");
      }

      showToast("Quiz is now LIVE!");
      setPage("host-live");
    } catch (err) {
      console.error("Error starting quiz:", err);
      showToast("Failed to start quiz. Please try again.");
    } finally {
      setIsStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="waiting-room-page">
        <div className="waiting-room-loading">
          <h2>Loading Waiting Room...</h2>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="waiting-room-page">
        <div className="waiting-room-error">
          <p>{error}</p>
          <button className="primary-btn" onClick={() => setPage("quizzes")}>
            ← Back to My Quizzes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="waiting-room-page">
      <div className="waiting-room-top-nav">
        <button className="secondary-btn" onClick={() => setPage("editor")}>
          ← Back to Quiz Editor
        </button>
        <button className="secondary-btn" onClick={() => setPage("quizzes")}>
          My Quizzes
        </button>
      </div>

      <div className="waiting-room-header">
        <h1>{quizData.title}</h1>
        {quizData.description && <p>{quizData.description}</p>}
      </div>

      <div className="waiting-room-code-bar">
        <span className="code-label">QUIZ CODE:</span>
        <span className="code-value">{quizData.quizCode || "------"}</span>
        <button className="copy-code-btn" onClick={handleCopyCode}>
          {copied ? "Copied" : "Copy Code"}
        </button>
      </div>

      <ParticipantAvatarCluster
        activeParticipants={activeParticipants}
        quizId={quizId}
      />

      <div className="waiting-room-settings-card">
        <h3>Quiz Settings</h3>
        <div className="settings-grid">
          <div className="setting-group">
            <label>Reading Time (seconds):</label>
            <input 
              type="number" 
              min="5" 
              max="120"
              value={readingTimeLimit} 
              onChange={(e) => setReadingTimeLimit(Number(e.target.value))}
            />
          </div>
          <div className="setting-group">
            <label>Answering Time (seconds):</label>
            <input 
              type="number" 
              min="10" 
              max="300"
              value={answeringTimeLimit} 
              onChange={(e) => setAnsweringTimeLimit(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      <div className="waiting-room-actions">
        <button
          className={`primary-btn start-quiz-btn ${
            quizData.status === "live" ? "is-live" : ""
          }`}
          onClick={handleStartQuiz}
          disabled={
            isStarting ||
            quizData.status !== "waiting" ||
            activeParticipants.length === 0
          }
          title={
            activeParticipants.length === 0
              ? "Waiting for at least one participant to join"
              : ""
          }
        >
          {isStarting
            ? "Starting..."
            : quizData.status === "live"
              ? "Quiz is Live (Active)"
              : "Start Quiz"}
        </button>

        {quizData.status === "waiting" && activeParticipants.length === 0 && (
          <p className="waiting-participant-hint">
            Waiting for at least one participant...
          </p>
        )}
      </div>

      <Toast message={toastMessage} />
    </div>
  );
}
