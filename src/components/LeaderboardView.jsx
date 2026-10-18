import { useState, useEffect } from "react";
import { sortParticipants } from "../utils/helpers";

export default function LeaderboardView({ participants = [] }) {
  const [phase, setPhase] = useState(0); 
  // Phase 0: Show pre-question scores + earned points badge
  // Phase 1: Animate / pulse points merge
  // Phase 2: Points merged into total score & progress bar expands
  // Phase 3: Smoothly reorder rows to new standings

  const [topParticipants] = useState(() => {
    const list = (participants || []).map(p => {
      const earned = p.lastPointsEarned || 0;
      const oldScore = (p.score || 0) - earned;
      return {
        ...p,
        oldScore: Math.max(0, oldScore),
        earned
      };
    });
    // Initial sort by oldScore prior to merging new points
    list.sort((a, b) => (b.oldScore || 0) - (a.oldScore || 0));
    return list.slice(0, 10);
  });

  useEffect(() => {
    // Timed choreography for scoreboard reveal
    const t1 = setTimeout(() => setPhase(1), 1200); // Pulse earned points
    const t2 = setTimeout(() => setPhase(2), 2400); // Merge points into score
    const t3 = setTimeout(() => setPhase(3), 3800); // Reorder rows

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  // For phase 3, compute the new rank order
  const newOrderMap = {};
  if (phase === 3) {
    const sortedByNew = [...topParticipants].sort(sortParticipants);
    sortedByNew.forEach((p, idx) => {
      newOrderMap[p.id] = idx;
    });
  }

  // Find maximum score across all participants in this phase to scale progress bars
  const maxScore = topParticipants.reduce((max, p) => {
    const s = phase >= 2 ? (p.score || 0) : (p.oldScore || 0);
    return Math.max(max, s);
  }, 0);

  const gradients = [
    'linear-gradient(90deg, rgba(168, 85, 247, 0.45) 0%, rgba(216, 180, 254, 0.75) 100%)', // Purple
    'linear-gradient(90deg, rgba(14, 165, 233, 0.45) 0%, rgba(56, 189, 248, 0.75) 100%)', // Sky
    'linear-gradient(90deg, rgba(16, 185, 129, 0.45) 0%, rgba(52, 211, 153, 0.75) 100%)', // Emerald
    'linear-gradient(90deg, rgba(245, 158, 11, 0.45) 0%, rgba(251, 191, 36, 0.75) 100%)', // Amber
    'linear-gradient(90deg, rgba(244, 63, 94, 0.45) 0%, rgba(251, 113, 133, 0.75) 100%)', // Rose
    'linear-gradient(90deg, rgba(99, 102, 241, 0.45) 0%, rgba(129, 140, 248, 0.75) 100%)', // Indigo
    'linear-gradient(90deg, rgba(6, 182, 212, 0.45) 0%, rgba(34, 211, 238, 0.75) 100%)', // Cyan
    'linear-gradient(90deg, rgba(217, 70, 239, 0.45) 0%, rgba(232, 121, 249, 0.75) 100%)', // Fuchsia
    'linear-gradient(90deg, rgba(34, 197, 94, 0.45) 0%, rgba(74, 222, 128, 0.75) 100%)', // Green
    'linear-gradient(90deg, rgba(59, 130, 246, 0.45) 0%, rgba(96, 165, 250, 0.75) 100%)', // Blue
  ];

  if (!topParticipants.length) {
    return (
      <div className="neon-lb-empty">
        <p>No participants in this session yet.</p>
      </div>
    );
  }

  return (
    <div 
      className="neon-leaderboard-track" 
      style={{ height: `calc(${topParticipants.length} * var(--lb-row-height, 64px))` }}
    >
      {topParticipants.map((p, idx) => {
        const currentIndex = phase === 3 ? (newOrderMap[p.id] ?? idx) : idx;
        const currentScore = phase >= 2 ? (p.score || 0) : (p.oldScore || 0);
        
        // Scale proportional width (0% if maxScore is 0)
        const widthPct = maxScore > 0 
          ? Math.max(0, Math.min(100, Math.round((currentScore / maxScore) * 100))) 
          : 0;

        const isRank1 = currentIndex === 0;
        const isRank2 = currentIndex === 1;
        const isRank3 = currentIndex === 2;
        const rankClass = isRank1 ? 'rank-gold' : isRank2 ? 'rank-silver' : isRank3 ? 'rank-bronze' : '';

        return (
          <div 
            key={p.id} 
            className="neon-leaderboard-row"
            style={{ 
              '--current-index': currentIndex,
            }}
          >
            <div className={`neon-lb-card ${rankClass}`}>
              {/* Dynamic glowing progress bar filling behind row content */}
              <div 
                className="neon-lb-progress-fill"
                style={{ 
                  width: `${widthPct}%`,
                  background: gradients[currentIndex % gradients.length]
                }}
              />

              {/* Structured Inner Content (Never overflows or detaches) */}
              <div className="neon-lb-row-inner">
                {/* Rank Badge */}
                <div className={`neon-lb-rank-badge ${rankClass}`}>
                  #{currentIndex + 1}
                </div>

                {/* Avatar and Name */}
                <div className="neon-lb-user-group">
                  <span className="neon-lb-avatar">{p.avatar || '👤'}</span>
                  <span className="neon-lb-name" title={p.name}>{p.name}</span>
                </div>

                {/* Score Section */}
                <div className="neon-lb-score-group">
                  {p.earned > 0 && phase < 2 && (
                    <span className={`neon-lb-earned-pill ${phase === 1 ? 'merging' : ''}`}>
                      +{p.earned}
                    </span>
                  )}
                  <div className="neon-lb-score-val">
                    <span className="neon-lb-points-num">{currentScore.toLocaleString()}</span>
                    <span className="neon-lb-points-label">pts</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
