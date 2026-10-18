import { useState, useEffect, useMemo, useRef } from "react";
import { doc, onSnapshot, collection, getDocs, getDoc, query } from "firebase/firestore";
import { ref as rtdbRef, onValue as rtdbOnValue, set as rtdbSet, onDisconnect as rtdbOnDisconnect } from "firebase/database";
import { db, rtdb } from "../services/firebase";
import { submitResponseRTDB, sortQuestions, sortParticipants } from "../utils/helpers";
import { 
  CpuIcon, 
  TrophyIcon, 
  CheckCircleIcon 
} from "../components/NeonIcons";
import NeonBackground from "../components/NeonBackground";
import NeonConfetti from "../components/NeonConfetti";

export default function ParticipantLiveQuiz({ quizId, participantId, quizTitle: initialTitle, onLeave }) {
  const [rawQuestions, setRawQuestions] = useState([]);
  const [quizState, setQuizState] = useState({
    currentQuestionIndex: 0,
    currentQuestionId: null,
    questionOrder: null,
    questionStatus: "loading", // preparing, answering, results, question_leaderboard, closed
    status: "live",
  });
  const [quizInfo, setQuizInfo] = useState({
    title: initialTitle || "Knowledge Quiz",
    questionTimeLimit: 20,
  });

  const questions = useMemo(() => {
    return sortQuestions(rawQuestions, quizState.questionOrder);
  }, [rawQuestions, quizState.questionOrder]);

  const [selectedOption, setSelectedOption] = useState(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [participantData, setParticipantData] = useState(null);
  const [allParticipants, setAllParticipants] = useState([]);

  // Track rank delta across rounds
  const prevRankRef = useRef(null);
  const [rankMovement, setRankMovement] = useState(null);

  // Maintain RTDB presence in live quiz
  useEffect(() => {
    if (!quizId || !participantId) return;

    const presenceRef = rtdbRef(rtdb, `presence/${quizId}/${participantId}`);
    const connectedRef = rtdbRef(rtdb, ".info/connected");

    const unsubConnected = rtdbOnValue(connectedRef, async (snap) => {
      if (snap.val() === true) {
        try {
          await rtdbOnDisconnect(presenceRef).remove();
          await rtdbSet(presenceRef, {
            state: "online",
            joinedAt: Date.now(),
          });
        } catch (err) {
          console.error("Error maintaining RTDB presence during quiz:", err);
        }
      }
    });

    return () => {
      unsubConnected();
    };
  }, [quizId, participantId]);

  // Fetch quiz meta and questions
  useEffect(() => {
    const fetchQuizDetails = async () => {
      try {
        const qDoc = await getDoc(doc(db, "quizzes", quizId));
        if (qDoc.exists()) {
          const d = qDoc.data();
          if (d.questionOrder) {
            setQuizState(prev => ({ ...prev, questionOrder: d.questionOrder }));
          }
          setQuizInfo({
            title: d.title || initialTitle || "Knowledge Quiz",
            questionTimeLimit: d.questionTimeLimit || d.answeringTimeLimit || 20,
          });
        }

        const qSnap = await getDocs(collection(db, "quizzes", quizId, "questions"));
        const qList = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setRawQuestions(qList);
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

  // Listen to all participants for standings scoreboard
  useEffect(() => {
    const q = query(collection(db, "quizzes", quizId, "participants"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort(sortParticipants);
      setAllParticipants(list);
    });
    return () => unsub();
  }, [quizId]);

  // Record baseline rank before new question starts
  useEffect(() => {
    if (quizState.questionStatus === "preparing" && participantData?.rank) {
      prevRankRef.current = Number(participantData.rank);
    }
  }, [quizState.questionStatus, participantData?.rank]);

  // Calculate rank movement delta on results/leaderboard
  useEffect(() => {
    if (participantData?.rank !== undefined && participantData?.rank !== null) {
      const currentRank = Number(participantData.rank);
      if (prevRankRef.current !== null && prevRankRef.current !== currentRank) {
        const delta = prevRankRef.current - currentRank;
        if (delta > 0) {
          setRankMovement({ delta, direction: "up", label: `▲ Up ${delta} ${delta === 1 ? 'place' : 'places'}` });
        } else if (delta < 0) {
          setRankMovement({ delta: Math.abs(delta), direction: "down", label: `▼ Down ${Math.abs(delta)} ${Math.abs(delta) === 1 ? 'place' : 'places'}` });
        } else {
          setRankMovement({ delta: 0, direction: "same", label: `● Maintained Rank #${currentRank}` });
        }
      } else {
        setRankMovement({ delta: 0, direction: "same", label: `● Position: Rank #${currentRank}` });
      }
    }
  }, [participantData?.rank]);

  // Synchronized live timer interval (answering and preparing countdown)
  useEffect(() => {
    let timer;
    if (quizState?.phaseEndTime && (quizState.questionStatus === "answering" || quizState.questionStatus === "preparing")) {
      const updateRemaining = () => {
        const remaining = Math.max(0, Math.floor((quizState.phaseEndTime - Date.now()) / 1000));
        setTimeLeft(remaining);
      };
      updateRemaining();
      timer = setInterval(updateRemaining, 250);
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
          currentQuestionId: data.currentQuestionId || null,
          questionOrder: data.questionOrder || null,
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

  // Reset selection on question change and remove focus ring
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedOption(null);
    setHasSubmitted(false);
    if (typeof document !== "undefined" && document.activeElement && typeof document.activeElement.blur === "function") {
      document.activeElement.blur();
    }
  }, [quizState.currentQuestionIndex, quizState.currentQuestionId]);

  const currentQuestion = (quizState?.currentQuestionId && questions.find(q => q.id === quizState.currentQuestionId)) 
    || questions[quizState.currentQuestionIndex] 
    || null;
  const isResultsPhase = quizState.questionStatus === "results";
  const correctAnswerIndex = (currentQuestion?.correctAnswer || 1) - 1;

  const handleSelectOption = async (optionIndex) => {
    if (hasSubmitted || quizState.questionStatus !== "answering") return;
    
    setSelectedOption(optionIndex);
    setHasSubmitted(true);

    const optionNumber = optionIndex + 1;

    try {
      await submitResponseRTDB(quizId, quizState.currentQuestionIndex, participantId, optionNumber, currentQuestion?.id);
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

  // Initial loading state
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

  // Final Completed Stage with Confetti and Grand Achievement Badges
  if (quizState.status === "completed") {
    const finalRank = participantData?.rank || 1;
    const isGold = finalRank === 1;
    const isSilver = finalRank === 2;
    const isBronze = finalRank === 3;
    const isTop10 = finalRank <= 10;

    return (
      <div className="neon-theme-wrapper neon-centered-wrapper">
        <NeonConfetti />
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

          <div className="neon-card neon-participant-result-card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: "3.5rem", marginBottom: "0.5rem" }}>
              {isGold ? "👑" : isSilver ? "🥈" : isBronze ? "🥉" : "🎖️"}
            </div>
            
            <div className={`neon-result-outcome-badge ${isGold || isTop10 ? 'correct' : 'timeout'}`} style={{ marginBottom: '1.25rem' }}>
              <h2 className="neon-outcome-title">
                {isGold ? "CHAMPION! 1ST PLACE" : isSilver ? "2ND PLACE RUNNER UP" : isBronze ? "3RD PLACE PODIUM" : `QUIZ FINISHER • RANK #${finalRank}`}
              </h2>
              <p className="neon-outcome-subtext">
                {isGold ? "Outstanding victory! You conquered the quiz!" : isTop10 ? "Spectacular performance among the top competitors!" : "Great effort and fantastic participation!"}
              </p>
            </div>

            {/* Score & Rank Spotlight */}
            <div className="neon-rank-spotlight-card">
              <div className="neon-rank-spotlight-left">
                <div className={`neon-rank-big-badge ${isGold ? 'rank-1' : isSilver ? 'rank-2' : isBronze ? 'rank-3' : ''}`}>
                  #{finalRank}
                </div>
                <div className="neon-rank-text-group">
                  <span className="neon-rank-caption">Final Standing</span>
                  <span className="neon-rank-number-label">Rank #{finalRank}</span>
                  <span className="neon-rank-delta-pill up">
                    ✓ Completed {questions.length} Questions
                  </span>
                </div>
              </div>
              <div className="neon-rank-total-score-wrap">
                <div className="neon-rank-total-val" style={{ color: "#c084fc" }}>
                  {(participantData?.score || 0).toLocaleString()}
                </div>
                <div className="neon-rank-total-sub">Total Points</div>
              </div>
            </div>

            {/* Metrics Breakdown */}
            <div className="neon-metrics-grid">
              <div className="neon-metric-box highlight">
                <div className="neon-metric-label">Correct Answers</div>
                <div className="neon-metric-val emerald">
                  {participantData?.correctAnswersCount || 0} / {questions.length}
                </div>
                <div className="neon-metric-footnote">
                  {Math.round(((participantData?.correctAnswersCount || 0) / Math.max(1, questions.length)) * 100)}% Accuracy
                </div>
              </div>
              <div className="neon-metric-box">
                <div className="neon-metric-label">Total Time</div>
                <div className="neon-metric-val">
                  {participantData?.totalResponseTimeMs ? `${(participantData.totalResponseTimeMs / 1000).toFixed(1)}s` : "-"}
                </div>
                <div className="neon-metric-footnote">Speed score applied</div>
              </div>
            </div>

            <p style={{ color: "#94a3b8", fontSize: "0.85rem", marginBottom: "1.75rem" }}>
              Check out the Host Screen for the live Podium Ceremony! 🏆
            </p>

            <button type="button" className="neon-btn-primary" onClick={onLeave}>
              Leave Quiz & Exit
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Synchronized 3-Second Get Ready Countdown Screen
  if (quizState.questionStatus === "preparing") {
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
            <button type="button" className="neon-pill-btn" onClick={onLeave}>
              ← Leave
            </button>
          </header>

          <div className="neon-card neon-preparing-card">
            <div className="neon-prep-top-badge">
              <span className="neon-pulse-dot" />
              QUESTION {quizState.currentQuestionIndex + 1} OF {questions.length}
            </div>

            <h1 className="neon-prep-heading">GET READY!</h1>

            <div className="neon-prep-countdown-wrap">
              <div className="neon-prep-radar-ring" />
              <div className="neon-prep-number" key={timeLeft}>
                {timeLeft > 0 ? timeLeft : "GO!"}
              </div>
            </div>

            <div className="neon-prep-details">
              <p className="neon-prep-hint">
                ⚡ <strong>Speed Bonus:</strong> Answer faster to earn up to <strong>1,000 points</strong>!
              </p>
              <div className="neon-prep-status-pill">
                <span>Get your fingers ready...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Timer Finished / Results Phase Screen (Participant sees Rank, Points, and Answer Status!)
  if (isResultsPhase) {
    const isCorrect = selectedOption !== null && selectedOption === correctAnswerIndex;
    const isTimeout = selectedOption === null;
    const pointsEarned = participantData?.lastPointsEarned || 0;
    const speedSec = participantData?.lastResponseTimeMs ? (participantData.lastResponseTimeMs / 1000).toFixed(2) : null;
    const currentRank = participantData?.rank || 1;
    const isRank1 = currentRank === 1;
    const isRank2 = currentRank === 2;
    const isRank3 = currentRank === 3;

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
            <button type="button" className="neon-pill-btn" onClick={onLeave}>
              ← Leave
            </button>
          </header>

          <div className="neon-card neon-participant-result-card">
            {/* Outcome Hero Banner */}
            <div className={`neon-result-outcome-badge ${isCorrect ? 'correct' : isTimeout ? 'timeout' : 'incorrect'}`}>
              <div className="neon-outcome-icon-large">
                {isCorrect ? "🎉" : isTimeout ? "⏱️" : "✕"}
              </div>
              <h2 className="neon-outcome-title">
                {isCorrect ? "CORRECT!" : isTimeout ? "TIME EXPIRED" : "INCORRECT"}
              </h2>
              <p className="neon-outcome-subtext">
                {isCorrect 
                  ? "Great job! Points added to your total score." 
                  : isTimeout 
                    ? "Time ran out before you selected an answer." 
                    : "Not quite! Check the correct answer below."}
              </p>
            </div>

            {/* Points Earned & Speed Row */}
            <div className="neon-metrics-grid">
              <div className="neon-metric-box highlight">
                <div className="neon-metric-label">Points Earned</div>
                <div className={`neon-metric-val ${isCorrect ? 'emerald' : ''}`}>
                  +{pointsEarned} <span style={{ fontSize: '0.9rem', color: isCorrect ? '#34d399' : '#94a3b8' }}>pts</span>
                </div>
                <div className="neon-metric-footnote">
                  {isCorrect && pointsEarned > 500 ? "Includes speed bonus! ⚡" : isCorrect ? "Base points awarded" : "0 points this question"}
                </div>
              </div>
              <div className="neon-metric-box">
                <div className="neon-metric-label">Answer Speed</div>
                <div className="neon-metric-val">
                  {speedSec ? `${speedSec}s` : "-"}
                </div>
                <div className="neon-metric-footnote">
                  {speedSec ? "Recorded in real-time" : "No response logged"}
                </div>
              </div>
            </div>

            {/* Live Rank Spotlight */}
            <div className="neon-rank-spotlight-card">
              <div className="neon-rank-spotlight-left">
                <div className={`neon-rank-big-badge ${isRank1 ? 'rank-1' : isRank2 ? 'rank-2' : isRank3 ? 'rank-3' : ''}`}>
                  #{currentRank}
                </div>
                <div className="neon-rank-text-group">
                  <span className="neon-rank-caption">Live Rank</span>
                  <span className="neon-rank-number-label">Rank #{currentRank}</span>
                  {rankMovement && (
                    <span className={`neon-rank-delta-pill ${rankMovement.direction}`}>
                      {rankMovement.label}
                    </span>
                  )}
                </div>
              </div>
              <div className="neon-rank-total-score-wrap">
                <div className="neon-rank-total-val" style={{ color: "#c084fc" }}>
                  {(participantData?.score || 0).toLocaleString()}
                </div>
                <div className="neon-rank-total-sub">Total Points</div>
              </div>
            </div>

            {/* Correct Answer Reveal Strip */}
            <div className="neon-answer-reveal-strip">
              <div className="neon-answer-reveal-icon">
                <CheckCircleIcon size={20} />
              </div>
              <div className="neon-answer-reveal-content">
                <span>Correct Option: <strong>Option {optionLetters[correctAnswerIndex] || correctAnswerIndex + 1}</strong></span>
                <div style={{ marginTop: '3px', color: '#cbd5e1', fontSize: '0.85rem' }}>
                  {currentQuestion?.options?.[correctAnswerIndex]}
                </div>
              </div>
            </div>

            {/* Waiting for Host Shimmer */}
            <div className="neon-waiting-shimmer">
              <span className="neon-pulse-dot" />
              <span>Host is preparing the leaderboard & next round...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Question Leaderboard Standings Screen
  if (quizState.questionStatus === "question_leaderboard") {
    const currentRank = participantData?.rank || 1;
    const isRank1 = currentRank === 1;
    const isRank2 = currentRank === 2;
    const isRank3 = currentRank === 3;
    const top5 = allParticipants.slice(0, 5);
    const isUserInTop5 = top5.some(p => p.id === participantId);

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
            <button type="button" className="neon-pill-btn" onClick={onLeave}>
              ← Leave
            </button>
          </header>

          <div className="neon-card neon-participant-standings-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <TrophyIcon size={22} color="#fbbf24" />
                <h2 style={{ fontSize: '1.35rem', fontWeight: 900, margin: 0, color: '#ffffff' }}>ROUND STANDINGS</h2>
              </div>
              <span className="neon-q-pill" style={{ margin: 0 }}>
                Q {quizState.currentQuestionIndex + 1} / {questions.length}
              </span>
            </div>

            {/* Personal Standing Card */}
            <div className="neon-rank-spotlight-card" style={{ marginBottom: '1.25rem' }}>
              <div className="neon-rank-spotlight-left">
                <div className={`neon-rank-big-badge ${isRank1 ? 'rank-1' : isRank2 ? 'rank-2' : isRank3 ? 'rank-3' : ''}`}>
                  #{currentRank}
                </div>
                <div className="neon-rank-text-group">
                  <span className="neon-rank-caption">Your Position</span>
                  <span className="neon-rank-number-label">Rank #{currentRank}</span>
                  {rankMovement && (
                    <span className={`neon-rank-delta-pill ${rankMovement.direction}`}>
                      {rankMovement.label}
                    </span>
                  )}
                </div>
              </div>
              <div className="neon-rank-total-score-wrap">
                <div className="neon-rank-total-val" style={{ color: "#c084fc" }}>
                  {(participantData?.score || 0).toLocaleString()}
                </div>
                <div className="neon-rank-total-sub">Total Points</div>
              </div>
            </div>

            {/* Mini Scoreboard */}
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              Top Contenders
            </div>

            <div className="neon-top5-table">
              {top5.map((p, idx) => {
                const isMe = p.id === participantId;
                const rClass = idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : '';
                return (
                  <div key={p.id} className={`neon-top5-row ${isMe ? 'is-current-user' : ''}`}>
                    <div className="neon-top5-user">
                      <span className={`neon-top5-rank ${rClass}`}>#{idx + 1}</span>
                      <span style={{ fontSize: '1.1rem' }}>{p.avatar || '👤'}</span>
                      <span className="neon-top5-name">
                        {p.name} {isMe && <span style={{ color: '#c084fc', fontSize: '0.78rem' }}>(You)</span>}
                      </span>
                    </div>
                    <span className="neon-top5-score">{(p.score || 0).toLocaleString()} pts</span>
                  </div>
                );
              })}

              {!isUserInTop5 && participantData && (
                <>
                  <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.8rem', padding: '2px 0' }}>• • •</div>
                  <div className="neon-top5-row is-current-user">
                    <div className="neon-top5-user">
                      <span className="neon-top5-rank">#{currentRank}</span>
                      <span style={{ fontSize: '1.1rem' }}>{participantData.avatar || '👤'}</span>
                      <span className="neon-top5-name">
                        {participantData.name} <span style={{ color: '#c084fc', fontSize: '0.78rem' }}>(You)</span>
                      </span>
                    </div>
                    <span className="neon-top5-score">{(participantData.score || 0).toLocaleString()} pts</span>
                  </div>
                </>
              )}
            </div>

            {/* Waiting shimmer */}
            <div className="neon-waiting-shimmer" style={{ marginTop: '1.25rem' }}>
              <span className="neon-pulse-dot" />
              <span>Next question starting shortly — Stay locked in! ⚡</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Default Answering Phase Screen
  return (
    <div className="neon-theme-wrapper neon-centered-wrapper">
      <NeonBackground />
      <div className="neon-mobile-frame neon-centered-frame">
        {/* Top Header Bar */}
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

        {/* Core Question & Answering Card */}
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
                    strokeDashoffset: strokeOffset,
                  }}
                />
              </svg>
              <span className={`neon-timer-number ${isUrgent ? "urgent" : ""}`}>
                {timeLeft}
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
                width: `${progressPercent}%`,
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

              let optionClasses = "neon-option-item";
              if (isSelected) {
                optionClasses += " selected";
              }

              return (
                <button
                  key={`${currentQuestion?.id || quizState.currentQuestionIndex}-${idx}`}
                  type="button"
                  className={optionClasses}
                  onClick={() => handleSelectOption(idx)}
                  disabled={hasSubmitted}
                >
                  <div className="neon-option-left">
                    <span className="neon-option-letter">
                      {optionLetters[idx] || idx + 1}
                    </span>
                    <span>{opt}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Dynamic Status / Feedback Toast */}
          {hasSubmitted && (
            <div className="neon-status-toast">
              <span>✓ Answer locked! Waiting for timer to end...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
