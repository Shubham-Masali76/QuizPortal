import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { doc, getDoc, updateDoc, collection, getDocs, onSnapshot, query, writeBatch, deleteDoc } from "firebase/firestore";
import { ref as rtdbRef, onValue } from "firebase/database";
import { db, rtdb } from "../services/firebase";
import LeaderboardView from "../components/LeaderboardView";
import PodiumView from "../components/PodiumView";
import { sortQuestions } from "../utils/helpers";

const HostLiveQuiz = ({ quizId, setPage }) => {
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [quizStatus, setQuizStatus] = useState("loading"); // loading, answering, results, question_leaderboard, leaderboard
  const [timeLeft, setTimeLeft] = useState(0);
  const [responses, setResponses] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [presenceMap, setPresenceMap] = useState(null);
  const [quizData, setQuizData] = useState(null);
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

  const updateQuizState = useCallback(async (index, status, timeLimit = 0, qListOverride = null) => {
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

    if (timeLimit > 0) {
      const endTime = Date.now() + (timeLimit * 1000);
      updateData.phaseEndTime = endTime;
      currentPhaseEndTime.current = endTime;
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
      await updateQuizState(currentQuestionIndex, "question_leaderboard");
    } catch (err) {
      console.error("Error in handleShowLeaderboard:", err);
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
          setTimeLeft(qLimit);
          await updateQuizState(0, "answering", qLimit, sortedQuestions);
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
    if (quizStatus === "answering") {
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
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, quizStatus]); // exclude handlers so we don't re-trigger on response updates

  const handleNextQuestion = async () => {
    if (isTransitioning.current) return;
    isTransitioning.current = true;
    
    try {
      const nextIndex = Number(currentQuestionIndex) + 1;
      if (nextIndex < questions.length) {
        const qLimit = quizData?.questionTimeLimit || quizData?.answeringTimeLimit || 20;
        setTimeLeft(qLimit);
        setResponses([]);
        await updateQuizState(nextIndex, "answering", qLimit);
      } else {
        await updateDoc(doc(db, "quizzes", quizId), { 
          status: "completed", 
          questionStatus: "closed",
          phaseEndTime: null,
        });
        setQuizData(prev => prev ? { ...prev, status: "completed", questionStatus: "closed", phaseEndTime: null } : { status: "completed", questionStatus: "closed" });
        setQuizStatus("leaderboard");
      }
    } catch (err) {
      console.error("Error progressing to next question:", err);
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
    return <div className="host-live-container"><h2>Loading Quiz...</h2></div>;
  }
  if (quizStatus === "error") {
    return <div className="host-live-container"><h2>Error: No questions found for this quiz.</h2><button onClick={handleEndQuiz}>Back to Dashboard</button></div>;
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

  return (
    <div className="host-live-container" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
      
      {quizStatus === "leaderboard" ? (
        <div className="leaderboard-view">
          <div style={{ display: 'inline-block', padding: '0.4rem 1.2rem', borderRadius: '20px', background: 'rgba(34, 197, 94, 0.15)', color: '#16a34a', fontWeight: 'bold', fontSize: '0.95rem', marginBottom: '1rem' }}>
            ✓ Quiz Completed
          </div>
          <h2 style={{ fontSize: '3rem', margin: '0.5rem 0 2rem 0', color: '#ffca3a', textShadow: '2px 2px 4px rgba(0,0,0,0.2)' }}>Final Podium</h2>
          <PodiumView participants={activeParticipants} />
          {activeParticipants.length === 0 && (
            <p style={{ color: '#888', marginTop: '1.5rem', fontSize: '1.1rem' }}>
              No active participants submitted answers in this session.
            </p>
          )}
          <div style={{ marginTop: '3.5rem', display: 'flex', gap: '1.25rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button 
              type="button"
              className="primary-btn" 
              onClick={() => setPage("analytics")} 
              style={{ padding: '0.9rem 2.5rem', fontSize: '1.2rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
            >
              <span>View Analytics & Reports</span>
              <span>→</span>
            </button>
            <button 
              type="button"
              className="secondary-btn" 
              onClick={handleEndQuiz} 
              style={{ padding: '0.9rem 2rem', fontSize: '1.2rem', cursor: 'pointer' }}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      ) : (
        <div className="question-view">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div className="status-badge" style={{ fontWeight: 'bold', color: '#666' }}>
              Question {currentQuestionIndex + 1} of {questions.length}
            </div>
            <button 
              type="button"
              className="delete-question-btn" 
              onClick={() => setShowEndDialog(true)}
              style={{ padding: '0.4rem 1.1rem', fontSize: '0.9rem', cursor: 'pointer', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px' }}
            >
              End Quiz
            </button>
          </div>
          
          <h1 style={{ fontSize: '2.5rem', marginBottom: '2rem' }}>{currentQuestion.question}</h1>

          {quizStatus === "answering" && (
            <div className="timer" style={{ fontSize: '4rem', fontWeight: 'bold', color: timeLeft <= 5 ? 'red' : '#333' }}>
              {timeLeft}
            </div>
          )}

          {quizStatus === "answering" && (
            <div className="options-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', margin: '2rem 0' }}>
            {currentQuestion.options?.map((opt, idx) => (
                <div 
                  key={idx} 
                  className="option-card"
                  style={{
                    padding: '1.5rem',
                    border: '2px solid #ddd',
                    borderRadius: '8px',
                    backgroundColor: 'white',
                  }}
                >
                  <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{opt}</span>
                </div>
            ))}
            </div>
          )}

          {quizStatus === "results" && (
            <div className="bar-chart" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', height: '350px', gap: '2rem', borderBottom: '2px solid #333', paddingBottom: '0.5rem', marginTop: '3rem' }}>
              {currentQuestion.options?.map((opt, idx) => {
                const optionNumber = idx + 1;
                const isCorrect = currentQuestion.correctAnswer === optionNumber;
                const votes = optionCounts[optionNumber];
                const heightPct = maxVotes > 0 ? (votes / maxVotes) * 100 : 0;
                const colors = ['#a0c4ff', '#ffc6ff', '#ff595e', '#8eecf5', '#ffd6a5'];
                
                return (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '120px' }}>
                    <span style={{ marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '1.5rem' }}>{votes}</span>
                    <div style={{ height: '250px', width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{ 
                        width: '100%', 
                        height: `${Math.max(heightPct, 2)}%`, 
                        backgroundColor: isCorrect ? '#4ade80' : colors[idx % colors.length], 
                        transition: 'height 1s ease-out',
                        borderRadius: '4px 4px 0 0'
                      }}></div>
                    </div>
                    <span style={{ marginTop: '1rem', textAlign: 'center', fontSize: '1rem', color: '#666', minHeight: '40px' }}>{opt}</span>
                  </div>
                );
              })}
            </div>
          )}

          {quizStatus === "question_leaderboard" && (
            <div className="card" style={{ marginTop: '2rem', padding: '1.5rem', marginBottom: '1.5rem' }}>
              <h3 style={{ marginBottom: '1rem' }}>Current Leaderboard</h3>
              <LeaderboardView participants={activeParticipants} />
            </div>
          )}

          <div className="controls" style={{ marginTop: '2rem' }}>
            {quizStatus === "answering" && (
              <button className="secondary-btn" onClick={handleShowResults}>Skip Timer & Show Results</button>
            )}

            {quizStatus === "results" && (
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="primary-btn" onClick={handleShowLeaderboard} style={{ padding: '0.8rem 2.2rem', fontSize: '1.1rem' }}>
                  {currentQuestionIndex + 1 < questions.length 
                    ? "Show Leaderboard →" 
                    : "Show Final Leaderboard →"}
                </button>
              </div>
            )}

            {quizStatus === "question_leaderboard" && (
              <button className="primary-btn" onClick={handleNextQuestion} style={{ padding: '0.8rem 2.2rem', fontSize: '1.1rem' }}>
                {currentQuestionIndex + 1 < questions.length 
                  ? `Next Question (${currentQuestionIndex + 2}/${questions.length}) →` 
                  : "View Final Podium →"}
              </button>
            )}
          </div>
          
          <div style={{ marginTop: '2rem', color: '#666' }}>
            Responses: {responses.length} / {activeParticipants.length}
          </div>
        </div>
      )}

      {showEndDialog && (
        <div className="dialog-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="dialog-box" style={{ background: '#fff', borderRadius: '14px', padding: '2rem', maxWidth: '420px', width: '90%', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)' }}>
            <h2 style={{ color: '#111', marginBottom: '0.75rem', fontSize: '1.4rem' }}>End Quiz Now?</h2>
            <p style={{ color: '#666', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
              Are you sure you want to end this quiz? This will finalize scores and show the final results to all participants.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button 
                type="button" 
                className="dialog-cancel-btn"
                onClick={() => setShowEndDialog(false)}
                style={{ padding: '0.6rem 1.4rem', borderRadius: '8px', border: '1px solid #ccc', background: '#f4f4f5', cursor: 'pointer', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="dialog-delete-btn"
                onClick={confirmEndQuiz}
                style={{ padding: '0.6rem 1.4rem', borderRadius: '8px', border: 'none', background: '#ef4444', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
              >
                Yes, End Quiz
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HostLiveQuiz;
