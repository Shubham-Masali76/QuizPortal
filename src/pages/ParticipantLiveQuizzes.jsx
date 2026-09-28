import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../services/firebase";
import JoinQuizScreen from "./JoinQuizScreen";
import ParticipantLobby from "./ParticipantLobby";

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
          console.error("Error fetching live quizzes:", err);
          setError("Failed to load live quizzes. Please try again.");
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
    <div className="participant-page">
      <header className="participant-header">
        <div className="participant-header-content">
          <div className="participant-logo">QuizPortal</div>
          <button
            type="button"
            className="secondary-btn participant-back-btn"
            onClick={onBack}
          >
            ← Back to Role Selection
          </button>
        </div>
      </header>

      <main className="participant-main">
        <div className="participant-intro">
          <div>
            <h1>Live Quizzes</h1>
            <p>Quizzes currently available to join</p>
          </div>

          <button
            type="button"
            className="refresh-quizzes-btn"
            onClick={fetchQuizzes}
            disabled={loading}
          >
            ↻ Refresh
          </button>
        </div>

        {loading ? (
          <div className="participant-loading">
            <h2>Loading live quizzes...</h2>
          </div>
        ) : error ? (
          <div className="participant-error-box">
            <p>{error}</p>
            <button
              type="button"
              className="primary-btn"
              onClick={fetchQuizzes}
            >
              Try Again
            </button>
          </div>
        ) : liveQuizzes.length === 0 ? (
          <div className="participant-empty-card">
            <div className="empty-icon">🎯</div>
            <h3>No live quizzes are available right now.</h3>
            <p>
              When a host starts hosting a quiz, it will appear here. Click
              Refresh to check again!
            </p>
            <button
              type="button"
              className="secondary-btn"
              onClick={fetchQuizzes}
            >
              ↻ Check Again
            </button>
          </div>
        ) : (
          <div className="participant-quiz-grid">
            {liveQuizzes.map((quiz) => (
              <div className="participant-quiz-card" key={quiz.id}>
                <div className="participant-quiz-info">
                  <h3>{quiz.title}</h3>
                  <p>{quiz.description}</p>
                </div>

                <div className="participant-card-status">
                  <span className="available-badge">🟢 Available</span>
                </div>

                <button
                  type="button"
                  className="primary-btn join-quiz-btn"
                  onClick={() => handleJoinQuiz(quiz)}
                >
                  Join Quiz →
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
