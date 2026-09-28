import { useState, useRef, useEffect } from "react";
import { ref as rtdbRef, onChildAdded as rtdbOnChildAdded } from "firebase/database";
import { rtdb } from "../services/firebase";
import { hashString } from "../utils/helpers";

export default function LobbyReactionsOverlay({ quizId }) {
  const [reactions, setReactions] = useState([]);
  const timersRef = useRef(new Set());

  useEffect(() => {
    if (!quizId) return;

    const currentTimers = timersRef.current;
    const reactionsRef = rtdbRef(rtdb, `reactions/${quizId}`);

    // Listen to individual reaction events using onChildAdded
    const unsubscribe = rtdbOnChildAdded(
      reactionsRef,
      (snapshot) => {
        const data = snapshot.val();
        if (!data || !data.emoji) return;

        const now = Date.now();
        const createdAt =
          typeof data.createdAt === "number" ? data.createdAt : now;

        // ⏳ Stale Reaction Protection: ignore if older than 6000ms
        if (now - createdAt > 6000) {
          return;
        }

        const reactionId = snapshot.key;
        const seed = reactionId || String(now + Math.random());

        // Derive varied organic animation parameters using stable hash of seed
        const startX = 12 + (hashString(seed + "_x") % 77); // 12% to 88%
        const driftX = (hashString(seed + "_drift") % 51) - 25; // -25px to +25px
        const variant = (hashString(seed + "_var") % 3) + 1; // 1, 2, or 3
        const duration = parseFloat(
          (2.7 + (hashString(seed + "_dur") % 8) / 10).toFixed(2),
        ); // 2.7s to 3.4s
        const scale = parseFloat(
          (0.95 + (hashString(seed + "_scl") % 25) / 100).toFixed(2),
        ); // 0.95 to 1.20
        const rot = (hashString(seed + "_rot") % 25) - 12; // -12deg to +12deg

        const newReaction = {
          id: reactionId,
          emoji: data.emoji,
          startX,
          driftX,
          variant,
          duration,
          scale,
          rot,
        };

        setReactions((prev) => {
          if (prev.some((r) => r.id === reactionId)) return prev;
          return [...prev, newReaction];
        });

        // Remove from local UI state after approximately 3.2 seconds
        const timerId = setTimeout(() => {
          currentTimers.delete(timerId);
          setReactions((prev) => prev.filter((r) => r.id !== reactionId));
        }, 3200);

        currentTimers.add(timerId);
      },
      (err) => {
        console.error("Error listening to lobby reactions:", err);
      },
    );

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
      currentTimers.forEach((t) => clearTimeout(t));
      currentTimers.clear();
    };
  }, [quizId]);

  if (reactions.length === 0) return null;

  return (
    <div className="lobby-reactions-overlay" aria-hidden="true">
      {reactions.map((r) => (
        <div
          key={r.id}
          className={`floating-reaction variant-${r.variant}`}
          style={{
            left: `${r.startX}%`,
            "--drift-x": `${r.driftX}px`,
            "--reaction-scale": r.scale,
            "--reaction-rot": `${r.rot}deg`,
            animationDuration: `${r.duration}s`,
          }}
        >
          <span className="floating-reaction-emoji">{r.emoji}</span>
        </div>
      ))}
    </div>
  );
}
