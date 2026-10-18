import { useState, useEffect } from "react";
import { sortParticipants } from "../utils/helpers";

export default function LeaderboardView({ participants }) {
  const [phase, setPhase] = useState(0); 
  // Phase 0: Show old scores + points on the right
  // Phase 1: Animate points moving left
  // Phase 2: Points merged, update numbers
  // Phase 3: Rearrange rows

  const [topParticipants] = useState(() => {
    const initialList = participants.map(p => {
      const earned = p.lastPointsEarned || 0;
      const oldScore = (p.score || 0) - earned;
      return {
        ...p,
        oldScore: Math.max(0, oldScore),
        earned
      };
    });
    // Temporary sort by oldScore for phase 0 (before points are merged)
    initialList.sort((a, b) => b.oldScore - a.oldScore);
    return initialList.slice(0, 10);
  });

  useEffect(() => {
    // Start animation sequence
    const t1 = setTimeout(() => setPhase(1), 1500); // hold +points on right
    const t2 = setTimeout(() => setPhase(2), 3000); // slide points and merge
    const t3 = setTimeout(() => setPhase(3), 4500); // reorder rows

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  // For phase 3, we need to know the new order.
  const newOrderMap = {};
  if (phase === 3) {
    const sortedByNew = [...topParticipants].sort(sortParticipants);
    sortedByNew.forEach((p, idx) => {
      newOrderMap[p.id] = idx;
    });
  }

  const maxScore = topParticipants.reduce((max, p) => Math.max(max, p.score || 1), 1);
  const gradients = [
    'linear-gradient(90deg, #7c3aed, #c084fc)',
    'linear-gradient(90deg, #0284c7, #38bdf8)',
    'linear-gradient(90deg, #059669, #34d399)',
    'linear-gradient(90deg, #d97706, #fbbf24)',
    'linear-gradient(90deg, #e11d48, #fb7185)',
    'linear-gradient(90deg, #4f46e5, #818cf8)',
    'linear-gradient(90deg, #0891b2, #22d3ee)',
    'linear-gradient(90deg, #9333ea, #e879f9)',
    'linear-gradient(90deg, #c026d3, #f472b6)',
    'linear-gradient(90deg, #2563eb, #60a5fa)',
  ];

  return (
    <div className="neon-leaderboard-track" style={{ height: `${topParticipants.length * 58}px` }}>
      {topParticipants.map((p, idx) => {
        // Current index determines vertical position
        const currentIndex = phase === 3 ? newOrderMap[p.id] : idx;
        const currentScore = phase >= 2 ? p.score : p.oldScore;
        // Cap at 58% so the user avatar & name have guaranteed room on the right on all screen sizes
        const widthPct = Math.max(10, Math.min(58, (currentScore / maxScore) * 58));
        
        return (
          <div 
            key={p.id} 
            className="neon-leaderboard-row"
            style={{ 
              top: `${currentIndex * 58}px`,
            }}
          >
            <div className="neon-leaderboard-score-tag">
              {currentScore || 0} <span style={{ fontSize: '0.85rem', color: '#c084fc' }}>pts</span>
            </div>
            
            <div className="neon-leaderboard-bar-slot">
              <div 
                className="neon-leaderboard-bar-fill"
                style={{ 
                  width: `${widthPct}%`, 
                  background: gradients[currentIndex % gradients.length], 
                }}
              >
                 <div className="neon-leaderboard-user-info">
                    <span style={{ fontSize: '1.45rem', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))' }}>{p.avatar || '👤'}</span>
                    <span className="neon-leaderboard-name">{p.name}</span>
                 </div>
              </div>
            </div>

            {/* Flying Points Animation */}
            {p.earned > 0 && phase < 2 && (
              <div 
                className="neon-flying-points"
                style={{ 
                  right: phase === 1 ? 'calc(100% - 110px)' : '25px', 
                  opacity: 1,
                }}
              >
                +{p.earned}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

