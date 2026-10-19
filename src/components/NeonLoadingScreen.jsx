import { useState, useEffect } from "react";
import NeonBackground from "./NeonBackground";
import { CpuIcon } from "./NeonIcons";

export default function NeonLoadingScreen({ 
  title = "QuizMeter",
  subtitle = "AWS STUDENT BUILDER GROUP • NKOCET",
  status = "INITIALIZING PORTAL SESSION...",
  isExiting = false,
  overlay = true
}) {
  const [phaseIndex, setPhaseIndex] = useState(0);

  useEffect(() => {
    if (status !== "INITIALIZING PORTAL SESSION...") return;

    const t1 = setTimeout(() => {
      setPhaseIndex(1);
    }, 500);

    const t2 = setTimeout(() => {
      setPhaseIndex(2);
    }, 1100);

    const t3 = setTimeout(() => {
      setPhaseIndex(3);
    }, 1650);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [status]);

  const defaultPhases = [
    "INITIALIZING PORTAL SESSION...",
    "ESTABLISHING AWS SECURE PROTOCOL...",
    "SYNCHRONIZING PORTAL ASSETS...",
    "READY • LAUNCHING ARENA..."
  ];

  const currentStatus = status === "INITIALIZING PORTAL SESSION..."
    ? defaultPhases[phaseIndex] || status
    : status;

  return (
    <div 
      className={`neon-theme-wrapper neon-centered-wrapper ${overlay ? "neon-loader-overlay" : ""} ${isExiting ? "neon-loader-exiting" : ""}`} 
      style={{ minHeight: "100vh", overflow: "hidden" }}
    >
      <NeonBackground />
      <div className={`neon-loader-container ${isExiting ? "neon-loader-content-exiting" : ""}`}>
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
            {title === "QuizPortal" || title === "QuizMeter" ? (
              <>
                Welcome to <span>QuizMeter</span>
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
            {currentStatus}
          </div>
        </div>
      </div>
    </div>
  );
}
