import NeonBackground from "./NeonBackground";
import { CpuIcon } from "./NeonIcons";

export default function NeonLoadingScreen({ 
  title = "QuizPortal",
  subtitle = "AWS STUDENT BUILDER GROUP • NKOCET",
  status = "INITIALIZING PORTAL SESSION..."
}) {
  return (
    <div className="neon-theme-wrapper neon-centered-wrapper" style={{ minHeight: "100vh", overflow: "hidden" }}>
      <NeonBackground />
      <div className="neon-loader-container">
        {/* Holographic Glowing Core with Dual Orbiting Rings */}
        <div className="neon-loader-glow-orb">
          <div className="neon-loader-ring neon-ring-outer" />
          <div className="neon-loader-ring neon-ring-inner" />
          
          <div className="neon-loader-core">
            <CpuIcon size={40} />
          </div>
        </div>

        {/* Brand & Loading Info */}
        <div className="neon-loader-text-group">
          <div className="neon-loader-brand-sub">{subtitle}</div>
          <h1 className="neon-loader-title">
            {title === "QuizPortal" ? (
              <>
                Welcome to <span>QuizPortal</span>
              </>
            ) : (
              title
            )}
          </h1>
          
          {/* Futuristic Scanline Loading Bar */}
          <div className="neon-loader-bar-track">
            <div className="neon-loader-bar-fill" />
          </div>

          <div className="neon-loader-status-text">
            <span className="neon-loader-status-dot" />
            {status}
          </div>
        </div>
      </div>
    </div>
  );
}
