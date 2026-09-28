import { useState, useEffect } from "react";
import { collection, getDocs, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { ref as rtdbRef, remove as rtdbRemove } from "firebase/database";
import { db, rtdb } from "../services/firebase";
import { sortParticipants } from "../utils/helpers";
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
        // Fetch participants
        const pSnap = await getDocs(collection(db, "quizzes", quizId, "participants"));
        const pList = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        pList.sort(sortParticipants);
        setParticipants(pList);

        // Fetch questions
        const qSnap = await getDocs(collection(db, "quizzes", quizId, "questions"));
        const qList = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setQuestions(qList);

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

      // 2. Delete Participants from Firestore
      const pSnap = await getDocs(collection(db, "quizzes", quizId, "participants"));
      for (const pDoc of pSnap.docs) {
        await deleteDoc(doc(db, "quizzes", quizId, "participants", pDoc.id));
      }

      // 3. Delete Responses from RTDB
      await rtdbRemove(rtdbRef(rtdb, `responses/${quizId}`));

      // 4. Reset Quiz State to draft
      await updateDoc(doc(db, "quizzes", quizId), {
        status: "draft",
        currentQuestionIndex: 0
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
    <div className="analytics-page" style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Quiz Analytics</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="primary-btn" style={{ background: '#ff595e' }} onClick={handleExportAndReset}>
            Export & Reset Quiz
          </button>
          <button className="secondary-btn" onClick={() => setPage("quizzes")}>← Back to Quizzes</button>
        </div>
      </div>
      
      {/* Charts Row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', marginBottom: '3rem' }}>
        
        <div style={{ flex: '1 1 500px', background: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
          <h3 style={{ textAlign: 'center', marginBottom: '1rem', color: '#333' }}>Participant Scores (Bar Chart)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={scoreData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#666' }} />
              <YAxis tick={{ fill: '#666' }} />
              <Tooltip 
                formatter={(value, name, props) => [`${value} pts`, `Rank #${props.payload.rank}`]}
                labelStyle={{ fontWeight: 'bold', color: '#333' }}
              />
              <Bar dataKey="score" fill="#3a86ff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ flex: '1 1 300px', background: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
          <h3 style={{ textAlign: 'center', marginBottom: '1rem', color: '#333' }}>Overall Accuracy (Donut Chart)</h3>
          {totalCorrect + totalIncorrect > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={accuracyData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {accuracyData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
             <p style={{ textAlign: 'center', color: '#999', marginTop: '5rem' }}>No responses recorded yet.</p>
          )}
        </div>

      </div>

      {/* Detailed Table */}
      <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
        <h3 style={{ marginBottom: '1rem', color: '#333' }}>Detailed Participant Rankings</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee', color: '#666' }}>
              <th style={{ padding: '1rem 0.5rem' }}>Rank</th>
              <th style={{ padding: '1rem 0.5rem' }}>Name</th>
              <th style={{ padding: '1rem 0.5rem' }}>Total Score</th>
              <th style={{ padding: '1rem 0.5rem' }}>Correct Answers</th>
              <th style={{ padding: '1rem 0.5rem' }}>Avg Speed (s)</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p, idx) => {
               // Calculate average speed
               let avgSpeed = 0;
               if (p.correctAnswersCount > 0 && p.totalResponseTimeMs) {
                 avgSpeed = (p.totalResponseTimeMs / p.correctAnswersCount / 1000).toFixed(2);
               } else if (p.totalResponseTimeMs) {
                 avgSpeed = (p.totalResponseTimeMs / 1000).toFixed(2);
               }
               return (
                <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '1rem 0.5rem', fontWeight: 'bold', color: '#3a86ff' }}>#{idx + 1}</td>
                  <td style={{ padding: '1rem 0.5rem', fontWeight: 'bold' }}>{p.name}</td>
                  <td style={{ padding: '1rem 0.5rem' }}>{p.score || 0}</td>
                  <td style={{ padding: '1rem 0.5rem' }}>{p.correctAnswersCount || 0}</td>
                  <td style={{ padding: '1rem 0.5rem' }}>{avgSpeed > 0 ? `${avgSpeed}s` : '-'}</td>
                </tr>
              );
            })}
            {participants.length === 0 && (
              <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>No participants found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
