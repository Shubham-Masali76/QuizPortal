import { useState, useEffect, useCallback } from "react";
import { doc, updateDoc, collection, getDocs, onSnapshot, query, writeBatch } from "firebase/firestore";
import { ref as rtdbRef, onValue } from "firebase/database";
import { db, rtdb } from "../services/firebase";
import LeaderboardView from "../components/LeaderboardView";
import PodiumView from "../components/PodiumView";
import { useRef } from "react";

const HostLiveQuiz = ({ quizId, setPage }) => {
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [quizStatus, setQuizStatus] = useState("loading"); // loading, reading, answering, results, leaderboard
  const [timeLeft, setTimeLeft] = useState(0);
  const [responses, setResponses] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [quizData, setQuizData] = useState(null);
  const isTransitioning = useRef(false);

  const updateQuizState = useCallback(async (index, status, timeLimit = 0) => {
    setCurrentQuestionIndex(index);
    setQuizStatus(status);
    
    const updateData = {
      currentQuestionIndex: index,
      questionStatus: status, // "reading", "answering", "closed"
    };

    if (timeLimit > 0) {
      updateData.phaseEndTime = Date.now() + (timeLimit * 1000);
    }

    await updateDoc(doc(db, "quizzes", quizId), updateData);
  }, [quizId]);

  const handleShowResults = useCallback(async () => {
    if (isTransitioning.current) return;
    isTransitioning.current = true;
    
    // Set local state immediately to avoid re-triggering
    setQuizStatus("results");

    // 1. Calculate scores and batch update participants
    if (quizData && currentQuestionIndex >= 0) {
      const currentQuestion = questions[currentQuestionIndex];
      
      const updates = {};
      // Calculate scores first
      participants.forEach(p => {
        updates[p.id] = { ...p, lastPointsEarned: 0 };
      });

      responses.forEach(resp => {
        if (!updates[resp.participantId]) return;
        
        let pointsEarned = 0;
        const maxTime = quizData.answeringTimeLimit || 20;
        const phaseEnd = quizData.phaseEndTime || Date.now();
        
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
      // We import sortParticipants at the top if we need to, but it's not imported yet in HostLiveQuiz!
      // Let's implement a quick inline sort identical to the helper
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
    await updateDoc(doc(db, "quizzes", quizId), { questionStatus: "results" });
    isTransitioning.current = false;
  }, [quizId, currentQuestionIndex, updateQuizState, responses, questions, quizData, participants]);

  const handleShowLeaderboard = async () => {
    await updateQuizState(currentQuestionIndex, "question_leaderboard");
    await updateDoc(doc(db, "quizzes", quizId), { questionStatus: "question_leaderboard" });
  };

  // Fetch all questions and participants on mount
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Fetch quiz data to get timer limits
        const getDoc = await import("firebase/firestore").then(m => m.getDoc);
        const qzSnap = await getDoc(doc(db, "quizzes", quizId));
        let qData = {};
        if (qzSnap.exists()) {
          qData = qzSnap.data();
          setQuizData(qData);
        }

        // Fetch questions
        const qSnap = await getDocs(collection(db, "quizzes", quizId, "questions"));
        const qList = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setQuestions(qList);

        // Start first question
        if (qList.length > 0 && qData.status === "live" && !qData.questionStatus) {
          const rLimit = qData.readingTimeLimit || 10;
          setTimeLeft(rLimit);
          await updateQuizState(0, "reading", rLimit);
        } else if (qList.length === 0) {
          setQuizStatus("error"); // No questions
        } else {
          // Resume quiz state
          setQuizStatus(qData.questionStatus || "reading");
          setCurrentQuestionIndex(qData.currentQuestionIndex || 0);
        }
      } catch (err) {
        console.error("Failed to load quiz data", err);
      }
    };
    
    fetchInitialData();
  }, [quizId, updateQuizState]);

  // Listen to participants for live leaderboard updates
  useEffect(() => {
    const q = query(collection(db, "quizzes", quizId, "participants"));
    const unsub = onSnapshot(q, (snap) => {
      setParticipants(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [quizId]);

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

  // Timer logic
  const handleStartAnswering = useCallback(async () => {
    if (isTransitioning.current) return;
    isTransitioning.current = true;
    
    const aLimit = quizData?.answeringTimeLimit || 20;
    setTimeLeft(aLimit);
    await updateQuizState(currentQuestionIndex, "answering", aLimit);
    
    isTransitioning.current = false;
  }, [quizData, currentQuestionIndex, updateQuizState]);

  useEffect(() => {
    let timer;
    if (quizStatus === "reading" || quizStatus === "answering") {
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
      if (quizStatus === "reading") {
        handleStartAnswering();
      } else if (quizStatus === "answering") {
        handleShowResults();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, quizStatus]); // exclude handlers so we don't re-trigger on response updates

  const handleNextQuestion = async () => {
    if (isTransitioning.current) return;
    isTransitioning.current = true;
    
    if (currentQuestionIndex + 1 < questions.length) {
      const rLimit = quizData?.readingTimeLimit || 10;
      setTimeLeft(rLimit);
      await updateQuizState(currentQuestionIndex + 1, "reading", rLimit);
    } else {
      setQuizStatus("leaderboard");
      await updateDoc(doc(db, "quizzes", quizId), { status: "completed", questionStatus: "closed" });
    }
    
    isTransitioning.current = false;
  };

  const handleEndQuiz = async () => {
    setPage("dashboard");
  };

  if (questions.length === 0 && quizStatus !== "error") {
    return <div className="host-live-container"><h2>Loading Quiz...</h2></div>;
  }
  if (quizStatus === "error") {
    return <div className="host-live-container"><h2>Error: No questions found for this quiz.</h2><button onClick={handleEndQuiz}>Back to Dashboard</button></div>;
  }

  const currentQuestion = questions[currentQuestionIndex];

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
          <h2 style={{ fontSize: '3rem', margin: '2rem 0', color: '#ffca3a', textShadow: '2px 2px 4px rgba(0,0,0,0.2)' }}>Final Podium</h2>
          <PodiumView participants={participants} />
          <button className="primary-btn" onClick={handleEndQuiz} style={{ marginTop: '3rem', padding: '1rem 3rem', fontSize: '1.5rem' }}>Finish Quiz</button>
        </div>
      ) : (
        <div className="question-view">
          <div className="status-badge" style={{ marginBottom: '1rem', fontWeight: 'bold', color: '#666' }}>
            Question {currentQuestionIndex + 1} of {questions.length}
          </div>
          
          <h1 style={{ fontSize: '2.5rem', marginBottom: '2rem' }}>{currentQuestion.question}</h1>

          {quizStatus === "reading" && (
            <div className="timer" style={{ fontSize: '3rem', fontWeight: 'bold', color: '#555' }}>
              Reading Time: {timeLeft}s
            </div>
          )}

          {quizStatus === "answering" && (
            <div className="timer" style={{ fontSize: '4rem', fontWeight: 'bold', color: timeLeft <= 5 ? 'red' : '#333' }}>
              {timeLeft}
            </div>
          )}

          {quizStatus === "reading" && (
            <div style={{ margin: '3rem 0', fontSize: '1.2rem', color: '#666', fontStyle: 'italic' }}>
              Options will appear when answering time starts...
            </div>
          )}

          {quizStatus === "answering" && (
            <div className="options-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', margin: '2rem 0' }}>
            {currentQuestion.options.map((opt, idx) => (
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
              {currentQuestion.options.map((opt, idx) => {
                const optionNumber = idx + 1;
                const isCorrect = currentQuestion.correctAnswer === optionNumber;
                const votes = optionCounts[optionNumber];
                const heightPct = maxVotes > 0 ? (votes / maxVotes) * 100 : 0;
                const colors = ['#a0c4ff', '#ffc6ff', '#ff595e', '#8eecf5', '#ffd6a5'];
                
                return (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '120px' }}>
                    <span style={{ marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '1.5rem' }}>{votes}</span>
                    <div style={{ 
                      width: '100%', 
                      height: `${Math.max(heightPct, 2)}%`, 
                      backgroundColor: isCorrect ? '#4ade80' : colors[idx % colors.length], 
                      transition: 'height 1s ease-out',
                      borderRadius: '4px 4px 0 0'
                    }}></div>
                    <span style={{ marginTop: '1rem', textAlign: 'center', fontSize: '1rem', color: '#666', minHeight: '40px' }}>{opt}</span>
                  </div>
                );
              })}
            </div>
          )}

          {quizStatus === "question_leaderboard" && (
            <div className="card" style={{ marginTop: '2rem', minHeight: '600px' }}>
              <h3>Current Leaderboard</h3>
              <LeaderboardView participants={participants} />
            </div>
          )}

          <div className="controls" style={{ marginTop: '3rem' }}>
            {quizStatus === "reading" && (
              <button className="primary-btn" onClick={handleStartAnswering}>Skip Reading Time</button>
            )}
            
            {quizStatus === "answering" && (
              <button className="secondary-btn" onClick={handleShowResults}>Skip Timer & Show Results</button>
            )}

            {quizStatus === "results" && (
              <button className="primary-btn" onClick={handleShowLeaderboard}>Show Leaderboard</button>
            )}

            {quizStatus === "question_leaderboard" && (
              <button className="primary-btn" onClick={handleNextQuestion}>
                {currentQuestionIndex + 1 < questions.length ? "Next Question" : "Finish Quiz"}
              </button>
            )}
          </div>
          
          <div style={{ marginTop: '2rem', color: '#666' }}>
            Responses: {responses.length} / {participants.length}
          </div>
        </div>
      )}
    </div>
  );
};

export default HostLiveQuiz;
