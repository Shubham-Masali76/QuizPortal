import { useState, useEffect, useMemo } from "react";
import { doc, onSnapshot, collection, deleteDoc, updateDoc } from "firebase/firestore";
import {
  ref as rtdbRef,
  onValue as rtdbOnValue,
  set as rtdbSet,
  remove as rtdbRemove,
  onDisconnect as rtdbOnDisconnect,
} from "firebase/database";
import { db, rtdb } from "../services/firebase";
import LobbyReactionsOverlay from "../components/LobbyReactionsOverlay";
import ParticipantReactionBar from "../components/ParticipantReactionBar";
import { generateDynamicAvatar } from "../utils/helpers";
import ParticipantLiveQuiz from "./ParticipantLiveQuiz";

export default function ParticipantLobby({
  quizId,
  initialTitle,
  participantId,
  participantName,
  initialAvatar,
  onLeave,
}) {
  const [participants, setParticipants] = useState([]);
  const [presenceMap, setPresenceMap] = useState({});
  const [quizData, setQuizData] = useState({
    title: initialTitle || "Quiz Lobby",
    status: "waiting",
  });
  const [loading, setLoading] = useState(Boolean(quizId));
  const [error, setError] = useState(quizId ? "" : "No quiz selected.");
  const [isLeaving, setIsLeaving] = useState(false);

  // Active participants: Firestore docs filtered by RTDB presence === 'online'
  const activeParticipants = useMemo(() => {
    return participants.filter((p) => {
      const pres = presenceMap[p.id];
      return pres && (pres === true || pres.state === "online");
    });
  }, [participants, presenceMap]);

  const participantsCount = activeParticipants.length;

  // 1. Manage participant RTDB presence with onDisconnect() and reconnection handling
  useEffect(() => {
    if (!quizId || !participantId) {
      return;
    }

    const presenceRef = rtdbRef(rtdb, `presence/${quizId}/${participantId}`);
    const connectedRef = rtdbRef(rtdb, ".info/connected");

    const unsubConnected = rtdbOnValue(connectedRef, async (snap) => {
      if (snap.val() === true) {
        try {
          // Requirement 3: Register onDisconnect().remove() BEFORE setting online
          await rtdbOnDisconnect(presenceRef).remove();

          // Requirement 4: Set online only after onDisconnect registration succeeds
          await rtdbSet(presenceRef, {
            state: "online",
            joinedAt: Date.now(),
          });
        } catch (err) {
          console.error("Error establishing RTDB presence:", err);
        }
      }
    });

    return () => {
      unsubConnected();
    };
  }, [quizId, participantId]);

  // 2. Listen to RTDB presence for this quiz in real time
  useEffect(() => {
    if (!quizId) {
      return;
    }

    const quizPresenceRef = rtdbRef(rtdb, `presence/${quizId}`);
    const unsubPresence = rtdbOnValue(
      quizPresenceRef,
      (snapshot) => {
        const val = snapshot.val();
        setPresenceMap(val || {});
      },
      (err) => {
        console.error("Error listening to RTDB presence in lobby:", err);
      },
    );

    return () => {
      unsubPresence();
    };
  }, [quizId]);

  // 3. Listen to Firestore quiz details & participant documents
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
          setQuizData({
            title: data.title || initialTitle || "Quiz Lobby",
            status: data.status || "waiting",
          });
          setLoading(false);
        } else {
          setError("This quiz is no longer available.");
          setLoading(false);
        }
      },
      (err) => {
        console.error("Error listening to quiz doc in lobby:", err);
        setError("Failed to load quiz details.");
        setLoading(false);
      },
    );

    const participantsRef = collection(db, "quizzes", quizId, "participants");
    const unsubParticipants = onSnapshot(
      participantsRef,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({
          id: d.id,
          name: d.data().name || "Anonymous",
          avatar: d.data().avatar || "",
          joinedAt: d.data().joinedAt,
        }));
        setParticipants(list);
      },
      (err) => {
        console.error("Error listening to participants in lobby:", err);
      },
    );

    return () => {
      unsubQuiz();
      unsubParticipants();
    };
  }, [quizId, participantId, initialTitle]);

  // 4. Duplicate avatar resolution among ACTIVE participants only
  useEffect(() => {
    const myDoc = activeParticipants.find((p) => p.id === participantId);
    if (!myDoc || !myDoc.avatar) return;

    const duplicates = activeParticipants.filter(
      (p) => p.avatar === myDoc.avatar,
    );
    if (duplicates.length > 1) {
      const sorted = [...duplicates].sort((a, b) => {
        const timeA = a.joinedAt?.toMillis
          ? a.joinedAt.toMillis()
          : a.joinedAt
            ? new Date(a.joinedAt).getTime()
            : 0;
        const timeB = b.joinedAt?.toMillis
          ? b.joinedAt.toMillis()
          : b.joinedAt
            ? new Date(b.joinedAt).getTime()
            : 0;
        if (timeA !== timeB) return timeA - timeB;
        return a.id.localeCompare(b.id);
      });

      if (sorted[0].id !== participantId) {
        const allUsed = new Set(
          activeParticipants.map((p) => p.avatar).filter(Boolean),
        );
        try {
          const freshAvatar = generateDynamicAvatar(allUsed);
          updateDoc(doc(db, "quizzes", quizId, "participants", participantId), {
            avatar: freshAvatar,
          }).catch((err) => {
            console.error("Error resolving avatar collision:", err);
          });
        } catch (err) {
          console.error("Error generating fresh avatar on collision:", err);
        }
      }
    }
  }, [activeParticipants, participantId, quizId]);

  // 5. Explicit Leave handler: cancel onDisconnect, remove RTDB presence, delete Firestore doc
  const handleLeaveLobby = async () => {
    if (isLeaving) return;
    setIsLeaving(true);
    try {
      if (participantId && quizId) {
        const presenceRef = rtdbRef(
          rtdb,
          `presence/${quizId}/${participantId}`,
        );
        try {
          await rtdbOnDisconnect(presenceRef).cancel();
        } catch {
          // ignore if already disconnected
        }
        try {
          await rtdbRemove(presenceRef);
        } catch (e) {
          console.error("Error removing RTDB presence on leave:", e);
        }

        await deleteDoc(
          doc(db, "quizzes", quizId, "participants", participantId),
        );
      }
    } catch (err) {
      console.error("Error leaving lobby:", err);
    } finally {
      setIsLeaving(false);
      onLeave();
    }
  };

  const myDoc =
    activeParticipants.find((p) => p.id === participantId) ||
    participants.find((p) => p.id === participantId);
  const myAvatar = myDoc?.avatar || initialAvatar || "";

  if (loading) {
    return (
      <div className="participant-lobby-page">
        <div className="participant-lobby-card">
          <div className="role-logo">QuizPortal</div>
          <h2>Connecting to Lobby...</h2>
          <p className="lobby-loading-text">
            Joining {initialTitle || "quiz"}...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="participant-lobby-page">
        <div className="participant-lobby-card">
          <div className="role-logo">QuizPortal</div>
          <h2>Quiz Unavailable</h2>
          <p className="lobby-error-text">{error}</p>
          <button
            type="button"
            className="primary-btn lobby-back-btn"
            onClick={handleLeaveLobby}
          >
            ← Back to Live Quizzes
          </button>
        </div>
      </div>
    );
  }

  if (quizData.status === "live") {
    return (
      <ParticipantLiveQuiz 
        quizId={quizId} 
        participantId={participantId} 
        onLeave={handleLeaveLobby} 
      />
    );
  }

  return (
    <div className="participant-lobby-page">
      <LobbyReactionsOverlay quizId={quizId} />
      <header className="participant-lobby-header">
        <div className="participant-logo">QuizPortal</div>
        <button
          type="button"
          className="secondary-btn lobby-top-leave-btn"
          onClick={handleLeaveLobby}
          disabled={isLeaving}
        >
          {isLeaving ? "Leaving..." : "← Leave Quiz"}
        </button>
      </header>

      <main className="participant-lobby-main">
        <div className="participant-lobby-card">
          <div className="lobby-status-badge-wrap">
            <span className={`quiz-status ${quizData.status}`}>
              {quizData.status === "waiting"
                ? "Waiting for Host"
                : quizData.status === "live"
                  ? "Quiz is Live"
                  : quizData.status === "finished"
                    ? "Finished"
                    : "Draft"}
            </span>
          </div>

          <h1 className="lobby-quiz-title">{quizData.title}</h1>

          <div className="lobby-participant-info">
            {myAvatar && (
              <span className="lobby-participant-avatar">{myAvatar}</span>
            )}
            <span className="lobby-participant-label">You joined as:</span>
            <span className="lobby-participant-name">{participantName}</span>
          </div>

          <div className="lobby-counter-card">
            <div className="lobby-counter-number">{participantsCount}</div>
            <div className="lobby-counter-label">
              {participantsCount === 1
                ? "Participant in Lobby"
                : "Participants in Lobby"}
            </div>
          </div>

          <ParticipantReactionBar
            quizId={quizId}
            participantId={participantId}
          />

          {quizData.status === "waiting" && (
            <div className="lobby-message-card waiting-state">
              <h3>Waiting for the host to start the quiz...</h3>
              <p>
                You are in! As soon as the host starts the quiz, questions will
                appear here.
              </p>
            </div>
          )}

          {quizData.status === "live" && (
            <div className="lobby-message-card live-state">
              <h3>Quiz is starting!</h3>
              <p>The host has started the quiz. Please get ready!</p>
            </div>
          )}

          {quizData.status === "finished" && (
            <div className="lobby-message-card finished-state">
              <h3>This quiz has finished</h3>
              <p>The host has ended this quiz session.</p>
              <button
                type="button"
                className="primary-btn"
                onClick={handleLeaveLobby}
              >
                Back to Live Quizzes
              </button>
            </div>
          )}

          <div className="lobby-footer-action">
            <button
              type="button"
              className="lobby-exit-link"
              onClick={handleLeaveLobby}
              disabled={isLeaving}
            >
              Leave Lobby
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
