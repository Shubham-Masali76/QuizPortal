import { useState } from "react";
import { collection, query, where, getDocs, addDoc } from "firebase/firestore";
import { ref as rtdbRef, get as rtdbGet } from "firebase/database";
import { db, rtdb } from "../services/firebase";
import Toast from "../components/Toast";
import { generateDynamicAvatar } from "../utils/helpers";
import { 
  CpuIcon, 
  TrophyIcon, 
  KeyIcon, 
  UserIcon 
} from "../components/NeonIcons";
import NeonBackground from "../components/NeonBackground";

export default function JoinQuizScreen({ selectedQuiz, onBack, onJoined }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const showMessage = (msg) => {
    setMessage(msg);
    setTimeout(() => {
      setMessage("");
    }, 3000);
  };

  const handleJoinSubmit = async (e) => {
    e.preventDefault();

    const normalizedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();

    if (!normalizedCode) {
      showMessage("Please enter the quiz code.");
      return;
    }

    const codeRegex = /^[A-Z0-9]{6}$/;
    if (!codeRegex.test(normalizedCode)) {
      showMessage("Quiz code must be 6 characters using A-Z and 0-9.");
      return;
    }

    if (!trimmedName) {
      showMessage("Please enter your name.");
      return;
    }

    if (trimmedName.length > 30) {
      showMessage("Name cannot exceed 30 characters.");
      return;
    }

    setIsVerifying(true);

    try {
      const q = query(
        collection(db, "quizzes"),
        where("quizCode", "==", normalizedCode),
      );

      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        showMessage("Quiz not found. Please check the quiz code.");
        setIsVerifying(false);
        return;
      }

      const quizDoc = querySnapshot.docs[0];
      const quizData = quizDoc.data();

      if (quizData.status !== "waiting" && quizData.status !== "live") {
        showMessage("This quiz is no longer available.");
        setIsVerifying(false);
        return;
      }

      if (quizDoc.id !== selectedQuiz.id) {
        showMessage("The quiz code does not match the selected quiz.");
        setIsVerifying(false);
        return;
      }

      // Fetch participant documents from Firestore
      const participantsSnapshot = await getDocs(
        collection(db, "quizzes", selectedQuiz.id, "participants"),
      );

      // Determine currently active participant IDs from RTDB so stale docs do not block avatars
      const activeParticipantIds = new Set();
      try {
        const presenceSnap = await rtdbGet(
          rtdbRef(rtdb, `presence/${selectedQuiz.id}`),
        );
        if (presenceSnap.exists()) {
          const presenceData = presenceSnap.val() || {};
          Object.keys(presenceData).forEach((pid) => {
            if (
              presenceData[pid] === true ||
              presenceData[pid]?.state === "online"
            ) {
              activeParticipantIds.add(pid);
            }
          });
        }
      } catch (rtdbErr) {
        console.warn(
          "Could not read RTDB presence for avatar occupancy, falling back to Firestore only:",
          rtdbErr,
        );
        participantsSnapshot.docs.forEach((doc) =>
          activeParticipantIds.add(doc.id),
        );
      }

      // Only avatars belonging to currently active participants are considered occupied
      const existingAvatars = new Set(
        participantsSnapshot.docs
          .filter((doc) => activeParticipantIds.has(doc.id))
          .map((doc) => doc.data().avatar)
          .filter(Boolean),
      );

      const avatar = generateDynamicAvatar(existingAvatars);

      // Register temporary participant presence in the quiz's participants subcollection
      const participantRef = await addDoc(
        collection(db, "quizzes", selectedQuiz.id, "participants"),
        {
          name: trimmedName,
          avatar,
          joinedAt: new Date(),
        },
      );

      if (onJoined) {
        onJoined({
          quizId: selectedQuiz.id,
          quizTitle: selectedQuiz.title || quizData.title,
          participantId: participantRef.id,
          participantName: trimmedName,
          participantAvatar: avatar,
        });
      }
    } catch (err) {
      console.error(
        "Error verifying quiz code or registering participant:",
        err,
      );
      showMessage(
        "Something went wrong while joining the quiz. Please try again.",
      );
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="neon-theme-wrapper neon-centered-wrapper">
      <NeonBackground />
      <div className="neon-mobile-frame neon-centered-frame">
        {/* Header Bar matching Image 3 */}
        <header className="neon-header-bar">
          <div className="neon-brand-badge">
            <CpuIcon size={26} />
            <div className="neon-brand-text">
              <span className="neon-brand-org">AWS STUDENT BUILDER GROUP</span>
              <span className="neon-brand-sub">AT NKOCET</span>
            </div>
          </div>
          <button
            type="button"
            className="neon-pill-btn"
            onClick={onBack}
            disabled={isVerifying}
          >
            ← Back to Live Quizzes
          </button>
        </header>

        {/* Join Quiz Neon Card (Image 3) */}
        <div className="neon-card" style={{ padding: "1.75rem 1.25rem" }}>
          <h1 className="neon-join-title">
            Join <span>Quiz</span>
          </h1>
          <p className="neon-join-subtitle">
            Enter the code and your name to join this challenge
          </p>

          {/* Selected Quiz Preview Box */}
          <div className="neon-selected-quiz-preview">
            <div className="neon-quiz-item-icon-box" style={{ width: "38px", height: "38px" }}>
              <TrophyIcon size={20} color="#c084fc" />
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#ffffff" }}>
                {selectedQuiz.title}
              </div>
              <div style={{ fontSize: "0.78rem", color: "#a1a1aa", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                {selectedQuiz.description || "AWS Knowledge Quiz"}
              </div>
            </div>
          </div>

          <form onSubmit={handleJoinSubmit}>
            {/* Field 1: Quiz Code */}
            <div className="neon-form-group">
              <label className="neon-form-label">Quiz Code</label>
              <div className="neon-input-wrapper">
                <span className="neon-input-icon">
                  <KeyIcon size={18} />
                </span>
                <input
                  type="text"
                  placeholder="E.g. R19UNG"
                  value={code}
                  maxLength={6}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="neon-input"
                  disabled={isVerifying}
                  style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}
                />
              </div>
            </div>

            {/* Field 2: Your Name */}
            <div className="neon-form-group">
              <label className="neon-form-label">Your Name</label>
              <div className="neon-input-wrapper">
                <span className="neon-input-icon">
                  <UserIcon size={18} />
                </span>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={name}
                  maxLength={30}
                  onChange={(e) => setName(e.target.value)}
                  className="neon-input"
                  disabled={isVerifying}
                />
              </div>
            </div>

            <div style={{ marginTop: "1.5rem" }}>
              <button
                type="submit"
                className="neon-btn-primary"
                disabled={isVerifying}
              >
                {isVerifying ? "Verifying Code..." : "Join Quiz →"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <Toast message={message} />
    </div>
  );
}
