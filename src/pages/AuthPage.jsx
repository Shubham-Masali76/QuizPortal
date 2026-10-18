import { useState } from "react";
import { CpuIcon } from "../components/NeonIcons";
import NeonBackground from "../components/NeonBackground";

export default function AuthPage({
  authPage,
  setAuthPage,
  handleLogin,
  handleSignup,
  onBack,
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Please fill in all fields.");
      return;
    }

    if (authPage === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      if (authPage === "login") {
        await handleLogin(email, password);
      } else {
        await handleSignup(email, password);
      }
    } catch (err) {
      switch (err.code) {
        case "auth/weak-password":
          setError("Password must be at least 6 characters.");
          break;
        case "auth/email-already-in-use":
          setError("An account with this email already exists.");
          break;
        case "auth/invalid-email":
          setError("Please enter a valid email address.");
          break;
        case "auth/invalid-credential":
        case "auth/user-not-found":
        case "auth/wrong-password":
          setError("Incorrect email or password.");
          break;
        default:
          setError("Authentication failed. Please verify your details.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="neon-theme-wrapper neon-auth-wrapper">
      <NeonBackground />
      <div className="neon-auth-frame">
        {/* Brand Header */}
        <header className="neon-auth-header">
          {onBack && (
            <button type="button" className="neon-auth-back-btn" onClick={onBack}>
              ← Back to Role Selection
            </button>
          )}
          <div className="neon-brand-badge" style={{ flexDirection: "column", alignItems: "center", gap: "0.4rem" }}>
            <CpuIcon size={36} />
            <div className="neon-brand-text" style={{ alignItems: "center", textAlign: "center" }}>
              <span className="neon-brand-org" style={{ fontSize: "0.75rem" }}>AWS STUDENT BUILDER GROUP</span>
              <span className="neon-brand-sub" style={{ fontSize: "0.65rem" }}>AT NKOCET • HOST CONSOLE</span>
            </div>
          </div>
        </header>

        {/* Cyber Auth Card */}
        <div className="neon-card neon-auth-card">
          <div className="neon-auth-titles">
            <h1 className="neon-auth-heading">
              {authPage === "login" ? "Welcome Back" : "Create Account"}
            </h1>
            <p className="neon-auth-sub">
              {authPage === "login"
                ? "Enter your credentials to access the QuizPortal Host Console."
                : "Register a host account to create, manage, and launch live quizzes."}
            </p>
          </div>

          {error && (
            <div className="neon-auth-error">
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="neon-auth-form">
            <div className="neon-input-group">
              <label className="neon-label">Email Address</label>
              <input
                type="email"
                className="neon-input"
                placeholder="host@quizportal.io"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="neon-input-group">
              <label className="neon-label">Password</label>
              <input
                type="password"
                className="neon-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={authPage === "login" ? "current-password" : "new-password"}
                required
              />
            </div>

            {authPage === "signup" && (
              <div className="neon-input-group">
                <label className="neon-label">Confirm Password</label>
                <input
                  type="password"
                  className="neon-input"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
            )}

            <button
              type="submit"
              className="neon-btn-primary neon-auth-submit"
              disabled={loading}
              style={{ width: "100%", marginTop: "0.5rem" }}
            >
              {loading
                ? "Authenticating..."
                : authPage === "login"
                ? "Login to Console →"
                : "Create Host Account →"}
            </button>
          </form>

          <div className="neon-auth-footer">
            <span>
              {authPage === "login"
                ? "Don't have a host account?"
                : "Already have an account?"}
            </span>
            <button
              type="button"
              className="neon-auth-toggle-btn"
              onClick={() => {
                setAuthPage(authPage === "login" ? "signup" : "login");
                setError("");
              }}
            >
              {authPage === "login" ? "Sign Up" : "Login"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
