export default function DashboardLayout({
  children,
  page,
  setPage,
  handleMyQuizzes,
  handleLogout,
}) {
  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">QuizPortal</div>

        <nav className="sidebar-nav">
          <button
            className={page === "dashboard" ? "nav-item active" : "nav-item"}
            onClick={() => setPage("dashboard")}
          >
            Dashboard
          </button>

          <button
            className={page === "quizzes" ? "nav-item active" : "nav-item"}
            onClick={handleMyQuizzes}
          >
            My Quizzes
          </button>

          <button
            className={page === "create" ? "nav-item active" : "nav-item"}
            onClick={() => setPage("create")}
          >
            + Create Quiz
          </button>

          <button className="nav-item logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </nav>
      </aside>

      <main className="dashboard-content">{children}</main>
    </div>
  );
}
