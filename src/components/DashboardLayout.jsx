import { useState } from "react";
import { CpuIcon } from "./NeonIcons";
import NeonBackground from "./NeonBackground";

export default function DashboardLayout({
  children,
  page,
  setPage,
  handleMyQuizzes,
  handleLogout,
  handleOpenCreateQuiz,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNav = (targetPage, action) => {
    setMobileMenuOpen(false);
    if (action) {
      action();
    } else if (targetPage) {
      setPage(targetPage);
    }
  };

  return (
    <div className="neon-theme-wrapper neon-dashboard-wrapper">
      <NeonBackground />
      <div className="neon-dashboard-layout">
        {/* Mobile Header Bar */}
        <div className="neon-mobile-topbar">
          <div className="neon-brand-badge" style={{ gap: "0.5rem" }}>
            <CpuIcon size={26} />
            <div className="neon-brand-text">
              <span className="neon-brand-org" style={{ fontSize: "0.7rem" }}>AWS BUILDER GROUP</span>
              <span className="neon-brand-sub" style={{ fontSize: "0.6rem" }}>HOST CONSOLE</span>
            </div>
          </div>
          <button
            type="button"
            className="neon-mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? "✕" : "☰"}
          </button>
        </div>

        {/* Sidebar (Desktop Persistent & Mobile Drawer) */}
        <aside className={`neon-sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
          <div className="neon-sidebar-brand">
            <CpuIcon size={32} />
            <div className="neon-brand-text">
              <span className="neon-brand-org">AWS STUDENT BUILDER</span>
              <span className="neon-brand-sub">AT NKOCET • HOST CONSOLE</span>
            </div>
          </div>

          <nav className="neon-sidebar-nav">
            <button
              type="button"
              className={`neon-sidebar-link ${page === "dashboard" ? "active" : ""}`}
              onClick={() => handleNav("dashboard")}
            >
              <span className="neon-nav-icon">📊</span>
              <span className="neon-nav-text">Dashboard</span>
            </button>

            <button
              type="button"
              className={`neon-sidebar-link ${page === "quizzes" ? "active" : ""}`}
              onClick={() => handleNav(null, handleMyQuizzes)}
            >
              <span className="neon-nav-icon">📁</span>
              <span className="neon-nav-text">My Quizzes</span>
            </button>

            <button
              type="button"
              className={`neon-sidebar-link ${page === "create" ? "active" : ""}`}
              onClick={() => handleNav("create", handleOpenCreateQuiz)}
            >
              <span className="neon-nav-icon">✨</span>
              <span className="neon-nav-text">+ Create Quiz</span>
            </button>

            <div className="neon-sidebar-spacer" />

            <button
              type="button"
              className="neon-sidebar-logout"
              onClick={handleLogout}
            >
              <span>Logout</span>
              <span>⎋</span>
            </button>
          </nav>
        </aside>

        {/* Backdrop for mobile drawer */}
        {mobileMenuOpen && (
          <div 
            className="neon-mobile-backdrop" 
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Main Dashboard Stage Content */}
        <main className="neon-dashboard-main">
          {children}
        </main>
      </div>
    </div>
  );
}
