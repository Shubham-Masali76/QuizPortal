import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../services/firebase";
import JoinQuizScreen from "./JoinQuizScreen";
import ParticipantLobby from "./ParticipantLobby";
import { 
  CpuIcon, 
  TrophyIcon, 
  BookIcon, 
  RefreshIcon 
} from "../components/NeonIcons";
import NeonBackground from "../components/NeonBackground";

export default function ParticipantLiveQuizzes({ onBack }) {
  const [liveQuizzes, setLiveQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [joinedSession, setJoinedSession] = useState(null);

  const fetchQuizzes = async () => {
    setLoading(true);
    setError("");

    try {
      const q = query(
        collection(db, "quizzes"),
        where("status", "in", ["waiting", "live"]),
      );

      const querySnapshot = await getDocs(q);

      const quizzesData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        title: doc.data().title,
        description: doc.data().description,
        status: doc.data().status,
      }));

      setLiveQuizzes(quizzesData);
    } catch (err) {
      console.error("Error fetching live quizzes:", err);
      setError("Failed to load live quizzes. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isCancelled = false;

    const loadInitialQuizzes = async () => {
      try {
        const q = query(
          collection(db, "quizzes"),
          where("status", "in", ["waiting", "live"]),
        );

        const querySnapshot = await getDocs(q);

        if (!isCancelled) {
          const quizzesData = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            title: doc.data().title,
            description: doc.data().description,
            status: doc.data().status,
          }));
          setLiveQuizzes(quizzesData);
        }
      } catch (err) {
        if (!isCancelled) {
          console.error("Error loading initial live quizzes:", err);
          setError("Failed to load live quizzes.");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    loadInitialQuizzes();

    return () => {
      isCancelled = true;
    };
  }, []);

  const handleJoinQuiz = (quiz) => {
    setSelectedQuiz(quiz);
  };

  if (joinedSession) {
    return (
      <ParticipantLobby
        quizId={joinedSession.quizId}
        initialTitle={joinedSession.quizTitle}
        participantId={joinedSession.participantId}
        participantName={joinedSession.participantName}
        initialAvatar={joinedSession.participantAvatar}
        onLeave={() => {
          setJoinedSession(null);
          setSelectedQuiz(null);
        }}
      />
    );
  }

  if (selectedQuiz) {
    return (
      <JoinQuizScreen
        selectedQuiz={selectedQuiz}
        onBack={() => setSelectedQuiz(null)}
        onJoined={(session) => setJoinedSession(session)}
      />
    );
  }

  return (
    <div className="neon-theme-wrapper">
      <NeonBackground />
      <div className="neon-mobile-frame">
        {/* Header Bar matching Image 2 */}
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
            onClick={onBack}
          >
            ← Back to Role Selection
          </button>
        </header>

        {/* Section Title & Refresh */}
        <div className="neon-live-quizzes-header">
          <div>
            <h1 className="neon-live-quizzes-title">
              <span className="neon-live-indicator">((•))</span> Live Quizzes
            </h1>
            <p className="neon-live-quizzes-subtitle">
              Quizzes currently available to join
            </p>
          </div>

          <button
            type="button"
            className="neon-pill-btn"
            onClick={fetchQuizzes}
            disabled={loading}
          >
            <RefreshIcon size={14} /> Refresh
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="neon-card" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 0.5rem" }}>
              Loading live quizzes...
            </h3>
            <p style={{ color: "#a1a1aa", fontSize: "0.85rem", margin: 0 }}>
              Scanning for active quiz sessions...
            </p>
          </div>
        ) : error ? (
          <div className="neon-card" style={{ textAlign: "center", padding: "2rem 1.5rem" }}>
            <p style={{ color: "#f87171", fontSize: "0.9rem", marginBottom: "1rem" }}>{error}</p>
            <button
              type="button"
              className="neon-btn-primary"
              onClick={fetchQuizzes}
            >
              Try Again
            </button>
          </div>
        ) : liveQuizzes.length === 0 ? (
          <div className="neon-card" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🎯</div>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              No live quizzes available right now.
            </h3>
            <p style={{ color: "#a1a1aa", fontSize: "0.85rem", marginBottom: "1.5rem", lineHeight: 1.45 }}>
              When a host launches a live quiz, it will automatically appear here.
            </p>
            <button
              type="button"
              className="neon-btn-ghost"
              onClick={fetchQuizzes}
            >
              <RefreshIcon size={16} /> Check Again
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {liveQuizzes.map((quiz, index) => {
              // Alternating icons between Trophy and Book as in Image 2
              const isTrophy = index % 2 === 0;

              return (
                <div className="neon-card neon-quiz-list-item" key={quiz.id}>
                  <div className="neon-quiz-item-top">
                    <div className="neon-quiz-item-icon-box">
                      {isTrophy ? (
                        <TrophyIcon size={22} color="#c084fc" />
                      ) : (
                        <BookIcon size={22} color="#c084fc" />
                      )}
                    </div>
                    <div className="neon-quiz-item-info">
                      <h3 className="neon-quiz-item-title">{quiz.title}</h3>
                      <p className="neon-quiz-item-desc">
                        {quiz.description || "General Knowledge Challenge"}
                      </p>
                      <div className="neon-available-badge">
                        <span className="neon-available-dot" />
                        <span>Available</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="neon-btn-primary"
                    onClick={() => handleJoinQuiz(quiz)}
                  >
                    Join Quiz →
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
