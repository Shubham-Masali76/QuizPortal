import { useState } from "react";

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
      if (authPage === "login") {
        await handleLogin(email, password);
      } else {
        await handleSignup(email, password);
      }
    } catch (error) {
      switch (error.code) {
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
          setError("Incorrect email or password.");
          break;

        case "auth/user-not-found":
          setError("No account was found with this email.");
          break;

        case "auth/wrong-password":
          setError("Incorrect email or password.");
          break;

        default:
          setError("Something went wrong. Please try again.");
      }
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {onBack && (
          <button type="button" className="auth-back-btn" onClick={onBack}>
            ← Back to Role Selection
          </button>
        )}
        <div className="auth-logo">QuizPortal</div>

        <h1>{authPage === "login" ? "Welcome Back" : "Create Account"}</h1>

        <p className="auth-subtitle">
          {authPage === "login"
            ? "Login to continue to QuizPortal."
            : "Create your QuizPortal account."}
        </p>

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>Email</label>

            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <label>Password</label>

            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {authPage === "signup" && (
            <div className="auth-field">
              <label>Confirm Password</label>

              <input
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          )}

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="primary-btn auth-submit">
            {authPage === "login" ? "Login" : "Create Account"}
          </button>
        </form>

        <div className="auth-switch">
          {authPage === "login" ? (
            <>
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setAuthPage("signup");
                  setError("");
                }}
              >
                Sign Up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setAuthPage("login");
                  setError("");
                }}
              >
                Login
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
