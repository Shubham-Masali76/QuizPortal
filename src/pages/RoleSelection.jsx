import { CpuIcon, CrownIcon, UsersIcon } from "../components/NeonIcons";
import NeonBackground from "../components/NeonBackground";

export default function RoleSelection({ onSelectRole }) {
  return (
    <div className="neon-theme-wrapper neon-role-wrapper">
      <NeonBackground />
      <div className="neon-mobile-frame neon-role-frame">
        {/* Brand Header */}
        <header className="neon-header-bar" style={{ justifyContent: "center" }}>
          <div className="neon-brand-badge" style={{ flexDirection: "column", alignItems: "center", gap: "0.4rem" }}>
            <CpuIcon size={34} />
            <div className="neon-brand-text" style={{ alignItems: "center", textAlign: "center" }}>
              <span className="neon-brand-org" style={{ fontSize: "0.68rem" }}>AWS STUDENT BUILDER GROUP</span>
              <span className="neon-brand-sub" style={{ fontSize: "0.62rem" }}>AT NKOCET</span>
            </div>
          </div>
        </header>

        {/* Intro */}
        <div className="neon-role-container">
          <h1 className="neon-role-title">
            Welcome to <span>QuizMeter</span>
          </h1>
          <p className="neon-role-subtitle">
            Choose how you would like to continue:
          </p>

          {/* Cards Grid */}
          <div className="neon-role-cards-grid">
            {/* Host Card */}
            <div
              className="neon-card neon-role-card"
              onClick={() => onSelectRole("host")}
            >
              <div className="neon-role-card-header">
                <div className="neon-role-icon-box">
                  <CrownIcon size={24} color="#e9d5ff" />
                </div>
                <h2>Host</h2>
              </div>
              <p>Create, manage, and host live quizzes for your audience.</p>
              <button
                type="button"
                className="neon-btn-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectRole("host");
                }}
              >
                Continue as Host →
              </button>
            </div>

            {/* Participant Card */}
            <div
              className="neon-card neon-role-card"
              onClick={() => onSelectRole("participant")}
            >
              <div className="neon-role-card-header">
                <div className="neon-role-icon-box">
                  <UsersIcon size={24} color="#e9d5ff" />
                </div>
                <h2>Participant</h2>
              </div>
              <p>Join and play live quizzes with a code. No login required.</p>
              <button
                type="button"
                className="neon-btn-ghost"
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
    </div>
  );
}
