import { useState, useEffect, useMemo } from "react";
import { doc, onSnapshot, collection, updateDoc, getDocs, writeBatch } from "firebase/firestore";
import { ref as rtdbRef, onValue as rtdbOnValue, remove as rtdbRemove } from "firebase/database";
import { db, rtdb } from "../services/firebase";
import ParticipantAvatarCluster from "../components/ParticipantAvatarCluster";
import Toast from "../components/Toast";
import { sortQuestions } from "../utils/helpers";
import NeonBackground from "../components/NeonBackground";
import { CpuIcon, UsersIcon } from "../components/NeonIcons";

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
  const [questionTimeLimit, setQuestionTimeLimit] = useState(20);

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
      const timeLimit = questionTimeLimit || 20;

      // Fetch questions and establish definitive questionOrder and order index
      const qSnap = await getDocs(collection(db, "quizzes", quizId, "questions"));
      const qList = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const sortedQuestions = sortQuestions(qList, quizData?.questionOrder);
      const questionOrder = sortedQuestions.map(q => q.id);
      const firstQId = sortedQuestions[0]?.id || null;

      // Ensure every question has order field in Firestore
      const qBatch = writeBatch(db);
      let needsQUpdate = false;
      sortedQuestions.forEach((q, idx) => {
        if (q.order !== idx) {
          needsQUpdate = true;
          qBatch.update(doc(db, "quizzes", quizId, "questions", q.id), { order: idx });
        }
      });
      if (needsQUpdate) {
        await qBatch.commit();
      }

      const prepDuration = 3;
      await updateDoc(doc(db, "quizzes", quizId), {
        status: "live",
        currentQuestionIndex: 0,
        currentQuestionId: firstQId,
        questionOrder: questionOrder,
        questionStatus: "preparing",
        phaseEndTime: Date.now() + (prepDuration * 1000) + 200,
        questionTimeLimit: timeLimit,
        answeringTimeLimit: timeLimit,
      });

      // Reset active participants in Firestore for a clean game, and purge stale/offline participants
      const pSnap = await getDocs(collection(db, "quizzes", quizId, "participants"));
      if (!pSnap.empty) {
        const activeIds = new Set(activeParticipants.map(p => p.id));
        const chunkedBatches = [];
        let currentBatch = writeBatch(db);
        let count = 0;
        pSnap.docs.forEach(pDoc => {
          if (count >= 480) {
            chunkedBatches.push(currentBatch);
            currentBatch = writeBatch(db);
            count = 0;
          }
          if (activeIds.has(pDoc.id)) {
            currentBatch.update(pDoc.ref, {
              score: 0,
              rank: 1,
              lastPointsEarned: 0,
              correctAnswersCount: 0,
              totalResponseTimeMs: 0,
              lastResponseTimeMs: 0,
            });
          } else {
            // Delete ghost/stale participant who is not in the waiting room
            currentBatch.delete(pDoc.ref);
          }
          count++;
        });
        if (count > 0) chunkedBatches.push(currentBatch);
        for (const b of chunkedBatches) {
          await b.commit();
        }
      }

      // Clear responses in RTDB
      try {
        await rtdbRemove(rtdbRef(rtdb, `responses/${quizId}`));
      } catch (e) {
        console.warn("Could not clear RTDB responses", e);
      }

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
      <div className="neon-theme-wrapper neon-centered-wrapper">
        <NeonBackground />
        <div className="neon-host-frame" style={{ alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
          <div className="neon-card" style={{ textAlign: "center", padding: "3rem" }}>
            <h2 style={{ fontSize: "1.8rem", fontWeight: 800, marginBottom: "0.5rem" }}>Loading Waiting Room...</h2>
            <p style={{ color: "#a1a1aa" }}>Preparing lobby and synchronizing participant network...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="neon-theme-wrapper neon-centered-wrapper">
        <NeonBackground />
        <div className="neon-host-frame" style={{ alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
          <div className="neon-card" style={{ textAlign: "center", padding: "3rem" }}>
            <h2 style={{ fontSize: "1.8rem", fontWeight: 800, color: "#f87171", marginBottom: "1rem" }}>Session Error</h2>
            <p style={{ color: "#a1a1aa", marginBottom: "2rem" }}>{error}</p>
            <button className="neon-btn-primary" onClick={() => setPage("quizzes")}>
              ← Back to My Quizzes
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="neon-theme-wrapper">
      <NeonBackground />
      <div className="neon-host-frame">
        <header className="neon-host-header">
          <div className="neon-brand-badge">
            <CpuIcon size={28} />
            <div className="neon-brand-text">
              <span className="neon-brand-org">AWS STUDENT BUILDER GROUP</span>
              <span className="neon-brand-sub">AT NKOCET • WAITING ROOM</span>
            </div>
          </div>

          <div className="neon-host-top-badges">
            <button type="button" className="neon-pill-btn" onClick={() => setPage("editor")}>
              ← Back to Quiz Editor
            </button>
            <button type="button" className="neon-pill-btn" onClick={() => setPage("quizzes")}>
              My Quizzes
            </button>
          </div>
        </header>

        <div className="neon-host-card" style={{ padding: '2.5rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 900, color: '#ffffff', marginBottom: '0.5rem' }}>
            {quizData.title}
          </h1>
          {quizData.description && (
            <p style={{ color: '#a1a1aa', fontSize: '1.05rem', margin: '0 auto 1.5rem', maxWidth: '640px' }}>
              {quizData.description}
            </p>
          )}

          {/* Large Cyber Quiz Join Code Display */}
          <div className="neon-waiting-code-display">
            <div style={{ textAlign: 'left' }}>
              <div className="neon-code-label">SHARE CODE WITH PARTICIPANTS:</div>
              <div className="neon-code-value">{quizData.quizCode || "------"}</div>
            </div>
            <button 
              type="button" 
              className="neon-btn-primary" 
              onClick={handleCopyCode}
              style={{ width: 'auto', padding: '0.85rem 1.8rem', fontSize: '1rem' }}
            >
              {copied ? "✓ Copied to Clipboard!" : "Copy Join Code 📋"}
            </button>
          </div>

          {/* Live Participant Count Pill */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 18px', borderRadius: '9999px', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.35)', color: '#38bdf8', fontWeight: 700, fontSize: '0.95rem', margin: '0 auto 1.5rem' }}>
            <UsersIcon size={18} />
            <span>{activeParticipants.length} {activeParticipants.length === 1 ? 'Participant' : 'Participants'} Connected</span>
          </div>

          {/* Participant Avatar Cluster */}
          <ParticipantAvatarCluster
            activeParticipants={activeParticipants}
            quizId={quizId}
          />

          {/* Quiz Settings */}
          <div className="neon-settings-box">
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff' }}>Countdown Timer</div>
              <div style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>Seconds allowed per question for all participants</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input 
                type="number" 
                min="5" 
                max="300"
                className="neon-settings-input"
                value={questionTimeLimit} 
                onChange={(e) => setQuestionTimeLimit(Number(e.target.value))}
              />
              <span style={{ color: '#c084fc', fontWeight: 700 }}>sec</span>
            </div>
          </div>

          {/* Start Quiz Action */}
          <div style={{ marginTop: '2.5rem' }}>
            <button
              type="button"
              className="neon-btn-primary"
              onClick={handleStartQuiz}
              disabled={
                isStarting ||
                quizData.status !== "waiting" ||
                activeParticipants.length === 0
              }
              style={{
                padding: '1.1rem 3rem',
                fontSize: '1.25rem',
                maxWidth: '420px',
                margin: '0 auto',
              }}
            >
              {isStarting
                ? "Starting Live Session..."
                : quizData.status === "live"
                  ? "Quiz is Live (Active)"
                  : "Launch Live Quiz 🚀"}
            </button>

            {quizData.status === "waiting" && activeParticipants.length === 0 && (
              <p style={{ color: '#a1a1aa', marginTop: '1.25rem', fontSize: '0.95rem' }}>
                Waiting for at least one participant to enter with code <strong style={{ color: '#c084fc' }}>{quizData.quizCode}</strong>...
              </p>
            )}
          </div>
        </div>
      </div>
      <Toast message={toastMessage} />
    </div>
  );
}

