export default function RoleSelection({ onSelectRole }) {
  return (
    <div className="role-page">
      <div className="role-selection-container">
        <div className="role-logo">QuizPortal</div>
        <h1>Welcome to QuizPortal</h1>
        <p className="role-subtitle">Choose how you would like to continue:</p>

        <div className="role-cards-grid">
          <div
            className="role-card host-card"
            onClick={() => onSelectRole("host")}
          >
            <h2>Host</h2>
            <p>Create, manage, and host live quizzes for your audience.</p>
            <button
              type="button"
              className="primary-btn role-btn"
              onClick={(e) => {
                e.stopPropagation();
                onSelectRole("host");
              }}
            >
              Continue as Host →
            </button>
          </div>

          <div
            className="role-card participant-card"
            onClick={() => onSelectRole("participant")}
          >
            <h2>Participant</h2>
            <p>Join and play live quizzes with a code. No login required.</p>
            <button
              type="button"
              className="secondary-btn role-btn"
              onClick={(e) => {
                e.stopPropagation();
                onSelectRole("participant");
              }}
            >
              Continue as Participant →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
