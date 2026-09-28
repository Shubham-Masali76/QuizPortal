import { useState } from "react";
import { collection, query, where, getDocs, addDoc } from "firebase/firestore";
import { ref as rtdbRef, get as rtdbGet } from "firebase/database";
import { db, rtdb } from "../services/firebase";
import Toast from "../components/Toast";
import { generateDynamicAvatar } from "../utils/helpers";

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
    <div className="join-quiz-page">
      <div className="join-quiz-card">
        <div className="role-logo">QuizPortal</div>
        <h1>Join Quiz</h1>
        <p className="join-quiz-subtitle">
          Enter the code and your name to join this challenge
        </p>

        <div className="join-quiz-info-box">
          <h3>{selectedQuiz.title}</h3>
          {selectedQuiz.description && <p>{selectedQuiz.description}</p>}
        </div>

        <form onSubmit={handleJoinSubmit}>
          <div className="join-quiz-field">
            <label>Quiz Code</label>
            <input
              type="text"
              placeholder="e.g. R19UNG"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="quiz-code-input"
              disabled={isVerifying}
            />
          </div>

          <div className="join-quiz-field">
            <label>Your Name</label>
            <input
              type="text"
              placeholder="Enter your name"
              value={name}
              maxLength={30}
              onChange={(e) => setName(e.target.value)}
              disabled={isVerifying}
            />
          </div>

          <button
            type="submit"
            className="primary-btn join-quiz-submit-btn"
            disabled={isVerifying}
          >
            {isVerifying ? "Verifying..." : "Join Quiz →"}
          </button>

          <button
            type="button"
            className="join-quiz-back-btn"
            onClick={onBack}
            disabled={isVerifying}
          >
            ← Back to Live Quizzes
          </button>
        </form>
      </div>

      <Toast message={message} />
    </div>
  );
}
