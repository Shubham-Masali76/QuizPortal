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
import { CpuIcon } from "../components/NeonIcons";
import NeonBackground from "../components/NeonBackground";

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
  const handleLeaveLobby = () => {
    if (isLeaving) return;
    setIsLeaving(true);

    const pId = participantId;
    const qId = quizId;

    // Immediately transition out so the participant instantly returns to Live Quizzes
    onLeave();

    // Clean up RTDB presence and participant doc non-blocking in background
    if (pId && qId) {
      try {
        const presenceRef = rtdbRef(rtdb, `presence/${qId}/${pId}`);
        rtdbOnDisconnect(presenceRef).cancel().catch(() => {});
        rtdbRemove(presenceRef).catch(() => {});
        deleteDoc(doc(db, "quizzes", qId, "participants", pId)).catch(() => {});
      } catch (err) {
        console.error("Error cleaning up on leave:", err);
      }
    }
  };

  const myDoc =
    activeParticipants.find((p) => p.id === participantId) ||
    participants.find((p) => p.id === participantId);
  const myAvatar = myDoc?.avatar || initialAvatar || "";

  if (loading) {
    return (
      <div className="neon-theme-wrapper neon-centered-wrapper">
        <NeonBackground />
        <div className="neon-mobile-frame neon-centered-frame">
          <header className="neon-header-bar">
            <div className="neon-brand-badge">
              <CpuIcon size={26} />
              <div className="neon-brand-text">
                <span className="neon-brand-org">AWS STUDENT BUILDER GROUP</span>
                <span className="neon-brand-sub">AT NKOCET</span>
              </div>
            </div>
          </header>

          <div className="neon-card" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
            <div
              className="neon-loading-spinner"
              style={{
                margin: "0 auto 1.5rem",
                width: "42px",
                height: "42px",
                border: "3px solid rgba(192, 132, 252, 0.2)",
                borderTopColor: "#a855f7",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <h2 style={{ fontSize: "1.3rem", fontWeight: 700, color: "#ffffff", marginBottom: "0.5rem" }}>
              Connecting to Lobby...
            </h2>
            <p style={{ color: "#a1a1aa", fontSize: "0.88rem", margin: 0 }}>
              Joining {initialTitle || "quiz"}...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="neon-theme-wrapper neon-centered-wrapper">
        <NeonBackground />
        <div className="neon-mobile-frame neon-centered-frame">
          <header className="neon-header-bar">
            <div className="neon-brand-badge">
              <CpuIcon size={26} />
              <div className="neon-brand-text">
                <span className="neon-brand-org">AWS STUDENT BUILDER GROUP</span>
                <span className="neon-brand-sub">AT NKOCET</span>
              </div>
            </div>
            <button
              type="button"
              className="neon-pill-btn"
              onClick={handleLeaveLobby}
            >
              ← Back
            </button>
          </header>

          <div className="neon-card" style={{ textAlign: "center", padding: "2.75rem 1.5rem" }}>
            <div style={{ fontSize: "2.75rem", marginBottom: "1rem" }}>⚠️</div>
            <div className="neon-badge-pulse" style={{ display: "inline-flex", marginBottom: "1rem" }}>
              ● SESSION UNAVAILABLE
            </div>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#ffffff", marginBottom: "0.75rem" }}>
              Quiz Unavailable
            </h2>
            <p
              style={{
                color: "#a1a1aa",
                fontSize: "0.9rem",
                lineHeight: 1.5,
                maxWidth: "320px",
                margin: "0 auto 2rem",
              }}
            >
              {error || "This quiz is no longer available or was removed by the host."}
            </p>
            <button
              type="button"
              className="neon-btn-primary"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={handleLeaveLobby}
            >
              ← Back to Live Quizzes
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (quizData.status === "live" || quizData.status === "completed") {
    return (
      <ParticipantLiveQuiz 
        quizId={quizId} 
        participantId={participantId} 
        quizTitle={quizData.title}
        onLeave={handleLeaveLobby} 
      />
    );
  }

  return (
    <div className="neon-theme-wrapper neon-centered-wrapper">
      <NeonBackground />
      <LobbyReactionsOverlay quizId={quizId} />

      <div className="neon-mobile-frame neon-centered-frame">
        <header className="neon-header-bar">
          <div className="neon-brand-badge">
            <CpuIcon size={26} />
            <div className="neon-brand-text">
              <span className="neon-brand-org">AWS STUDENT BUILDER GROUP</span>
              <span className="neon-brand-sub">AT NKOCET</span>
            </div>
          </div>
          <button
            type="button"
            className="neon-pill-btn"
            onClick={handleLeaveLobby}
            disabled={isLeaving}
          >
            {isLeaving ? "Leaving..." : "← Leave Quiz"}
          </button>
        </header>

        <div className="neon-card participant-lobby-card">
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
                className="neon-btn-primary"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={handleLeaveLobby}
              >
                Back to Live Quizzes
              </button>
            </div>
          )}

          <div className="lobby-footer-action">
            <button
              type="button"
              className="neon-btn-ghost"
              style={{ width: "100%", justifyContent: "center", borderColor: "rgba(239, 68, 68, 0.3)", color: "#f87171" }}
              onClick={handleLeaveLobby}
              disabled={isLeaving}
            >
              {isLeaving ? "Leaving..." : "Leave Lobby"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
