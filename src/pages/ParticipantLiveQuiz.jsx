import { useState, useEffect } from "react";
import { doc, onSnapshot, collection, getDocs, getDoc } from "firebase/firestore";
import { db } from "../services/firebase";
import { submitResponseRTDB } from "../utils/helpers";
import { 
  CpuIcon, 
  TrophyIcon, 
  CheckCircleIcon, 
  XCircleIcon 
} from "../components/NeonIcons";
import NeonBackground from "../components/NeonBackground";

export default function ParticipantLiveQuiz({ quizId, participantId, quizTitle: initialTitle, onLeave }) {
  const [questions, setQuestions] = useState([]);
  const [quizState, setQuizState] = useState({
    currentQuestionIndex: 0,
    questionStatus: "loading", // answering, results, question_leaderboard, closed
    status: "live",
  });
  const [quizInfo, setQuizInfo] = useState({
    title: initialTitle || "Knowledge Quiz",
    questionTimeLimit: 20,
  });
  const [selectedOption, setSelectedOption] = useState(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [participantData, setParticipantData] = useState(null);

  // Fetch quiz meta and questions
  useEffect(() => {
    const fetchQuizDetails = async () => {
      try {
        const qDoc = await getDoc(doc(db, "quizzes", quizId));
        if (qDoc.exists()) {
          const d = qDoc.data();
          setQuizInfo({
            title: d.title || initialTitle || "Knowledge Quiz",
            questionTimeLimit: d.questionTimeLimit || d.answeringTimeLimit || 20,
          });
        }

        const qSnap = await getDocs(collection(db, "quizzes", quizId, "questions"));
        const qList = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setQuestions(qList);
      } catch (err) {
        console.error("Error fetching quiz questions:", err);
      }
    };
    fetchQuizDetails();
  }, [quizId, initialTitle]);

  // Listen to this participant's document for rank & score
  useEffect(() => {
    const pRef = doc(db, "quizzes", quizId, "participants", participantId);
    const unsub = onSnapshot(pRef, (docSnap) => {
      if (docSnap.exists()) {
        setParticipantData({ id: docSnap.id, ...docSnap.data() });
      }
    });
    return () => unsub();
  }, [quizId, participantId]);

  // Live timer interval
  useEffect(() => {
    let timer;
    if (quizState?.phaseEndTime && quizState.questionStatus === "answering") {
      let currentRemaining = Math.max(0, Math.floor((quizState.phaseEndTime - Date.now()) / 1000));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTimeLeft(currentRemaining);
      
      timer = setInterval(() => {
        currentRemaining -= 1;
        setTimeLeft(Math.max(0, currentRemaining));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [quizState?.phaseEndTime, quizState?.questionStatus]);

  // Listen to live quiz state
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "quizzes", quizId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setQuizState({
          currentQuestionIndex: data.currentQuestionIndex || 0,
          questionStatus: data.questionStatus || "answering",
          status: data.status,
          phaseEndTime: data.phaseEndTime || null,
        });
        if (data.questionTimeLimit || data.answeringTimeLimit) {
          setQuizInfo(prev => ({
            ...prev,
            questionTimeLimit: data.questionTimeLimit || data.answeringTimeLimit || 20,
          }));
        }
      }
    });
    return () => unsub();
  }, [quizId]);

  // Reset selection on question change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedOption(null);
    setHasSubmitted(false);
  }, [quizState.currentQuestionIndex]);

  const handleSelectOption = async (optionIndex) => {
    if (hasSubmitted || quizState.questionStatus !== "answering") return;
    
    setSelectedOption(optionIndex);
    setHasSubmitted(true);

    const optionNumber = optionIndex + 1;

    try {
      await submitResponseRTDB(quizId, quizState.currentQuestionIndex, participantId, optionNumber);
    } catch (err) {
      console.error("Error saving response:", err);
      setSelectedOption(null);
      setHasSubmitted(false);
      alert("Error saving response: " + err.message);
    }
  };

  const optionLetters = ["A", "B", "C", "D", "E", "F"];
  const totalLimit = quizInfo.questionTimeLimit || 20;
  const radius = 26;
  const circumference = 2 * Math.PI * radius; // ~163.36
  const strokeOffset = circumference - (Math.min(timeLeft, totalLimit) / totalLimit) * circumference;
  const progressPercent = Math.max(0, Math.min(100, (timeLeft / totalLimit) * 100));
  const isUrgent = timeLeft <= 5 && quizState.questionStatus === "answering";

  if (questions.length === 0 || quizState.questionStatus === "loading") {
    return (
      <div className="neon-theme-wrapper neon-centered-wrapper">
        <NeonBackground />
        <div className="neon-mobile-frame neon-centered-frame" style={{ justifyContent: "center", alignItems: "center" }}>
          <div className="neon-card" style={{ textAlign: "center", width: "100%" }}>
            <h2 style={{ fontSize: "1.3rem", fontWeight: 700, margin: "1rem 0" }}>Loading question...</h2>
            <p style={{ color: "#a1a1aa", fontSize: "0.9rem" }}>Please wait while the challenge synchronizes.</p>
          </div>
        </div>
      </div>
    );
  }

  if (quizState.status === "completed") {
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
          <div className="neon-card" style={{ textAlign: "center", padding: "2.5rem 1.5rem" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🏆</div>
            <h2 style={{ fontSize: "1.6rem", fontWeight: 800, marginBottom: "0.5rem" }}>Quiz Completed!</h2>
            <p style={{ color: "#a1a1aa", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
              Look at the host screen for the podium and final rankings.
            </p>
            <div style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: "14px", padding: "1.25rem", marginBottom: "2rem" }}>
              <div style={{ fontSize: "0.85rem", color: "#c084fc", fontWeight: 600 }}>Your Final Score</div>
              <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "#ffffff", margin: "0.25rem 0" }}>
                {participantData?.score || 0} <span style={{ fontSize: "1.2rem", color: "#a855f7" }}>pts</span>
              </div>
              <div style={{ fontSize: "0.9rem", color: "#d4d4d8" }}>
                Rank: <strong style={{ color: "#34d399" }}>#{participantData?.rank || "-"}</strong>
              </div>
            </div>
            <button className="neon-btn-primary" onClick={onLeave}>
              Leave Quiz
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[quizState.currentQuestionIndex];
  const isResultsPhase = quizState.questionStatus === "results";
  const correctAnswerIndex = (currentQuestion?.correctAnswer || 1) - 1;

  return (
    <div className="neon-theme-wrapper neon-centered-wrapper">
      <NeonBackground />
      <div className="neon-mobile-frame neon-centered-frame">
        {/* Top Header Bar matching Images 4 & 5 */}
        <header className="neon-header-bar">
          <div className="neon-brand-badge">
            <CpuIcon size={26} />
            <div className="neon-brand-text">
              <span className="neon-brand-org">AWS STUDENT BUILDER GROUP</span>
              <span className="neon-brand-sub">AT NKOCET</span>
            </div>
          </div>
          <button type="button" className="neon-pill-btn" onClick={onLeave}>
            ← Leave Quiz
          </button>
        </header>

        {/* Core Question & Answering Card (Images 4 & 5) */}
        <div className="neon-card neon-quiz-card">
          {/* Header row: Q 1/10 | Circular Timer | Trophy Info */}
          <div className="neon-question-header-row">
            <span className="neon-q-pill">
              Q {quizState.currentQuestionIndex + 1} / {questions.length}
            </span>

            {/* Circular SVG Gauge Timer */}
            <div className="neon-timer-circle-widget">
              <svg className="neon-timer-svg" viewBox="0 0 64 64">
                <circle
                  className="neon-timer-bg-ring"
                  cx="32"
                  cy="32"
                  r={radius}
                />
                <circle
                  className={`neon-timer-progress-ring ${isUrgent ? "urgent" : ""}`}
                  cx="32"
                  cy="32"
                  r={radius}
                  style={{
                    strokeDasharray: circumference,
                    strokeDashoffset: isResultsPhase ? 0 : strokeOffset,
                  }}
                />
              </svg>
              <span className={`neon-timer-number ${isUrgent ? "urgent" : ""}`}>
                {isResultsPhase ? "0" : timeLeft}
              </span>
            </div>

            {/* Quiz Title & Trophy */}
            <div className="neon-quiz-badge">
              <TrophyIcon size={18} color="#c084fc" />
              <div className="neon-quiz-badge-text">
                <span className="neon-quiz-badge-sub">AWS</span>
                <span className="neon-quiz-badge-title" title={quizInfo.title}>
                  {quizInfo.title}
                </span>
              </div>
            </div>
          </div>

          {/* Horizontal Progress Bar */}
          <div className="neon-progress-bar-track">
            <div
              className="neon-progress-bar-fill"
              style={{
                width: isResultsPhase ? "0%" : `${progressPercent}%`,
              }}
            />
          </div>

          {/* Question Text Box */}
          <div className="neon-question-box">
            <p className="neon-question-text">{currentQuestion?.question}</p>
          </div>

          {/* Vertical Stacked Options List */}
          <div className="neon-options-list">
            {currentQuestion?.options?.map((opt, idx) => {
              const isSelected = selectedOption === idx;
              const isCorrect = idx === correctAnswerIndex;
              const isWrongPick = isSelected && !isCorrect;

              let optionClasses = "neon-option-item";

              if (isResultsPhase) {
                if (isCorrect) {
                  optionClasses += " is-correct";
                } else if (isWrongPick) {
                  optionClasses += " is-incorrect";
                } else {
                  optionClasses += " is-dimmed";
                }
              } else if (isSelected) {
                optionClasses += " selected";
              }

              return (
                <button
                  key={idx}
                  type="button"
                  className={optionClasses}
                  onClick={() => handleSelectOption(idx)}
                  disabled={hasSubmitted || isResultsPhase}
                >
                  <div className="neon-option-left">
                    <span className="neon-option-letter">
                      {optionLetters[idx] || idx + 1}
                    </span>
                    <span>{opt}</span>
                  </div>

                  {/* Result status icon indicator (Image 5) */}
                  {isResultsPhase && (
                    <div className="neon-option-right-icon">
                      {isCorrect && <CheckCircleIcon size={20} />}
                      {isWrongPick && <XCircleIcon size={20} />}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Dynamic Status / Feedback Toast */}
          {!isResultsPhase && hasSubmitted && (
            <div className="neon-status-toast">
              <span>✓ Answer locked! Waiting for timer to end...</span>
            </div>
          )}

          {isResultsPhase && (
            <div 
              className="neon-status-toast"
              style={{
                background: participantData?.lastPointsEarned > 0 ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                borderColor: participantData?.lastPointsEarned > 0 ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)",
                color: participantData?.lastPointsEarned > 0 ? "#34d399" : "#f87171",
              }}
            >
              {participantData?.lastPointsEarned > 0 ? (
                <span>
                  🎉 Correct! +{participantData.lastPointsEarned} pts
                  {participantData?.lastResponseTimeMs !== undefined && (
                    <small style={{ display: "block", color: "#a1a1aa", fontSize: "0.75rem", marginTop: "2px" }}>
                      Speed: {(participantData.lastResponseTimeMs / 1000).toFixed(2)}s
                    </small>
                  )}
                </span>
              ) : (
                <span>
                  ✕ Incorrect! Next question starting soon...
                </span>
              )}
            </div>
          )}

          {quizState.questionStatus === "question_leaderboard" && (
            <div className="neon-status-toast" style={{ marginTop: "1rem", color: "#c084fc", borderColor: "rgba(168,85,247,0.4)" }}>
              <span>🏆 Current Rank: <strong>#{participantData?.rank || "-"}</strong> • Total: <strong>{participantData?.score || 0} pts</strong></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
