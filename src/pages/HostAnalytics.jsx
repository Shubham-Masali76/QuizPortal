import { useState, useEffect } from "react";
import { collection, getDocs, getDoc, doc, updateDoc, writeBatch } from "firebase/firestore";
import { ref as rtdbRef, remove as rtdbRemove } from "firebase/database";
import { db, rtdb } from "../services/firebase";
import { sortParticipants, sortQuestions } from "../utils/helpers";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend
} from 'recharts';

export default function HostAnalytics({ quizId, setPage }) {
  const [participants, setParticipants] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalyticsData = async () => {
      try {
        // Fetch quiz, participants and questions concurrently
        const [qzSnap, qSnap, pSnap] = await Promise.all([
          getDoc(doc(db, "quizzes", quizId)),
          getDocs(collection(db, "quizzes", quizId, "questions")),
          getDocs(collection(db, "quizzes", quizId, "participants")),
        ]);

        const qOrder = qzSnap.exists() ? qzSnap.data().questionOrder : null;
        const pList = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        pList.sort(sortParticipants);
        setParticipants(pList);

        const qList = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setQuestions(sortQuestions(qList, qOrder));

        // No need to fetch responses from Firestore anymore, we can aggregate from participants directly!
      } catch (err) {
        console.error("Error fetching analytics data", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalyticsData();
  }, [quizId]);

  const handleExportAndReset = async () => {
    if (!window.confirm("Are you sure? This will download the results as a CSV and permanently delete all participants and responses from this quiz so you can reuse it!")) return;

    try {
      setLoading(true);
      // 1. Export CSV
      const csvRows = [];
      csvRows.push(["Rank", "Name", "Total Score", "Correct Answers", "Avg Speed (s)"]);
      
      participants.forEach((p, idx) => {
        let avgSpeed = 0;
        if (p.correctAnswersCount > 0 && p.totalResponseTimeMs) {
          avgSpeed = (p.totalResponseTimeMs / p.correctAnswersCount / 1000).toFixed(2);
        } else if (p.totalResponseTimeMs) {
          avgSpeed = (p.totalResponseTimeMs / 1000).toFixed(2);
        }
        csvRows.push([idx + 1, `"${p.name}"`, p.score || 0, p.correctAnswersCount || 0, avgSpeed]);
      });

      const csvString = csvRows.map(r => r.join(",")).join("\n");
      const blob = new Blob([csvString], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quiz_analytics_${quizId}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      // 2. Delete Participants from Firestore (batched for performance)
      const pSnap = await getDocs(collection(db, "quizzes", quizId, "participants"));
      if (!pSnap.empty) {
        const batch = writeBatch(db);
        pSnap.docs.forEach(pDoc => {
          batch.delete(pDoc.ref);
        });
        await batch.commit();
      }

      // 3. Delete Responses from RTDB (safely caught in case of permission/network issue)
      try {
        await rtdbRemove(rtdbRef(rtdb, `responses/${quizId}`));
      } catch (rtdbErr) {
        console.warn("Could not clear RTDB responses:", rtdbErr);
      }

      // 4. Reset Quiz State to draft
      await updateDoc(doc(db, "quizzes", quizId), {
        status: "draft",
        questionStatus: "closed",
        currentQuestionIndex: 0,
        phaseEndTime: null
      });

      alert("Quiz exported and reset successfully! You can now reuse this quiz.");
      setPage("quizzes");
    } catch (err) {
      console.error("Error resetting quiz:", err);
      alert("An error occurred while resetting the quiz.");
      setLoading(false);
    }
  };


  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}><h2>Loading Analytics...</h2></div>;
  }

  // Prepare Chart Data
  // 1. Scores Bar Chart
  const scoreData = participants.map((p, idx) => ({
    name: p.name,
    score: p.score || 0,
    rank: idx + 1
  }));

  // 2. Accuracy Pie Chart
  let totalCorrect = 0;
  participants.forEach(p => {
    totalCorrect += (p.correctAnswersCount || 0);
  });
  const totalPossibleAnswers = participants.length * questions.length;
  const totalIncorrect = Math.max(0, totalPossibleAnswers - totalCorrect);
  
  const accuracyData = [
    { name: 'Correct Answers', value: totalCorrect },
    { name: 'Incorrect Answers', value: totalIncorrect }
  ];
  const COLORS = ['#4ade80', '#ff595e'];

  return (
    <div className="neon-analytics-container">
      <div className="neon-dash-header">
        <div className="neon-dash-titles">
          <span className="neon-badge-pulse">● SESSION REPORT</span>
          <h1 className="neon-dash-title">Quiz Analytics & Rankings</h1>
          <p className="neon-dash-sub">Post-game participant scores, accuracy distribution, and speed metrics.</p>
        </div>
        <div className="neon-analytics-header-actions">
          <button type="button" className="neon-btn-danger" onClick={handleExportAndReset}>
            <span>📥 Export & Reset Quiz</span>
          </button>
          <button type="button" className="neon-btn-ghost" onClick={() => setPage("quizzes")}>
            ← Back to Quizzes
          </button>
        </div>
      </div>
      
      {/* Charts Row */}
      <div className="neon-analytics-charts-row">
        <div className="neon-card neon-analytics-chart-card">
          <h3 className="neon-chart-title">Participant Scores (Top Performers)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={scoreData} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(168, 85, 247, 0.15)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#c084fc', fontSize: 12 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <Tooltip 
                formatter={(value, name, props) => [`${value} pts`, `Rank #${props.payload.rank}`]}
                contentStyle={{ background: '#120b24', borderColor: '#a855f7', borderRadius: '10px', color: '#fff' }}
              />
              <Bar dataKey="score" fill="#a855f7" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="neon-card neon-analytics-chart-card">
          <h3 className="neon-chart-title">Overall Accuracy</h3>
          {totalCorrect + totalIncorrect > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={accuracyData}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={95}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {accuracyData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ background: '#120b24', borderColor: '#a855f7', borderRadius: '10px', color: '#fff' }}
                />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ color: '#cbd5e1' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="neon-empty-chart-text">No responses recorded yet.</p>
          )}
        </div>
      </div>

      {/* Detailed Table */}
      <div className="neon-card neon-analytics-table-card">
        <h3 className="neon-chart-title" style={{ textAlign: 'left', marginBottom: '1.25rem' }}>Detailed Participant Standings</h3>
        <div className="neon-table-responsive-wrapper">
          <table className="neon-analytics-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Participant</th>
                <th>Total Score</th>
                <th>Correct Answers</th>
                <th>Avg Speed</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p, idx) => {
                let avgSpeed = 0;
                if (p.correctAnswersCount > 0 && p.totalResponseTimeMs) {
                  avgSpeed = (p.totalResponseTimeMs / p.correctAnswersCount / 1000).toFixed(2);
                } else if (p.totalResponseTimeMs) {
                  avgSpeed = (p.totalResponseTimeMs / 1000).toFixed(2);
                }
                return (
                  <tr key={p.id}>
                    <td className="neon-rank-cell">#{idx + 1}</td>
                    <td className="neon-name-cell">{p.name}</td>
                    <td className="neon-score-cell">{p.score || 0}</td>
                    <td className="neon-correct-cell">{p.correctAnswersCount || 0}</td>
                    <td className="neon-speed-cell">{avgSpeed > 0 ? `${avgSpeed}s` : '-'}</td>
                  </tr>
                );
              })}
              {participants.length === 0 && (
                <tr>
                  <td colSpan="5" className="neon-no-data-cell">No participants found in this session.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
