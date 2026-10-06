import { useState, useEffect } from "react";
import { doc, onSnapshot, collection, getDocs } from "firebase/firestore";
import { db } from "../services/firebase";
import { submitResponseRTDB } from "../utils/helpers";

export default function ParticipantLiveQuiz({ quizId, participantId, onLeave }) {
  const [questions, setQuestions] = useState([]);
  const [quizState, setQuizState] = useState({
    currentQuestionIndex: 0,
    questionStatus: "loading", // reading, answering, closed
    status: "live",
  });
  const [selectedOption, setSelectedOption] = useState(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [participantData, setParticipantData] = useState(null);


  useEffect(() => {
    // Fetch all questions once
    const fetchQuestions = async () => {
      try {
        const qSnap = await getDocs(collection(db, "quizzes", quizId, "questions"));
        const qList = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setQuestions(qList);
      } catch (err) {
        console.error("Error fetching questions:", err);
      }
    };
    fetchQuestions();
  }, [quizId]);

  useEffect(() => {
    // Listen ONLY to this participant's document to avoid N^2 read explosion
    const pRef = doc(db, "quizzes", quizId, "participants", participantId);
    const unsub = onSnapshot(pRef, (docSnap) => {
      if (docSnap.exists()) {
        setParticipantData({ id: docSnap.id, ...docSnap.data() });
      }
    });
    return () => unsub();
  }, [quizId, participantId]);

  useEffect(() => {
    let timer;
    if (quizState?.phaseEndTime && (quizState.questionStatus === "reading" || quizState.questionStatus === "answering")) {
      // Calculate initial time once, then decrement locally to prevent UI jitter
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

  useEffect(() => {
    // Listen to quiz state changes
    const unsub = onSnapshot(doc(db, "quizzes", quizId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setQuizState({
          currentQuestionIndex: data.currentQuestionIndex || 0,
          questionStatus: data.questionStatus || "reading",
          status: data.status,
          phaseEndTime: data.phaseEndTime || null,
        });
      }
    });
    return () => unsub();
  }, [quizId]);

  useEffect(() => {
    // Reset selection if moving to a new question
    setSelectedOption(null);
    setHasSubmitted(false);
  }, [quizState.currentQuestionIndex]);

  const handleSelectOption = async (optionIndex) => {
    if (hasSubmitted || quizState.questionStatus !== "answering") return;
    
    setSelectedOption(optionIndex);
    setHasSubmitted(true);

    const optionNumber = optionIndex + 1;

    try {
      // Save response to Realtime Database
      await submitResponseRTDB(quizId, quizState.currentQuestionIndex, participantId, optionNumber);
    } catch (err) {
      console.error("Error saving response:", err);
      // Revert if failed
      setSelectedOption(null);
      setHasSubmitted(false);
      alert("Error saving response: " + err.message);
    }
  };

  if (questions.length === 0 || quizState.questionStatus === "loading") {
    return (
      <div className="participant-live-container" style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Loading next question...</h2>
      </div>
    );
  }

  if (quizState.status === "completed") {
    return (
      <div className="participant-live-container" style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Quiz Completed!</h2>
        <p>Look at the host screen for the final leaderboard.</p>
        <button className="primary-btn" onClick={onLeave} style={{ marginTop: '2rem' }}>Leave Quiz</button>
      </div>
    );
  }

  const currentQuestion = questions[quizState.currentQuestionIndex];

  return (
    <div className="participant-live-container" style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
      
      <div className="status-badge" style={{ marginBottom: '1rem', fontWeight: 'bold', color: '#666' }}>
        Question {quizState.currentQuestionIndex + 1} of {questions.length}
      </div>

      <h2 style={{ fontSize: '1.8rem', marginBottom: '2rem' }}>{currentQuestion?.question}</h2>

      {quizState.questionStatus === "reading" && (
        <div className="reading-state" style={{ padding: '3rem 1rem', background: '#f5f5f5', borderRadius: '12px', border: '2px dashed #ccc' }}>
          <h3>Get Ready!</h3>
          <div className="timer" style={{ fontSize: '3rem', fontWeight: 'bold', color: '#555', margin: '1rem 0' }}>
            {timeLeft}s
          </div>
          <p style={{ color: '#666', marginTop: '1rem' }}>Read the question above. Options will appear shortly.</p>
        </div>
      )}

      {quizState.questionStatus === "answering" && (
        <div className="answering-state">
          <div className="timer" style={{ fontSize: '2rem', fontWeight: 'bold', color: timeLeft <= 5 ? 'red' : '#333', marginBottom: '1.5rem' }}>
            Time Left: {timeLeft}s
          </div>
          {hasSubmitted ? (
            <div className="submitted-state" style={{ padding: '3rem 1rem', background: '#e6f4ea', borderRadius: '12px', border: '2px solid #34a853', color: '#137333' }}>
              <h3>Answer Submitted!</h3>
              <p style={{ marginTop: '1rem' }}>You selected: {currentQuestion?.options[selectedOption]}</p>
              <p style={{ marginTop: '0.5rem' }}>Waiting for time to run out...</p>
            </div>
          ) : (
            <div className="options-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
              {currentQuestion?.options.map((opt, idx) => (
                <button
                  key={idx}
                  className="option-btn"
                  onClick={() => handleSelectOption(idx)}
                  style={{
                    padding: '1.5rem',
                    fontSize: '1.2rem',
                    fontWeight: 'bold',
                    border: '2px solid #ddd',
                    borderRadius: '8px',
                    background: 'white',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.borderColor = '#007bff'; e.currentTarget.style.background = '#f0f8ff'; }}
                  onMouseOut={(e) => { e.currentTarget.style.borderColor = '#ddd'; e.currentTarget.style.background = 'white'; }}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {quizState.questionStatus === "closed" && (
        <div className="closed-state" style={{ padding: '3rem 1rem', background: '#fff3cd', borderRadius: '12px', border: '2px solid #ffeeba', color: '#856404' }}>
          <h3>Time's Up!</h3>
          <p style={{ marginTop: '1rem' }}>Look at the host screen for results.</p>
        </div>
      )}
      
      {quizState.questionStatus === "results" && (
        <div className="results-state" style={{ padding: '3rem 1rem', background: participantData?.lastPointsEarned > 0 ? '#d4edda' : '#f8d7da', borderRadius: '12px', border: `2px solid ${participantData?.lastPointsEarned > 0 ? '#c3e6cb' : '#f5c6cb'}`, color: participantData?.lastPointsEarned > 0 ? '#155724' : '#721c24' }}>
          <h3>{participantData?.lastPointsEarned > 0 ? "Correct!" : "Incorrect"}</h3>
          
          <div style={{ margin: '2rem 0', fontSize: '3rem', fontWeight: 'bold' }}>
            +{participantData?.lastPointsEarned || 0} <span style={{ fontSize: '1.5rem' }}>points</span>
          </div>

          {participantData?.lastResponseTimeMs !== undefined && (
            <p style={{ fontSize: '1.2rem', marginTop: '1rem' }}>
              You answered in <strong>{(participantData.lastResponseTimeMs / 1000).toFixed(2)}s</strong>
            </p>
          )}

          <p style={{ marginTop: '2rem', fontStyle: 'italic' }}>Look at the host screen for the chart.</p>
        </div>
      )}

      {quizState.questionStatus === "question_leaderboard" && (
        <div className="leaderboard-state" style={{ padding: '3rem 1rem', background: '#e0f7fa', borderRadius: '12px', border: '2px solid #b2ebf2', color: '#006064' }}>
          <h3>Leaderboard Update!</h3>
          <div style={{ margin: '1rem 0', fontSize: '1.5rem' }}>
            Your Rank: <strong style={{ fontSize: '2.5rem', color: '#00838f' }}>#{participantData?.rank || "-"}</strong>
          </div>
          <div style={{ margin: '2rem 0', fontSize: '4rem', fontWeight: 'bold', color: '#00838f' }}>
            {participantData?.score || 0} <span style={{ fontSize: '2rem' }}>p</span>
          </div>
          <p style={{ fontSize: '1.2rem', marginTop: '1rem' }}>Look at the big screen to see the top rankings!</p>
        </div>
      )}

    </div>
  );
}
