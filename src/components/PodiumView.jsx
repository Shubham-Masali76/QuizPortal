import { sortParticipants } from "../utils/helpers";

export default function PodiumView({ participants }) {
  const sorted = [...participants].sort(sortParticipants);
  const top3 = sorted.slice(0, 3);

  const first = top3[0];
  const second = top3[1];
  const third = top3[2];

  return (
    <div className="podium-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', height: '400px', gap: '2rem', marginTop: '4rem', paddingBottom: '2rem' }}>
      
      {/* 2nd Place */}
      {second && (
        <div className="podium-place" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'slideUp 1s ease-out 0.5s both' }}>
          <div className="avatar" style={{ fontSize: '4rem', marginBottom: '0.5rem' }}>{second.avatar || '🥈'}</div>
          <div className="name" style={{ fontWeight: 'bold', fontSize: '1.5rem', marginBottom: '0.5rem' }}>{second.name}</div>
          <div className="score" style={{ color: '#666', fontSize: '1.2rem', marginBottom: '1rem' }}>{second.score || 0} pts</div>
          <div className="bar" style={{ 
            width: '120px', height: '180px', backgroundColor: '#C0C0C0', 
            borderTopLeftRadius: '12px', borderTopRightRadius: '12px', 
            display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '1.5rem', 
            color: 'white', fontSize: '3rem', fontWeight: 'bold', boxShadow: 'inset 0 -20px 20px rgba(0,0,0,0.1)' 
          }}>2</div>
        </div>
      )}

      {/* 1st Place */}
      {first && (
        <div className="podium-place" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'slideUp 1s ease-out 1s both', zIndex: 10 }}>
          <div className="avatar" style={{ fontSize: '5.5rem', marginBottom: '0.5rem', filter: 'drop-shadow(0 0 10px gold)' }}>{first.avatar || '👑'}</div>
          <div className="name" style={{ fontWeight: 'bold', fontSize: '1.8rem', marginBottom: '0.5rem' }}>{first.name}</div>
          <div className="score" style={{ color: '#666', fontSize: '1.3rem', marginBottom: '1rem' }}>{first.score || 0} pts</div>
          <div className="bar" style={{ 
            width: '140px', height: '260px', backgroundColor: '#FFD700', 
            borderTopLeftRadius: '12px', borderTopRightRadius: '12px', 
            display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '1.5rem', 
            color: 'white', fontSize: '4rem', fontWeight: 'bold', 
            boxShadow: '0 -10px 20px rgba(255, 215, 0, 0.4), inset 0 -20px 20px rgba(0,0,0,0.1)' 
          }}>1</div>
        </div>
      )}

      {/* 3rd Place */}
      {third && (
        <div className="podium-place" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'slideUp 1s ease-out 0s both' }}>
          <div className="avatar" style={{ fontSize: '3.5rem', marginBottom: '0.5rem' }}>{third.avatar || '🥉'}</div>
          <div className="name" style={{ fontWeight: 'bold', fontSize: '1.4rem', marginBottom: '0.5rem' }}>{third.name}</div>
          <div className="score" style={{ color: '#666', fontSize: '1.1rem', marginBottom: '1rem' }}>{third.score || 0} pts</div>
          <div className="bar" style={{ 
            width: '110px', height: '130px', backgroundColor: '#CD7F32', 
            borderTopLeftRadius: '12px', borderTopRightRadius: '12px', 
            display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '1.5rem', 
            color: 'white', fontSize: '2.5rem', fontWeight: 'bold', boxShadow: 'inset 0 -20px 20px rgba(0,0,0,0.1)' 
          }}>3</div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
