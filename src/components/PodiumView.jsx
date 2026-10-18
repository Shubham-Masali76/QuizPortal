import { sortParticipants } from "../utils/helpers";

export default function PodiumView({ participants }) {
  const sorted = [...participants].sort(sortParticipants);
  const top3 = sorted.slice(0, 3);

  const first = top3[0];
  const second = top3[1];
  const third = top3[2];

  return (
    <div className="neon-podium-container">
      {/* 2nd Place */}
      {second && (
        <div className="neon-podium-column second" style={{ animation: 'slideUp 0.8s ease-out 0.25s both' }}>
          <div className="neon-podium-avatar-wrap">
            <div className="neon-podium-avatar">{second.avatar || '🥈'}</div>
            <div className="neon-podium-name">{second.name}</div>
            <div className="neon-podium-score">{second.score || 0} pts</div>
          </div>
          <div className="neon-podium-pedestal silver">2</div>
        </div>
      )}

      {/* 1st Place */}
      {first && (
        <div className="neon-podium-column first" style={{ animation: 'slideUp 0.9s ease-out 0.5s both', zIndex: 10 }}>
          <div className="neon-podium-avatar-wrap">
            <span className="neon-podium-crown">👑</span>
            <div className="neon-podium-avatar">{first.avatar || '👤'}</div>
            <div className="neon-podium-name">{first.name}</div>
            <div className="neon-podium-score">{first.score || 0} pts</div>
          </div>
          <div className="neon-podium-pedestal gold">1</div>
        </div>
      )}

      {/* 3rd Place */}
      {third && (
        <div className="neon-podium-column third" style={{ animation: 'slideUp 0.8s ease-out 0s both' }}>
          <div className="neon-podium-avatar-wrap">
            <div className="neon-podium-avatar">{third.avatar || '🥉'}</div>
            <div className="neon-podium-name">{third.name}</div>
            <div className="neon-podium-score">{third.score || 0} pts</div>
          </div>
          <div className="neon-podium-pedestal bronze">3</div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(70px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

