import { useState, useEffect } from "react";
import { getStableParticipantPosition } from "../utils/helpers";
import LobbyReactionsOverlay from "./LobbyReactionsOverlay";

export default function ParticipantAvatarCluster({ activeParticipants, quizId }) {
  // Store persistent positions mapped by participantId so existing avatars never jump/reshuffle
  const [positionsCache] = useState(() => new Map());
  const [renderItems, setRenderItems] = useState([]);
  const [exitTimers] = useState(() => new Map());

  useEffect(() => {
    // 1. Build a lookup of current active participant objects by ID
    const activeMap = new Map();
    activeParticipants.forEach((p) => {
      activeMap.set(p.id, p);
    });

    // 2. Ensure every active participant has a stable position in cache
    activeParticipants.forEach((p) => {
      if (!positionsCache.has(p.id)) {
        let bestPos = getStableParticipantPosition(p.id, 0);
        let bestMinDist = 0;

        // Deterministic collision avoidance using participantId iterations
        for (let attempt = 0; attempt < 8; attempt++) {
          const cand = getStableParticipantPosition(p.id, attempt);
          let minDist = Infinity;
          for (const [otherId, otherPos] of positionsCache.entries()) {
            if (otherId === p.id) continue;
            const dx = cand.x - otherPos.x;
            const dy = (cand.y - otherPos.y) * 1.3;
            const d = Math.hypot(dx, dy);
            if (d < minDist) minDist = d;
          }

          if (minDist > 10) {
            bestPos = cand;
            break;
          }
          if (minDist > bestMinDist) {
            bestMinDist = minDist;
            bestPos = cand;
          }
        }

        positionsCache.set(p.id, bestPos);
      }
    });

    // 3. Update renderItems with enter/active/leave lifecycle
    const frameId = requestAnimationFrame(() => {
      setRenderItems((prevItems) => {
        const prevMap = new Map(prevItems.map((item) => [item.id, item]));
        const nextItems = [];

        // A. Keep or add active participants
        const isSingle = activeParticipants.length === 1;

        activeParticipants.forEach((p) => {
          const deterministicPos =
            positionsCache.get(p.id) || getStableParticipantPosition(p.id, 0);
          const pos = isSingle
            ? { ...deterministicPos, x: 50, y: 50 }
            : deterministicPos;
          const existing = prevMap.get(p.id);

          // Cancel any pending exit timer if reconnected
          if (exitTimers.has(p.id)) {
            clearTimeout(exitTimers.get(p.id));
            exitTimers.delete(p.id);
          }

          if (existing) {
            nextItems.push({
              ...existing,
              x: pos.x,
              y: pos.y,
              name: p.name,
              avatar: p.avatar,
              status: "active",
            });
          } else {
            // New participant entering
            nextItems.push({
              id: p.id,
              name: p.name,
              avatar: p.avatar,
              x: pos.x,
              y: pos.y,
              animVariant: pos.animVariant,
              duration: pos.duration,
              delay: pos.delay,
              driftScale: pos.driftScale,
              status: "entering",
            });
          }
        });

        // B. Identify leaving participants (in prevItems but no longer in activeParticipants)
        prevItems.forEach((item) => {
          if (!activeMap.has(item.id)) {
            if (item.status !== "leaving") {
              nextItems.push({
                ...item,
                status: "leaving",
              });

              // Set timer to cleanly remove after exit animation finishes (400ms)
              const timerId = setTimeout(() => {
                positionsCache.delete(item.id);
                exitTimers.delete(item.id);
                setRenderItems((curr) => curr.filter((c) => c.id !== item.id));
              }, 400);

              exitTimers.set(item.id, timerId);
            } else {
              // Already leaving, keep until timer removes it
              nextItems.push(item);
            }
          }
        });

        return nextItems;
      });
    });

    return () => cancelAnimationFrame(frameId);
  }, [activeParticipants, positionsCache, exitTimers]);

  // Promote 'entering' items to 'active' on next animation frame
  useEffect(() => {
    const hasEntering = renderItems.some((it) => it.status === "entering");
    if (hasEntering) {
      const animFrame = requestAnimationFrame(() => {
        setRenderItems((curr) =>
          curr.map((it) =>
            it.status === "entering" ? { ...it, status: "active" } : it,
          ),
        );
      });
      return () => cancelAnimationFrame(animFrame);
    }
  }, [renderItems]);

  const count = activeParticipants.length;

  // Dynamically scale down avatars if there are many participants (e.g. up to 100)
  // Scale stays at 1.0 until 20 participants, then linearly shrinks down to 0.5 at 100 participants
  const scale = count <= 20 ? 1 : Math.max(0.5, 1 - ((count - 20) / 160));


  return (
    <div className="avatar-cluster-section">
      {count > 0 && (
        <div className="avatar-cluster-header">
          <div className="cluster-header-count">
            {count === 1
              ? "1 participant joined"
              : `${count} participants joined`}
          </div>
        </div>
      )}

      <div className="avatar-cluster-stage">
        {count === 0 && renderItems.length === 0 ? (
          <div className="cluster-empty-state">
            <div className="cluster-radar-pulse">
              <span className="radar-ring r1"></span>
              <span className="radar-ring r2"></span>
              <span className="radar-icon">👥</span>
            </div>
            <p className="cluster-empty-title">
              Waiting for participants to join...
            </p>
            <span className="cluster-empty-hint">
              Share the quiz code above to let participants enter the room
            </span>
          </div>
        ) : (
          renderItems.map((item) => (
            <div
              key={item.id}
              className={`avatar-cluster-node ${item.status}`}
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                '--dynamic-scale': scale,
              }}
              title={item.name}
            >
              <div
                className={`avatar-floating-wrapper drift-v${item.animVariant || 1}`}
                style={{
                  animationDuration: `${item.duration}s`,
                  animationDelay: `${item.delay}s`,
                  "--drift-intensity": item.driftScale || 1,
                }}
              >
                <div className="avatar-bubble">
                  <span className="avatar-emoji">{item.avatar || "👤"}</span>
                </div>
              </div>
            </div>
          ))
        )}
        <LobbyReactionsOverlay quizId={quizId} />
      </div>
    </div>
  );
}
