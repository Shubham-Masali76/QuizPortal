import { useState, useRef, useEffect } from "react";
import { sendLobbyReaction, REACTION_EMOJIS } from "../utils/helpers";

export default function ParticipantReactionBar({ quizId, participantId }) {
  const [isCooldown, setIsCooldown] = useState(false);
  const cooldownTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
    };
  }, []);

  const handleSend = (emoji) => {
    if (isCooldown || !quizId || !participantId) return;

    // Trigger instant reaction send
    sendLobbyReaction(quizId, participantId, emoji);

    // Enter 2-second cooldown
    setIsCooldown(true);
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
    }
    cooldownTimerRef.current = setTimeout(() => {
      setIsCooldown(false);
    }, 2000);
  };

  return (
    <div className="lobby-reaction-bar-container">
      <div className="lobby-reaction-bar-label">Send Reaction</div>
      <div
        className={`lobby-reaction-bar ${isCooldown ? "is-cooling" : ""}`}
        role="group"
        aria-label="Reaction buttons"
      >
        {REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="reaction-btn"
            onClick={() => handleSend(emoji)}
            disabled={isCooldown}
            title={isCooldown ? "Please wait 2 seconds..." : `Send ${emoji}`}
            aria-label={`Send ${emoji} reaction`}
          >
            <span className="reaction-emoji">{emoji}</span>
          </button>
        ))}

        {/* Subtle cooldown progress indicator */}
        <div className="reaction-cooldown-track" aria-hidden="true">
          <div className="reaction-cooldown-fill" />
        </div>
      </div>
      {isCooldown && (
        <span className="reaction-cooldown-hint" aria-live="polite">
          Wait 2s...
        </span>
      )}
    </div>
  );
}
