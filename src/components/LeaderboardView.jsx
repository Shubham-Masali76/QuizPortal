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
  const colors = ['#ff595e', '#ff924c', '#ffca3a', '#c5ca30', '#8ac926', '#1982c4', '#6a4c93', '#8338ec', '#ff006e', '#3a86ff'];

  return (
    <div className="horizontal-leaderboard" style={{ position: 'relative', height: `${topParticipants.length * 60}px`, marginTop: '2rem', textAlign: 'left' }}>
      {topParticipants.map((p, idx) => {
        // Current index determines vertical position
        const currentIndex = phase === 3 ? newOrderMap[p.id] : idx;
        const currentScore = phase >= 2 ? p.score : p.oldScore;
        const widthPct = Math.max(10, (currentScore / maxScore) * 100);
        
        return (
          <div 
            key={p.id} 
            style={{ 
              position: 'absolute',
              top: `${currentIndex * 60}px`,
              left: 0,
              right: 0,
              height: '50px',
              display: 'flex', 
              alignItems: 'center', 
              transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)' 
            }}
          >
            <div style={{ width: '80px', fontWeight: 'bold', fontSize: '1.2rem', textAlign: 'right', paddingRight: '1rem' }}>
              {currentScore || 0} p
            </div>
            
            <div style={{ flex: 1, position: 'relative', height: '40px' }}>
              <div style={{ 
                width: `${widthPct}%`, 
                height: '100%', 
                backgroundColor: colors[currentIndex % colors.length], 
                transition: 'width 0.8s ease-out, background-color 0.8s ease',
                borderRadius: '0 20px 20px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingRight: '10px'
              }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', transform: 'translateX(100%)', position: 'absolute', right: '-10px' }}>
                    <span style={{ fontSize: '1.5rem' }}>{p.avatar}</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{p.name}</span>
                 </div>
              </div>
            </div>

            {/* Flying Points Animation */}
            {p.earned > 0 && phase < 2 && (
              <div style={{ 
                position: 'absolute', 
                right: phase === 1 ? 'calc(100% - 100px)' : '20px', 
                color: '#28a745', 
                fontWeight: 'bold', 
                fontSize: '1.5rem',
                opacity: 1,
                transition: 'right 1.5s ease-in-out',
                zIndex: 10
              }}>
                +{p.earned}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
