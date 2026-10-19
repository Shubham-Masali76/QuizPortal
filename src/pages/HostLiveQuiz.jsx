import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { doc, getDoc, updateDoc, collection, getDocs, onSnapshot, query, writeBatch, deleteDoc } from "firebase/firestore";
import { ref as rtdbRef, onValue } from "firebase/database";
import { db, rtdb } from "../services/firebase";
import LeaderboardView from "../components/LeaderboardView";
import PodiumView from "../components/PodiumView";
import NeonConfetti from "../components/NeonConfetti";
import { sortQuestions } from "../utils/helpers";
import NeonBackground from "../components/NeonBackground";
import { CpuIcon, TrophyIcon, UsersIcon, CheckCircleIcon } from "../components/NeonIcons";

const HostLiveQuiz = ({ quizId, setPage }) => {
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [quizStatus, setQuizStatus] = useState("loading"); // loading, preparing, answering, results, question_leaderboard, leaderboard
  const [timeLeft, setTimeLeft] = useState(0);
  const [responses, setResponses] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [presenceMap, setPresenceMap] = useState(null);
  const [quizData, setQuizData] = useState(null);
  const [transitionOverlay, setTransitionOverlay] = useState(null);
  const isTransitioning = useRef(false);
  const currentPhaseEndTime = useRef(null);

  // Active participants: filter out ghost records from old sessions who are not online in RTDB
  const activeParticipants = useMemo(() => {
    if (!presenceMap) return participants;
    const online = participants.filter((p) => {
      const pres = presenceMap[p.id];
      const isOnline = pres === true || pres?.state === "online" || pres?.presence === "online";
      const hasActivity = (p.score || 0) > 0 || responses.some(r => r.participantId === p.id);
      return isOnline || hasActivity;
    });
    return online.length > 0 ? online : participants;
  }, [participants, presenceMap, responses]);

  const updateQuizState = useCallback(async (index, status, timeLimit = 0, qListOverride = null, top5Override = null) => {
    const numIndex = Number(index);
    setCurrentQuestionIndex(numIndex);
    setQuizStatus(status);
    
    const activeQList = qListOverride || questions;
    const targetQ = activeQList[numIndex];

    const updateData = {
      currentQuestionIndex: numIndex,
      currentQuestionId: targetQ?.id || null,
      questionStatus: status, // "answering", "results", "question_leaderboard", "closed"
    };

    if (top5Override && Array.isArray(top5Override)) {
      updateData.leaderboardTop5 = top5Override;
    }

    if (timeLimit > 0) {
      const endTime = Date.now() + (timeLimit * 1000);
      updateData.phaseEndTime = endTime;
      currentPhaseEndTime.current = endTime;
    } else {
      updateData.phaseEndTime = null;
      currentPhaseEndTime.current = null;
    }

    setQuizData(prev => prev ? { ...prev, ...updateData } : updateData);
    await updateDoc(doc(db, "quizzes", quizId), updateData);
  }, [quizId, questions]);

  const handleShowResults = useCallback(async () => {
    if (isTransitioning.current) return;
    isTransitioning.current = true;
    
    try {
      // Set local state immediately to avoid re-triggering
      setQuizStatus("results");

      // 1. Calculate scores and batch update participants
      if (currentQuestionIndex >= 0 && questions[currentQuestionIndex]) {
        const currentQuestion = (quizData?.currentQuestionId && questions.find(q => q.id === quizData.currentQuestionId)) 
          || questions[currentQuestionIndex];
        
        const updates = {};
        // Calculate scores first
        activeParticipants.forEach(p => {
          updates[p.id] = { ...p, lastPointsEarned: 0 };
        });

        const maxTime = quizData?.questionTimeLimit || quizData?.answeringTimeLimit || 20;
        const phaseEnd = currentPhaseEndTime.current || quizData?.phaseEndTime || Date.now();

        responses.forEach(resp => {
          if (!updates[resp.participantId]) return;
          
          let pointsEarned = 0;
          
          // Clamp timeTakenMs to [0, maxTime * 1000] to handle clock skew perfectly
          let timeTakenMs = resp.timestamp - (phaseEnd - (maxTime * 1000));
          timeTakenMs = Math.max(0, Math.min(timeTakenMs, maxTime * 1000));
          const timeTakenSec = timeTakenMs / 1000;

          updates[resp.participantId].lastResponseTimeMs = timeTakenMs;

          if (resp.selectedOption === currentQuestion.correctAnswer) {
            const speedMultiplier = Math.max(0, 1 - (timeTakenSec / maxTime));
            pointsEarned = 500 + Math.round(500 * speedMultiplier);
            updates[resp.participantId].correctAnswersCount = (updates[resp.participantId].correctAnswersCount || 0) + 1;
          }
          
          updates[resp.participantId].lastPointsEarned = pointsEarned;
          updates[resp.participantId].score = (updates[resp.participantId].score || 0) + pointsEarned;
          updates[resp.participantId].totalResponseTimeMs = (updates[resp.participantId].totalResponseTimeMs || 0) + timeTakenMs;
        });

        // Sort and assign exact Rank
        const updatedParticipantsArray = Object.values(updates);
        updatedParticipantsArray.sort((a, b) => {
          if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
          if ((b.correctAnswersCount || 0) !== (a.correctAnswersCount || 0)) return (b.correctAnswersCount || 0) - (a.correctAnswersCount || 0);
          if ((a.totalResponseTimeMs || 0) !== (b.totalResponseTimeMs || 0)) return (a.totalResponseTimeMs || 0) - (b.totalResponseTimeMs || 0);
          return (a.lastResponseTimeMs || 0) - (b.lastResponseTimeMs || 0);
        });

        updatedParticipantsArray.forEach((p, index) => {
           updates[p.id].rank = index + 1;
        });

        const top5Leaderboard = updatedParticipantsArray.slice(0, 5).map((p, idx) => ({
          id: p.id,
          name: p.name || "Anonymous",
          score: p.score || 0,
          rank: idx + 1,
          avatar: p.avatar || "",
        }));

        // Chunk batch operations to avoid 500 limit
        const chunkedBatches = [];
        let currentBatch = writeBatch(db);
        let opCount = 0;

        Object.keys(updates).forEach(pid => {
          if (opCount >= 490) {
            chunkedBatches.push(currentBatch);
            currentBatch = writeBatch(db);
            opCount = 0;
          }
          const pRef = doc(db, "quizzes", quizId, "participants", pid);
          const pUpdates = { 
            lastPointsEarned: updates[pid].lastPointsEarned || 0,
            score: updates[pid].score || 0,
            rank: updates[pid].rank || 1,
          };
          
          if (updates[pid].lastResponseTimeMs !== undefined) {
             pUpdates.lastResponseTimeMs = updates[pid].lastResponseTimeMs;
             pUpdates.totalResponseTimeMs = updates[pid].totalResponseTimeMs;
          }
          if (updates[pid].correctAnswersCount !== undefined) {
             pUpdates.correctAnswersCount = updates[pid].correctAnswersCount;
          }
          
          currentBatch.update(pRef, pUpdates);
          opCount++;
        });
        
        if (opCount > 0) {
          chunkedBatches.push(currentBatch);
        }
        
        for (const b of chunkedBatches) {
          await b.commit();
        }

        await updateQuizState(currentQuestionIndex, "results", 0, null, top5Leaderboard);
        return;
      }

      await updateQuizState(currentQuestionIndex, "results");
    } catch (err) {
      console.error("Error in handleShowResults:", err);
    } finally {
      isTransitioning.current = false;
    }
  }, [quizId, currentQuestionIndex, updateQuizState, responses, questions, quizData, activeParticipants]);

  const handleShowLeaderboard = async () => {
    if (isTransitioning.current) return;
    isTransitioning.current = true;
    try {
      setTransitionOverlay({
        title: "TABULATING STANDINGS & SCORES...",
        subtitle: "Calculating participant ranks and streak points",
        badge: "LIVE SCOREBOARD",
      });
      await new Promise(r => setTimeout(r, 650));
      await updateQuizState(currentQuestionIndex, "question_leaderboard");
      setTransitionOverlay(null);
    } catch (err) {
      console.error("Error in handleShowLeaderboard:", err);
      setTransitionOverlay(null);
    } finally {
      isTransitioning.current = false;
    }
  };

  // Fetch all questions and participants on mount
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const qzSnap = await getDoc(doc(db, "quizzes", quizId));
        let qData = {};
        if (qzSnap.exists()) {
          qData = qzSnap.data();
          setQuizData(qData);
          if (qData.phaseEndTime) {
            currentPhaseEndTime.current = qData.phaseEndTime;
          }
        }

        // Fetch questions
        const qSnap = await getDocs(collection(db, "quizzes", quizId, "questions"));
        const qList = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const sortedQuestions = sortQuestions(qList, qData.questionOrder);
        setQuestions(sortedQuestions);

        if (sortedQuestions.length === 0) {
          setQuizStatus("error"); // No questions
          return;
        }

        // If the quiz was already completed, do NOT restart it — show the final podium
        if (qData.status === "completed" || qData.status === "finished") {
          setCurrentQuestionIndex(Math.max(0, sortedQuestions.length - 1));
          setQuizStatus("leaderboard");
          return;
        }

        const qLimit = qData.questionTimeLimit || qData.answeringTimeLimit || 20;

        // If the quiz is starting fresh or has uninitialized state:
        const isFresh = !qData.status ||
                        qData.status === "waiting" ||
                        qData.currentQuestionIndex === undefined ||
                        qData.currentQuestionIndex === null;

        if (isFresh) {
          setTimeLeft(3);
          await updateQuizState(0, "preparing", 3, sortedQuestions);
        } else {
          // Resume quiz state
          const activeIndex = Number(qData.currentQuestionIndex) || 0;
          setCurrentQuestionIndex(activeIndex);
          const currentStatus = qData.questionStatus === "reading" ? "answering" : (qData.questionStatus || "answering");
          setQuizStatus(currentStatus);

          if (qData.phaseEndTime) {
            const remaining = Math.max(0, Math.round((qData.phaseEndTime - Date.now()) / 1000));
            setTimeLeft(remaining);
          } else if (currentStatus === "answering") {
            setTimeLeft(qLimit);
          } else if (currentStatus === "preparing") {
            setTimeLeft(3);
          }
        }
      } catch (err) {
        console.error("Failed to load quiz data", err);
      }
    };
    
    fetchInitialData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  // Listen to participants for live leaderboard updates
  useEffect(() => {
    const q = query(collection(db, "quizzes", quizId, "participants"));
    const unsub = onSnapshot(q, (snap) => {
      setParticipants(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [quizId]);

  // Listen to RTDB presence for active participants in real-time
  useEffect(() => {
    if (!quizId) return;
    const presenceRef = rtdbRef(rtdb, `presence/${quizId}`);
    const unsub = onValue(presenceRef, (snapshot) => {
      setPresenceMap(snapshot.val() || {});
    });
    return () => unsub();
  }, [quizId]);

  // Proactively cleanup stale ghost participants from Firestore if they are offline with 0 points
  useEffect(() => {
    if (!presenceMap || currentQuestionIndex !== 0) return;
    participants.forEach((p) => {
      const pres = presenceMap[p.id];
      const isOnline = pres === true || pres?.state === "online" || pres?.presence === "online";
      const hasActivity = (p.score || 0) > 0 || responses.some(r => r.participantId === p.id);
      if (!isOnline && !hasActivity) {
        deleteDoc(doc(db, "quizzes", quizId, "participants", p.id)).catch(console.warn);
      }
    });
  }, [presenceMap, participants, currentQuestionIndex, quizId, responses]);

  // Listen to responses for the current question via RTDB
  useEffect(() => {
    if (questions.length === 0) return;

    const responsesRef = rtdbRef(rtdb, `responses/${quizId}/${currentQuestionIndex}`);
    const unsubscribe = onValue(responsesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // data is an object with participantId keys
        const newResponses = Object.keys(data).map(pid => ({
          participantId: pid,
          ...data[pid]
        }));
        setResponses(newResponses);
      } else {
        setResponses([]);
      }
    });

    return () => unsubscribe();
  }, [quizId, currentQuestionIndex, questions.length]);

  useEffect(() => {
    let timer;
    if (quizStatus === "answering" || quizStatus === "preparing") {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [quizStatus]);

  useEffect(() => {
    if (timeLeft === 0 && !isTransitioning.current) {
      if (quizStatus === "answering") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        handleShowResults();
      } else if (quizStatus === "preparing") {
        // Synchronized 3s countdown finished -> Start question answering
        const qLimit = quizData?.questionTimeLimit || quizData?.answeringTimeLimit || 20;
        setTimeLeft(qLimit);
        updateQuizState(currentQuestionIndex, "answering", qLimit);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, quizStatus, currentQuestionIndex, quizData]);

  const handleNextQuestion = async () => {
    if (isTransitioning.current) return;
    isTransitioning.current = true;
    
    try {
      const nextIndex = Number(currentQuestionIndex) + 1;
      if (nextIndex < questions.length) {
        setTransitionOverlay({
          title: `PREPARING QUESTION ${nextIndex + 1}`,
          subtitle: "Get ready for the next challenge",
          badge: `QUESTION ${nextIndex + 1} OF ${questions.length}`,
        });
        await new Promise(r => setTimeout(r, 650));
        setTransitionOverlay(null);

        const prepDuration = 3;
        setTimeLeft(prepDuration);
        setResponses([]);
        await updateQuizState(nextIndex, "preparing", prepDuration);
      } else {
        // Final question completed -> Show celebration transition then Podium!
        setTransitionOverlay({
          title: "CHAMPIONS PODIUM REVEAL",
          subtitle: "Tallying final scores and tournament rankings...",
          badge: "GRAND FINALE",
        });
        await new Promise(r => setTimeout(r, 1100));
        await updateDoc(doc(db, "quizzes", quizId), { 
          status: "completed", 
          questionStatus: "closed",
          phaseEndTime: null,
        });
        setQuizData(prev => prev ? { ...prev, status: "completed", questionStatus: "closed", phaseEndTime: null } : { status: "completed", questionStatus: "closed" });
        setQuizStatus("leaderboard");
        setTransitionOverlay(null);
      }
    } catch (err) {
      console.error("Error progressing to next question:", err);
      setTransitionOverlay(null);
    } finally {
      isTransitioning.current = false;
    }
  };

  const [showEndDialog, setShowEndDialog] = useState(false);

  const confirmEndQuiz = async () => {
    setShowEndDialog(false);
    if (isTransitioning.current) return;
    isTransitioning.current = true;

    try {
      // If currently answering, compute scores for this question so participants get credit
      if (quizStatus === "answering" && currentQuestionIndex >= 0 && questions[currentQuestionIndex]) {
        try {
          const currentQuestion = (quizData?.currentQuestionId && questions.find(q => q.id === quizData.currentQuestionId)) 
            || questions[currentQuestionIndex];
          
          const updates = {};
          activeParticipants.forEach(p => {
            updates[p.id] = { ...p, lastPointsEarned: 0 };
          });

          const maxTime = quizData?.questionTimeLimit || quizData?.answeringTimeLimit || 20;
          const phaseEnd = currentPhaseEndTime.current || quizData?.phaseEndTime || Date.now();

          responses.forEach(resp => {
            if (!updates[resp.participantId]) return;
            let pointsEarned = 0;
            let timeTakenMs = resp.timestamp - (phaseEnd - (maxTime * 1000));
            timeTakenMs = Math.max(0, Math.min(timeTakenMs, maxTime * 1000));
            const timeTakenSec = timeTakenMs / 1000;
            updates[resp.participantId].lastResponseTimeMs = timeTakenMs;

            if (resp.selectedOption === currentQuestion.correctAnswer) {
              const speedMultiplier = Math.max(0, 1 - (timeTakenSec / maxTime));
              pointsEarned = 500 + Math.round(500 * speedMultiplier);
              updates[resp.participantId].correctAnswersCount = (updates[resp.participantId].correctAnswersCount || 0) + 1;
            }
            updates[resp.participantId].lastPointsEarned = pointsEarned;
            updates[resp.participantId].score = (updates[resp.participantId].score || 0) + pointsEarned;
            updates[resp.participantId].totalResponseTimeMs = (updates[resp.participantId].totalResponseTimeMs || 0) + timeTakenMs;
          });

          const updatedParticipantsArray = Object.values(updates);
          updatedParticipantsArray.sort((a, b) => {
            if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
            if ((b.correctAnswersCount || 0) !== (a.correctAnswersCount || 0)) return (b.correctAnswersCount || 0) - (a.correctAnswersCount || 0);
            if ((a.totalResponseTimeMs || 0) !== (b.totalResponseTimeMs || 0)) return (a.totalResponseTimeMs || 0) - (b.totalResponseTimeMs || 0);
            return (a.lastResponseTimeMs || 0) - (b.lastResponseTimeMs || 0);
          });

          updatedParticipantsArray.forEach((p, index) => {
            updates[p.id].rank = index + 1;
          });

          const chunkedBatches = [];
          let currentBatch = writeBatch(db);
          let opCount = 0;
          Object.keys(updates).forEach(pid => {
            if (opCount >= 490) {
              chunkedBatches.push(currentBatch);
              currentBatch = writeBatch(db);
              opCount = 0;
            }
            const pRef = doc(db, "quizzes", quizId, "participants", pid);
            currentBatch.update(pRef, {
              lastPointsEarned: updates[pid].lastPointsEarned || 0,
              score: updates[pid].score || 0,
              rank: updates[pid].rank || 1,
              correctAnswersCount: updates[pid].correctAnswersCount || 0,
              totalResponseTimeMs: updates[pid].totalResponseTimeMs || 0,
              lastResponseTimeMs: updates[pid].lastResponseTimeMs || 0,
            });
            opCount++;
          });
          if (opCount > 0) chunkedBatches.push(currentBatch);
          for (const b of chunkedBatches) {
            await b.commit();
          }
        } catch (scoreErr) {
          console.warn("Could not calculate final question scores on early end quiz:", scoreErr);
        }
      }

      await updateDoc(doc(db, "quizzes", quizId), {
        status: "completed",
        questionStatus: "closed",
        phaseEndTime: null,
      });

      setQuizData(prev => prev ? { ...prev, status: "completed", questionStatus: "closed", phaseEndTime: null } : { status: "completed", questionStatus: "closed" });
      setQuizStatus("leaderboard");
    } catch (err) {
      console.error("Error ending quiz early:", err);
    } finally {
      isTransitioning.current = false;
    }
  };

  const handleEndQuiz = async () => {
    try {
      await updateDoc(doc(db, "quizzes", quizId), {
        status: "completed",
        questionStatus: "closed",
        phaseEndTime: null,
      });
    } catch (err) {
      console.error("Error setting quiz completed:", err);
    }
    setPage("dashboard");
  };

  if (questions.length === 0 && quizStatus !== "error") {
    return (
      <div className="neon-theme-wrapper neon-centered-wrapper">
        <NeonBackground />
        <div className="neon-host-frame" style={{ alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
          <div className="neon-card" style={{ textAlign: "center", padding: "3rem" }}>
            <h2 style={{ fontSize: "1.8rem", fontWeight: 800, marginBottom: "0.5rem" }}>Loading Quiz...</h2>
            <p style={{ color: "#a1a1aa" }}>Synchronizing live questions and participant state...</p>
          </div>
        </div>
      </div>
    );
  }
  if (quizStatus === "error") {
    return (
      <div className="neon-theme-wrapper neon-centered-wrapper">
        <NeonBackground />
        <div className="neon-host-frame" style={{ alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
          <div className="neon-card" style={{ textAlign: "center", padding: "3rem" }}>
            <h2 style={{ fontSize: "1.8rem", fontWeight: 800, color: "#f87171", marginBottom: "1rem" }}>No Questions Found</h2>
            <p style={{ color: "#a1a1aa", marginBottom: "2rem" }}>There are no questions configured for this quiz session.</p>
            <button className="neon-btn-primary" onClick={handleEndQuiz}>Back to Dashboard</button>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = (quizData?.currentQuestionId && questions.find(q => q.id === quizData.currentQuestionId))
    || questions[currentQuestionIndex] 
    || {
      question: "Loading question...",
      options: [],
      correctAnswer: 1
    };

  // Calculate stats for results
  const optionCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  responses.forEach(r => {
    if (r.selectedOption) optionCounts[r.selectedOption]++;
  });
  const maxVotes = Math.max(...Object.values(optionCounts), 1); // avoid div by 0

  // Timer gauge constants
  const totalLimit = quizData?.questionTimeLimit || quizData?.answeringTimeLimit || 20;
  const radius = 32;
  const circumference = 2 * Math.PI * radius; // ~201.06
  const strokeOffset = circumference - (Math.min(timeLeft, totalLimit) / totalLimit) * circumference;
  const isUrgent = timeLeft <= 5 && quizStatus === "answering";
  const progressPercent = activeParticipants.length > 0 
    ? Math.min(100, (responses.length / activeParticipants.length) * 100) 
    : 0;

  const optionStyles = [
    { class: "opt-rose", symbol: "▲", letter: "A" },
    { class: "opt-sky", symbol: "◆", letter: "B" },
    { class: "opt-amber", symbol: "●", letter: "C" },
    { class: "opt-emerald", symbol: "■", letter: "D" },
  ];

  return (
    <div className="neon-theme-wrapper">
      <NeonBackground />
      <div className="neon-host-frame">
        {/* Top Header Bar */}
        <header className="neon-host-header">
          <div className="neon-brand-badge">
            <CpuIcon size={28} />
            <div className="neon-brand-text">
              <span className="neon-brand-org">AWS STUDENT BUILDER GROUP</span>
              <span className="neon-brand-sub">AT NKOCET • HOST CONSOLE</span>
            </div>
          </div>

          <div className="neon-host-top-badges">
            {quizStatus !== "leaderboard" && (
              <>
                <span className="neon-q-pill">
                  QUESTION {currentQuestionIndex + 1} OF {questions.length}
                </span>
                {quizStatus === "answering" && (
                  <span className="neon-q-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <UsersIcon size={16} />
                    <span>{responses.length} / {activeParticipants.length} Answered</span>
                  </span>
                )}
              </>
            )}
            <button 
              type="button" 
              className="neon-danger-pill-btn" 
              onClick={() => setShowEndDialog(true)}
            >
              End Quiz
            </button>
          </div>
        </header>

        {/* Live Quiz Main Stage */}
        {quizStatus === "leaderboard" ? (
          <>
            <NeonConfetti />
            <div className="neon-host-card" style={{ textAlign: 'center', padding: '3.5rem 2rem' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '0.45rem 1.4rem', borderRadius: '9999px', background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.35)', color: '#4ade80', fontWeight: '800', fontSize: '0.95rem', marginBottom: '1.25rem' }}>
                ✓ Quiz Completed
              </div>
              <h1 style={{ fontSize: '3.2rem', fontWeight: 900, margin: '0.25rem 0 1rem 0', color: '#ffca3a', textShadow: '0 0 25px rgba(255, 202, 58, 0.5)' }}>
                CHAMPIONS PODIUM
              </h1>
              <p style={{ color: '#a1a1aa', fontSize: '1.1rem', marginBottom: '2rem' }}>
                Congratulations to all top performers of this session!
              </p>

              <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                <PodiumView participants={activeParticipants} />
              </div>

              {activeParticipants.length === 0 && (
                <p style={{ color: '#71717a', marginTop: '2rem', fontSize: '1.1rem' }}>
                  No active participants submitted answers in this session.
                </p>
              )}

              <div style={{ marginTop: '3.5rem', display: 'flex', gap: '1.25rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button 
                  type="button"
                  className="neon-btn-primary" 
                  onClick={() => setPage("analytics")} 
                  style={{ width: 'auto', padding: '0.95rem 2.5rem', fontSize: '1.15rem' }}
                >
                  <span>View Analytics & Reports</span>
                  <span>→</span>
                </button>
                <button 
                  type="button"
                  className="neon-btn-ghost" 
                  onClick={handleEndQuiz} 
                  style={{ width: 'auto', padding: '0.95rem 2rem', fontSize: '1.15rem' }}
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="neon-host-card">
            {/* Preparing Phase: 3-Second Synchronized Countdown */}
            {quizStatus === "preparing" && (
              <div className="neon-preparing-card">
                <div className="neon-prep-top-badge">
                  <span className="neon-pulse-dot" />
                  PREPARING QUESTION {currentQuestionIndex + 1} OF {questions.length}
                </div>
                <h1 className="neon-prep-heading">GET READY!</h1>
                <div className="neon-prep-countdown-wrap">
                  <div className="neon-prep-radar-ring" />
                  <div className="neon-prep-number" key={timeLeft}>
                    {timeLeft > 0 ? timeLeft : "GO!"}
                  </div>
                </div>
                <div className="neon-prep-details">
                  <p className="neon-prep-hint" style={{ fontSize: '1.15rem', color: '#e2e8f0', fontWeight: 600 }}>
                    {currentQuestion?.question}
                  </p>
                  <div className="neon-prep-status-pill">
                    <span>Synchronizing {activeParticipants.length} active participants...</span>
                  </div>
                </div>
              </div>
            )}

            {/* Answering Phase Timer */}
            {quizStatus === "answering" && (
              <div className="neon-host-timer-circle">
                <svg className="neon-timer-svg" viewBox="0 0 76 76">
                  <circle
                    className="neon-timer-bg-ring"
                    cx="38"
                    cy="38"
                    r={radius}
                    strokeWidth="5"
                  />
                  <circle
                    className={`neon-timer-progress-ring ${isUrgent ? "urgent" : ""}`}
                    cx="38"
                    cy="38"
                    r={radius}
                    strokeWidth="5"
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
            )}

            {/* Question Text (Visible during answering and results) */}
            {(quizStatus === "answering" || quizStatus === "results") && (
              <h1 className="neon-host-question-title">
                {currentQuestion.question}
              </h1>
            )}

            {/* Answering Phase: 2x2 Option Grid */}
            {quizStatus === "answering" && (
              <>
                <div className="neon-host-options-grid">
                  {currentQuestion.options?.map((opt, idx) => {
                    const styleConfig = optionStyles[idx % optionStyles.length];
                    return (
                      <div key={idx} className={`neon-host-opt-card ${styleConfig.class}`}>
                        <div className="neon-host-opt-badge">
                          <span>{styleConfig.symbol}</span>
                          <span style={{ marginLeft: '4px' }}>{styleConfig.letter}</span>
                        </div>
                        <span className="neon-host-opt-text">{opt}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Response progress ticker */}
                <div className="neon-host-response-bar">
                  <span>Responses Received:</span>
                  <div className="neon-host-response-track">
                    <div 
                      className="neon-host-response-fill"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <span><strong>{responses.length}</strong> of <strong>{activeParticipants.length}</strong> joined</span>
                </div>
              </>
            )}

            {/* Results Phase: Glowing Vertical Bar Chart */}
            {quizStatus === "results" && (
              <div className="neon-host-results-stage">
                <div className="neon-host-chart">
                  {currentQuestion.options?.map((opt, idx) => {
                    const optionNumber = idx + 1;
                    const isCorrect = currentQuestion.correctAnswer === optionNumber;
                    const votes = optionCounts[optionNumber] || 0;
                    const heightPct = maxVotes > 0 ? (votes / maxVotes) * 100 : 0;
                    const styleConfig = optionStyles[idx % optionStyles.length];
                    
                    return (
                      <div key={idx} className={`neon-host-chart-col ${isCorrect ? 'is-correct-col' : ''}`}>
                        {/* Vote count and Correct pill stacked naturally */}
                        <div className="neon-host-chart-header">
                          {isCorrect && (
                            <div className="neon-correct-pill">
                              <CheckCircleIcon size={12} />
                              <span>CORRECT</span>
                            </div>
                          )}
                          <span className="neon-host-chart-votes">{votes}</span>
                        </div>

                        {/* Bar Track & Fill */}
                        <div className="neon-host-chart-bar-track">
                          <div 
                            className={`neon-host-chart-bar-fill ${isCorrect ? 'is-correct-bar' : ''}`}
                            style={{
                              height: `${votes > 0 ? Math.max(heightPct, 12) : 6}%`,
                              background: isCorrect 
                                ? 'linear-gradient(180deg, #10b981 0%, #047857 100%)' 
                                : (idx === 0 
                                    ? 'linear-gradient(180deg, #f43f5e 0%, #be123c 100%)' 
                                    : idx === 1 
                                      ? 'linear-gradient(180deg, #0ea5e9 0%, #0369a1 100%)' 
                                      : idx === 2 
                                        ? 'linear-gradient(180deg, #eab308 0%, #a16207 100%)' 
                                        : 'linear-gradient(180deg, #10b981 0%, #047857 100%)'),
                            }}
                          />
                        </div>

                        {/* Option Details Card (Below Baseline Shelf) */}
                        <div className={`neon-host-chart-card ${isCorrect ? 'is-correct-card' : ''}`}>
                          <span className={`neon-host-opt-badge ${styleConfig.class}`}>
                            <span style={{ fontSize: '0.65rem', marginRight: '2px' }}>{styleConfig.symbol}</span>
                            <span>{styleConfig.letter}</span>
                          </span>
                          <span className="neon-host-chart-opt-text">{opt}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Question Leaderboard Phase */}
            {quizStatus === "question_leaderboard" && (
              <div className="neon-host-standings-stage">
                <div className="neon-host-standings-header">
                  <div className="neon-trophy-badge">
                    <TrophyIcon size={26} color="#ffd700" />
                  </div>
                  <div className="neon-host-standings-titles">
                    <h2 className="neon-host-standings-title">CURRENT STANDINGS</h2>
                    <p className="neon-host-standings-subtitle">
                      Question {currentQuestionIndex + 1} of {questions.length} • Live Scoreboard
                    </p>
                  </div>
                </div>
                <LeaderboardView key={`host-lb-${currentQuestionIndex}`} participants={activeParticipants} />
              </div>
            )}

            {/* Stage Action Controls */}
            <div style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              {quizStatus === "answering" && (
                <button 
                  type="button"
                  className="neon-btn-ghost" 
                  onClick={handleShowResults}
                  style={{ width: 'auto', padding: '0.85rem 2rem' }}
                >
                  Skip Timer & Show Results ⚡
                </button>
              )}

              {quizStatus === "results" && (
                <button 
                  type="button"
                  className="neon-btn-primary" 
                  onClick={handleShowLeaderboard}
                  style={{ width: 'auto', padding: '0.95rem 2.5rem', fontSize: '1.15rem' }}
                >
                  {currentQuestionIndex + 1 < questions.length 
                    ? "Show Leaderboard →" 
                    : "Show Final Leaderboard →"}
                </button>
              )}

              {quizStatus === "question_leaderboard" && (
                <button 
                  type="button"
                  className="neon-btn-primary" 
                  onClick={handleNextQuestion}
                  style={{ width: 'auto', padding: '0.95rem 2.5rem', fontSize: '1.15rem' }}
                >
                  {currentQuestionIndex + 1 < questions.length 
                    ? `Next Question (${currentQuestionIndex + 2}/${questions.length}) →` 
                    : "View Final Podium 🏆"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Fullscreen Suspense / Stage Transition Overlay */}
        {transitionOverlay && (
          <div className="neon-transition-overlay">
            <div className="neon-transition-badge">
              <span className="neon-pulse-dot" />
              {transitionOverlay.badge}
            </div>
            <h2 className="neon-transition-title">{transitionOverlay.title}</h2>
            <p className="neon-transition-subtitle">{transitionOverlay.subtitle}</p>
            <div className="neon-transition-spinner" />
          </div>
        )}

        {/* Cyber End Quiz Modal */}
        {showEndDialog && (
          <div className="neon-dialog-overlay">
            <div className="neon-dialog-box">
              <h2 className="neon-dialog-title">End Quiz Now?</h2>
              <p className="neon-dialog-desc">
                Are you sure you want to end this quiz? This will finalize scores and show the final results and podium to all participants.
              </p>
              <div className="neon-dialog-actions">
                <button 
                  type="button" 
                  className="neon-btn-ghost"
                  onClick={() => setShowEndDialog(false)}
                  style={{ width: 'auto', padding: '0.75rem 1.75rem' }}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="neon-danger-pill-btn"
                  onClick={confirmEndQuiz}
                  style={{ padding: '0.75rem 1.75rem', fontSize: '0.95rem', borderRadius: '12px' }}
                >
                  Yes, End Quiz
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HostLiveQuiz;

