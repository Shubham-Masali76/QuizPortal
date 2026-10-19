import { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";

import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";



import { db, auth } from "./services/firebase";
import { sortQuestions } from "./utils/helpers";

import "./App.css";
import DashboardLayout from "./components/DashboardLayout";
import Toast from "./components/Toast";
import RoleSelection from "./pages/RoleSelection";

import AuthPage from "./pages/AuthPage";
import ParticipantLiveQuizzes from "./pages/ParticipantLiveQuizzes";
import HostWaitingRoom from "./pages/HostWaitingRoom";
import HostLiveQuiz from "./pages/HostLiveQuiz";
import HostAnalytics from "./pages/HostAnalytics";
import NeonLoadingScreen from "./components/NeonLoadingScreen";
const generateQuizCode = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    code += characters[randomIndex];
  }
  return code;
};

const generateUniqueQuizCode = async () => {
  let isUnique = false;
  let code = "";

  while (!isUnique) {
    code = generateQuizCode();

    const codeQuery = query(
      collection(db, "quizzes"),
      where("quizCode", "==", code),
    );

    const querySnapshot = await getDocs(codeQuery);

    if (querySnapshot.empty) {
      isUnique = true;
    }
  }

  return code;
};

// Generate organic position strictly from participantId as the primary stable seed


function App() {
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [user, setUser] = useState(null);
  const [showLoadingPortal, setShowLoadingPortal] = useState(true);
  const [isLoaderExiting, setIsLoaderExiting] = useState(false);
  const [selectedRole, setSelectedRole] = useState(() => {
    try {
      return localStorage.getItem("quizmeter_role") || null;
    } catch {
      return null;
    }
  });

  const handleSelectRole = (role) => {
    setSelectedRole(role);
    try {
      if (role) {
        localStorage.setItem("quizmeter_role", role);
      } else {
        localStorage.removeItem("quizmeter_role");
        localStorage.removeItem("quizmeter_participant_session");
      }
    } catch (err) {
      console.warn("Could not sync role to localStorage:", err);
    }
  };
  const [authPage, setAuthPage] = useState("login");
  const [page, setPage] = useState("dashboard");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [quizId, setQuizId] = useState("");
  const [quizCode, setQuizCode] = useState("");
  const [quizStatus, setQuizStatus] = useState("draft");
  const [question, setQuestion] = useState("");
  const [option1, setOption1] = useState("");
  const [option2, setOption2] = useState("");
  const [option3, setOption3] = useState("");
  const [option4, setOption4] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [quizzes, setQuizzes] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [message, setMessage] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [questionToDelete, setQuestionToDelete] = useState(null);
  const [showDeleteQuizDialog, setShowDeleteQuizDialog] = useState(false);
  const [quizToDelete, setQuizToDelete] = useState(null);

  useEffect(() => {
    const startTime = Date.now();
    const MIN_LOADING_TIME = 2000; // smooth minimum window so the cyber loader displays nicely

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      if (!currentUser) {
        setAuthPage("login");
      } else {
        handleSelectRole("host");
        setPage("dashboard");
      }

      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, MIN_LOADING_TIME - elapsed);
      setTimeout(() => {
        setIsLoaderExiting(true);
        setTimeout(() => {
          setShowLoadingPortal(false);
        }, 650);
      }, remaining);
    });

    return () => unsubscribe();
  }, []);

  // Real-time synchronization of host's quizzes list
  useEffect(() => {
    if (!user?.uid) return;

    const quizzesQuery = query(
      collection(db, "quizzes"),
      where("userId", "==", user.uid),
    );

    const unsub = onSnapshot(
      quizzesQuery,
      (snapshot) => {
        const quizList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setQuizzes(quizList);
      },
      (error) => {
        console.error("Error listening to user quizzes:", error);
      }
    );

    return () => {
      unsub();
      setQuizzes([]);
    };
  }, [user?.uid]);

  // Real-time questions and questionOrder synchronization for active quiz
  useEffect(() => {
    if (!quizId) return;

    let isMounted = true;
    let cachedQuestionOrder = null;
    let currentQuestionsRaw = [];

    const applySortingAndSet = () => {
      if (!isMounted) return;
      const sorted = sortQuestions(currentQuestionsRaw, cachedQuestionOrder);
      setQuestions(sorted);
    };

    // 1. Listen to active quiz document for questionOrder updates
    const unsubQuizDoc = onSnapshot(
      doc(db, "quizzes", quizId),
      (docSnap) => {
        if (!isMounted) return;
        if (docSnap.exists()) {
          const data = docSnap.data();
          cachedQuestionOrder = Array.isArray(data.questionOrder) ? data.questionOrder : null;
          applySortingAndSet();
        }
      },
      (error) => {
        console.error("Error listening to quiz doc:", error);
      }
    );

    // 2. Listen to questions subcollection for live count and data changes
    const questionsColRef = collection(db, "quizzes", quizId, "questions");
    const unsubQuestions = onSnapshot(
      questionsColRef,
      (snapshot) => {
        if (!isMounted) return;
        currentQuestionsRaw = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        applySortingAndSet();
      },
      (error) => {
        console.error("Error listening to quiz questions:", error);
      }
    );

    return () => {
      isMounted = false;
      unsubQuizDoc();
      unsubQuestions();
      setQuestions([]);
    };
  }, [quizId]);

  const handleSignup = async (email, password) => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);

      setMessage("Account created successfully!");

      setTimeout(() => {
        setMessage("");
      }, 3000);
    } catch (error) {
      console.error("Signup error:", error);

      throw error;
    }
  };

  const handleLogin = async (email, password) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);

      handleSelectRole("host");
      setPage("dashboard");

      setMessage("Logged in successfully!");

      setTimeout(() => {
        setMessage("");
      }, 3000);
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);

      handleSelectRole(null);
      setPage("login");
      setMessage("Logged out successfully!");

      setTimeout(() => {
        setMessage("");
      }, 3000);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const filteredQuestions = questions.filter((question) =>
    question.question.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleOpenCreateQuiz = () => {
    setQuizId("");
    setTitle("");
    setDescription("");
    setQuizCode("");
    setQuizStatus("draft");
    setQuestions([]);
    setEditingQuestion(null);
    setQuestion("");
    setOption1("");
    setOption2("");
    setOption3("");
    setOption4("");
    setCorrectAnswer("");
    setPage("create");
  };

  const handleCreateQuiz = async () => {
    if (!title.trim()) {
      setMessage("Please enter a quiz title!");

      setTimeout(() => {
        setMessage("");
      }, 3000);
      return;
    }

    try {
      const docRef = await addDoc(collection(db, "quizzes"), {
        title,
        description,
        userId: user.uid,
        createdAt: new Date(),
        status: "draft",
      });

      console.log("Quiz created with ID:", docRef.id);
      setQuestions([]);
      setQuizId(docRef.id);
      setQuizCode("");
      setQuizStatus("draft");
      setPage("editor");
    } catch (error) {
      console.error("Error creating quiz:", error);
      setMessage("Something went wrong while creating the quiz!");

      setTimeout(() => {
        setMessage("");
      }, 3000);
    }
  };

  const handleHostQuiz = async () => {
    if (questions.length === 0) {
      setMessage("Please add at least one question before hosting the quiz!");

      setTimeout(() => {
        setMessage("");
      }, 3000);

      return;
    }

    try {
      let codeToUse = quizCode;
      if (!codeToUse) {
        const quizDocSnap = await getDoc(doc(db, "quizzes", quizId));
        if (quizDocSnap.exists() && quizDocSnap.data().quizCode) {
          codeToUse = quizDocSnap.data().quizCode;
        } else {
          codeToUse = await generateUniqueQuizCode();
        }
      }

      await updateDoc(doc(db, "quizzes", quizId), {
        quizCode: codeToUse,
        status: "waiting",
        currentQuestionIndex: 0,
        questionStatus: "answering",
      });

      setQuizCode(codeToUse);
      setQuizStatus("waiting");
      setPage("host-waiting-room");
      setMessage(`Quiz is now waiting for participants! Code: ${codeToUse}`);

      setTimeout(() => {
        setMessage("");
      }, 3000);
    } catch (error) {
      console.error("Error hosting quiz:", error);

      setMessage("Something went wrong while hosting the quiz!");

      setTimeout(() => {
        setMessage("");
      }, 3000);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsUploading(true);
    const fileExtension = file.name.split('.').pop().toLowerCase();

    try {
      let rawQuestions = [];
      if (fileExtension === "json") {
        const text = await file.text();
        rawQuestions = JSON.parse(text);
      } else if (fileExtension === "csv") {
        const text = await file.text();
        const result = Papa.parse(text, { header: true, skipEmptyLines: true });
        rawQuestions = result.data;
      } else if (fileExtension === "xlsx" || fileExtension === "xls") {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        rawQuestions = XLSX.utils.sheet_to_json(worksheet);
      } else {
        setMessage("Unsupported file format. Please upload CSV, JSON, or Excel.");
        setIsUploading(false);
        return;
      }

      let addedCount = 0;
      const baseOrder = questions.length;
      const addedIds = [];
      for (const q of rawQuestions) {
        const getVal = (keys) => {
          for (const k of Object.keys(q)) {
            if (keys.includes(k.toLowerCase().replace(/ /g, ''))) return q[k];
          }
          return "";
        };

        const questionText = getVal(["question", "q", "title"]);
        const opt1 = getVal(["option1", "opt1", "a", "1"]);
        const opt2 = getVal(["option2", "opt2", "b", "2"]);
        const opt3 = getVal(["option3", "opt3", "c", "3"]);
        const opt4 = getVal(["option4", "opt4", "d", "4"]);
        let correct = getVal(["correctanswer", "correct", "answer", "ans"]);

        if (correct !== undefined && correct !== null && correct !== "") {
          const cStr = String(correct).trim().toLowerCase();
          const cleanStr = cStr.replace(/^(option|opt)\s*/, "").replace(/[.)\]]/g, "").trim();

          if (cleanStr === "1" || cleanStr === "a" || cStr === String(opt1).trim().toLowerCase()) {
            correct = 1;
          } else if (cleanStr === "2" || cleanStr === "b" || cStr === String(opt2).trim().toLowerCase()) {
            correct = 2;
          } else if (cleanStr === "3" || cleanStr === "c" || cStr === String(opt3).trim().toLowerCase()) {
            correct = 3;
          } else if (cleanStr === "4" || cleanStr === "d" || cStr === String(opt4).trim().toLowerCase()) {
            correct = 4;
          } else {
            correct = Number(correct);
          }
        }

        if (questionText && opt1 && opt2 && opt3 && opt4 && correct && !isNaN(correct)) {
          const questionData = {
            question: String(questionText),
            options: [String(opt1), String(opt2), String(opt3), String(opt4)],
            correctAnswer: Number(correct),
            order: baseOrder + addedCount,
            createdAt: new Date(),
          };
          const docRef = await addDoc(collection(db, "quizzes", quizId, "questions"), questionData);
          addedIds.push(docRef.id);
          addedCount++;
        }
      }

      if (addedIds.length > 0) {
        const qzSnap = await getDoc(doc(db, "quizzes", quizId));
        const currentOrder = (qzSnap.exists() && Array.isArray(qzSnap.data().questionOrder))
          ? qzSnap.data().questionOrder
          : questions.map(q => q.id);
        await updateDoc(doc(db, "quizzes", quizId), {
          questionOrder: [...currentOrder, ...addedIds],
        });
      }

      await fetchQuestions(quizId);
      setMessage(`Successfully imported ${addedCount} questions!`);
    } catch (error) {
      console.error("Bulk upload error:", error);
      setMessage("Failed to parse file. Please check the format.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAddQuestion = async () => {
    if (
      !question.trim() ||
      !option1.trim() ||
      !option2.trim() ||
      !option3.trim() ||
      !option4.trim() ||
      !correctAnswer
    ) {
      setMessage("Please fill in all the question details!");
      setTimeout(() => {
        setMessage("");
      }, 3000);
      return;
    }

    try {
      const questionData = {
        question,
        options: [option1, option2, option3, option4],
        correctAnswer: Number(correctAnswer),
      };

      if (editingQuestion) {
        // Update existing question
        await updateDoc(
          doc(db, "quizzes", quizId, "questions", editingQuestion.id),
          {
            ...questionData,
            order: editingQuestion.order !== undefined ? editingQuestion.order : questions.length,
          },
        );

        setMessage("Question updated successfully!");

        setTimeout(() => {
          setMessage("");
        }, 3000);

        setEditingQuestion(null);
      } else {
        // Add new question
        const newDocRef = await addDoc(collection(db, "quizzes", quizId, "questions"), {
          ...questionData,
          order: questions.length,
          createdAt: new Date(),
        });

        // Immediately update and lock questionOrder on quiz document
        const qzSnap = await getDoc(doc(db, "quizzes", quizId));
        const currentOrder = (qzSnap.exists() && Array.isArray(qzSnap.data().questionOrder))
          ? qzSnap.data().questionOrder
          : questions.map(q => q.id);
        await updateDoc(doc(db, "quizzes", quizId), {
          questionOrder: [...currentOrder, newDocRef.id],
        });

        setMessage("Question added successfully!");

        setTimeout(() => {
          setMessage("");
        }, 3000);
      }

      await fetchQuestions(quizId);

      // Clear form
      setQuestion("");
      setOption1("");
      setOption2("");
      setOption3("");
      setOption4("");
      setCorrectAnswer("");
    } catch (error) {
      console.error("Error saving question:", error);
      setMessage("Something went wrong while saving the question!");

      setTimeout(() => {
        setMessage("");
      }, 3000);
    }
  };

  const fetchQuestions = async (id) => {
    try {
      const [qzSnap, querySnapshot] = await Promise.all([
        getDoc(doc(db, "quizzes", id)),
        getDocs(collection(db, "quizzes", id, "questions")),
      ]);

      const qOrder = qzSnap.exists() ? qzSnap.data().questionOrder : null;
      const questionList = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      const sorted = sortQuestions(questionList, qOrder);

      // If quiz document didn't have questionOrder yet, lock this order to Firestore
      if (qzSnap.exists() && (!Array.isArray(qOrder) || qOrder.length === 0) && sorted.length > 0) {
        updateDoc(doc(db, "quizzes", id), {
          questionOrder: sorted.map(q => q.id),
        }).catch(err => console.error("Error auto-saving questionOrder:", err));
      }

      setQuestions(sorted);
    } catch (error) {
      console.error("Error fetching questions:", error);
      setMessage("Something went wrong while fetching the questions!");

      setTimeout(() => {
        setMessage("");
      }, 3000);
    }
  };

  const handleEditQuestion = (question) => {
    setQuestion(question.question);
    setOption1(question.options[0]);
    setOption2(question.options[1]);
    setOption3(question.options[2]);
    setOption4(question.options[3]);
    setCorrectAnswer(String(question.correctAnswer));

    setEditingQuestion(question);
    setPage("editor");
  };

  const handleDeleteQuestion = (question) => {
    setQuestionToDelete(question);
    setShowDeleteDialog(true);
  };

  const confirmDeleteQuestion = async () => {
    try {
      await deleteDoc(
        doc(db, "quizzes", quizId, "questions", questionToDelete.id),
      );

      // Remove from questionOrder on quiz document
      const qzSnap = await getDoc(doc(db, "quizzes", quizId));
      if (qzSnap.exists() && Array.isArray(qzSnap.data().questionOrder)) {
        const filteredOrder = qzSnap.data().questionOrder.filter(id => id !== questionToDelete.id);
        await updateDoc(doc(db, "quizzes", quizId), {
          questionOrder: filteredOrder,
        });
      }

      setShowDeleteDialog(false);
      setQuestionToDelete(null);

      await fetchQuestions(quizId);

      setMessage("Question deleted successfully!");

      setTimeout(() => {
        setMessage("");
      }, 3000);
    } catch (error) {
      console.error("Error deleting question:", error);

      setShowDeleteDialog(false);
      setMessage("Something went wrong while deleting the question.");

      setTimeout(() => {
        setMessage("");
      }, 3000);
    }
  };

  const handleDeleteQuiz = (e, quiz) => {
    e.stopPropagation();
    setQuizToDelete(quiz);
    setShowDeleteQuizDialog(true);
  };

  const confirmDeleteQuiz = async () => {
    try {
      const deletedId = quizToDelete?.id;
      await deleteDoc(doc(db, "quizzes", deletedId));
      setShowDeleteQuizDialog(false);
      setQuizToDelete(null);

      // If the currently active quiz was deleted, clear it out
      if (quizId === deletedId) {
        setQuizId("");
        setTitle("");
        setDescription("");
        setQuizCode("");
        setQuizStatus("draft");
        setQuestions([]);
        setEditingQuestion(null);
      }

      await handleMyQuizzes();
      setMessage("Quiz deleted successfully!");
      setTimeout(() => {
        setMessage("");
      }, 3000);
    } catch (error) {
      console.error("Error deleting quiz:", error);
      setShowDeleteQuizDialog(false);
      setMessage("Something went wrong while deleting the quiz.");
      setTimeout(() => {
        setMessage("");
      }, 3000);
    }
  };

  const handleMyQuizzes = async () => {
    try {
      const quizzesQuery = query(
        collection(db, "quizzes"),
        where("userId", "==", user.uid),
      );

      const querySnapshot = await getDocs(quizzesQuery);

      const quizList = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setQuizzes(quizList);
      setPage("quizzes");
    } catch (error) {
      console.error("Error fetching quizzes:", error);

      setMessage("Something went wrong while loading your quizzes.");

      setTimeout(() => {
        setMessage("");
      }, 3000);
    }
  };

  const renderAppContent = () => {

  if (!selectedRole) {
    return <RoleSelection onSelectRole={handleSelectRole} />;
  }

  if (selectedRole === "participant") {
    return <ParticipantLiveQuizzes onBack={() => handleSelectRole(null)} />;
  }

  if (!user) {
    return (
      <AuthPage
        authPage={authPage}
        setAuthPage={setAuthPage}
        handleLogin={handleLogin}
        handleSignup={handleSignup}
        onBack={() => handleSelectRole(null)}
      />
    );
  }

  if (page === "dashboard") {
    return (
      <DashboardLayout
        page={page}
        setPage={setPage}
        handleMyQuizzes={handleMyQuizzes}
        handleLogout={handleLogout}
        handleOpenCreateQuiz={handleOpenCreateQuiz}
      >
        <div className="neon-dash-header">
          <div className="neon-dash-titles">
            <span className="neon-badge-pulse">● HOST OPERATING SYSTEM</span>
            <h1 className="neon-dash-title">Command Dashboard</h1>
            <p className="neon-dash-sub">Manage your active quizzes and launch new live challenges.</p>
          </div>

          <button type="button" className="neon-btn-primary neon-dash-create-btn" onClick={handleOpenCreateQuiz}>
            <span className="neon-btn-icon">+</span>
            <span>Create Quiz</span>
          </button>
        </div>

        <div className="neon-dash-actions">
          <div className="neon-card neon-dash-action-card" onClick={handleMyQuizzes}>
            <div className="neon-dash-action-icon">📁</div>
            <div className="neon-dash-action-content">
              <h3>My Quizzes</h3>
              <p>View, manage, edit, and launch your existing quizzes and inspect analytics.</p>
            </div>
            <span className="neon-dash-action-link">View quizzes →</span>
          </div>

          <div
            className="neon-card neon-dash-action-card"
            onClick={handleOpenCreateQuiz}
          >
            <div className="neon-dash-action-icon">✨</div>
            <div className="neon-dash-action-content">
              <h3>Create a Quiz</h3>
              <p>Start creating a brand-new live quiz with timed multiplayer questions.</p>
            </div>
            <span className="neon-dash-action-link">Create quiz →</span>
          </div>
        </div>
        <Toast message={message} />
      </DashboardLayout>
    );
  }

  if (page === "create") {
    return (
      <DashboardLayout
        page={page}
        setPage={setPage}
        handleMyQuizzes={handleMyQuizzes}
        handleLogout={handleLogout}
        handleOpenCreateQuiz={handleOpenCreateQuiz}
      >
        <div className="neon-create-container">
          <div className="neon-dash-header">
            <div className="neon-dash-titles">
              <button type="button" className="neon-dash-back-btn" onClick={() => setPage("dashboard")}>
                ← Back to Dashboard
              </button>
              <h1 className="neon-dash-title">Create Your Quiz</h1>
              <p className="neon-dash-sub">Build a quiz challenge for your participants with live scoring.</p>
            </div>
          </div>

          <div className="neon-card neon-form-card">
            <div className="neon-input-group">
              <label className="neon-label">Quiz Title</label>
              <input
                type="text"
                className="neon-input"
                placeholder="e.g., AWS Cloud Practitioner Masterclass"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="neon-input-group">
              <label className="neon-label">Quiz Description</label>
              <textarea
                className="neon-input neon-textarea"
                placeholder="Enter a brief overview of what this quiz covers..."
                rows="4"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              ></textarea>
            </div>

            <div className="neon-form-actions">
              <button type="button" className="neon-btn-primary neon-form-submit-btn" onClick={handleCreateQuiz}>
                <span>Create Quiz & Build Questions →</span>
              </button>
            </div>
          </div>
        </div>
        <Toast message={message} />
      </DashboardLayout>
    );
  }

  if (page === "editor") {
    return (
      <DashboardLayout
        page={page}
        setPage={setPage}
        handleMyQuizzes={handleMyQuizzes}
        handleLogout={handleLogout}
        handleOpenCreateQuiz={handleOpenCreateQuiz}
      >
        <div className="neon-editor-container">
          <div className="neon-card neon-editor-header-card">
            <div className="neon-editor-meta-top">
              <span className="neon-badge-pulse">● QUIZ CONFIGURATION</span>
              {quizCode && (
                <div className="neon-editor-code-badge">
                  <span className="neon-code-label">QUIZ CODE:</span>
                  <span className="neon-code-str">{quizCode}</span>
                </div>
              )}
            </div>

            <h1 className="neon-editor-title">{title || "Untitled Quiz"}</h1>
            <p className="neon-editor-desc">{description || "No description provided."}</p>

            <div className="neon-editor-actions-row">
              <button
                type="button"
                className="neon-btn-ghost neon-manage-questions-btn"
                onClick={() => {
                  fetchQuestions(quizId);
                  setPage("questions");
                }}
              >
                <span>Manage Questions</span>
                <span className="neon-pill-count">{questions.length}</span>
              </button>

              {quizStatus === "waiting" && (
                <button
                  type="button"
                  className="neon-btn-ghost neon-waiting-room-btn"
                  onClick={() => setPage("host-waiting-room")}
                >
                  Enter Waiting Room →
                </button>
              )}

              <button
                type="button"
                className="neon-btn-primary neon-host-launch-btn"
                onClick={handleHostQuiz}
              >
                <span>🚀 Host Quiz</span>
              </button>
            </div>
          </div>

          <div className="neon-card neon-question-form-card">
            <div className="neon-form-header">
              <h2 className="neon-form-title">
                {editingQuestion ? "Edit Question" : "Add New Question"}
              </h2>
              <p className="neon-form-sub">
                {editingQuestion
                  ? "Update the question, options, and designated correct answer."
                  : "Build multiple-choice questions or import questions in bulk."}
              </p>
            </div>

            <div className="neon-input-group">
              <label className="neon-label">Question Text</label>
              <input
                type="text"
                className="neon-input neon-question-text-input"
                placeholder="Type your question here..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>

            <div className="neon-options-editor-grid">
              <div className="neon-option-input-wrapper opt-a">
                <span className="neon-opt-tag tag-a">▲ A</span>
                <input
                  type="text"
                  className="neon-input"
                  placeholder="Option 1"
                  value={option1}
                  onChange={(e) => setOption1(e.target.value)}
                />
              </div>

              <div className="neon-option-input-wrapper opt-b">
                <span className="neon-opt-tag tag-b">◆ B</span>
                <input
                  type="text"
                  className="neon-input"
                  placeholder="Option 2"
                  value={option2}
                  onChange={(e) => setOption2(e.target.value)}
                />
              </div>

              <div className="neon-option-input-wrapper opt-c">
                <span className="neon-opt-tag tag-c">● C</span>
                <input
                  type="text"
                  className="neon-input"
                  placeholder="Option 3"
                  value={option3}
                  onChange={(e) => setOption3(e.target.value)}
                />
              </div>

              <div className="neon-option-input-wrapper opt-d">
                <span className="neon-opt-tag tag-d">■ D</span>
                <input
                  type="text"
                  className="neon-input"
                  placeholder="Option 4"
                  value={option4}
                  onChange={(e) => setOption4(e.target.value)}
                />
              </div>
            </div>

            <div className="neon-input-group">
              <label className="neon-label">Select Correct Answer</label>
              <select
                value={correctAnswer}
                onChange={(e) => setCorrectAnswer(e.target.value)}
                className="neon-input neon-select"
              >
                <option value="">-- Choose Correct Option --</option>
                <option value="1">Option 1 (▲ A)</option>
                <option value="2">Option 2 (◆ B)</option>
                <option value="3">Option 3 (● C)</option>
                <option value="4">Option 4 (■ D)</option>
              </select>
            </div>

            <div className="neon-form-buttons-row">
              <button
                type="button"
                className="neon-btn-primary"
                onClick={handleAddQuestion}
                disabled={isUploading}
              >
                {editingQuestion ? "Save Question Changes" : "+ Add Question to Quiz"}
              </button>

              {!editingQuestion && (
                <>
                  <input
                    type="file"
                    accept=".csv, .json, .xlsx, .xls"
                    ref={fileInputRef}
                    style={{ display: "none" }}
                    onChange={handleFileUpload}
                  />
                  <button
                    type="button"
                    className="neon-btn-ghost neon-bulk-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    <span>📁</span>
                    <span>{isUploading ? "Uploading Data..." : "Bulk Import (.csv/.json/.xlsx)"}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        <Toast message={message} />
      </DashboardLayout>
    );
  }

  if (page === "host-waiting-room") {
    return (
      <div className="app">
        <HostWaitingRoom
          quizId={quizId}
          initialTitle={title}
          initialDescription={description}
          initialCode={quizCode}
          setPage={setPage}
          setQuizStatus={setQuizStatus}
        />
        <Toast message={message} />
      </div>
    );
  }

  if (page === "host-live") {
    return (
      <div className="app">
        <HostLiveQuiz quizId={quizId} setPage={setPage} />
        <Toast message={message} />
      </div>
    );
  }


  if (page === "quizzes") {
    return (
      <DashboardLayout
        page={page}
        setPage={setPage}
        handleMyQuizzes={handleMyQuizzes}
        handleLogout={handleLogout}
        handleOpenCreateQuiz={handleOpenCreateQuiz}
      >
        <div className="neon-quizzes-container">
          <div className="neon-dash-header">
            <div className="neon-dash-titles">
              <span className="neon-badge-pulse">● HOST REPOSITORY</span>
              <h1 className="neon-dash-title">My Quizzes</h1>
              <p className="neon-dash-sub">Select a quiz to continue editing, view analytics, or launch.</p>
            </div>
            <button type="button" className="neon-btn-primary" onClick={handleOpenCreateQuiz}>
              <span>+ Create Quiz</span>
            </button>
          </div>

          {quizzes.length === 0 ? (
            <div className="neon-card neon-empty-card">
              <div className="neon-empty-icon">📁</div>
              <h3>No Quizzes Found</h3>
              <p>You haven't created any quizzes yet. Build your first challenge now!</p>
              <button type="button" className="neon-btn-primary" onClick={handleOpenCreateQuiz}>
                + Create Your First Quiz
              </button>
            </div>
          ) : (
            <div className="neon-quizzes-grid">
              {quizzes.map((quiz) => (
                <div
                  className="neon-card neon-quiz-card"
                  key={quiz.id}
                  onClick={() => {
                    setQuizId(quiz.id);
                    setTitle(quiz.title);
                    setDescription(quiz.description);
                    setQuizCode(quiz.quizCode || "");
                    setQuizStatus(quiz.status || "draft");
                    fetchQuestions(quiz.id);
                    setPage("editor");
                  }}
                >
                  <div className="neon-quiz-card-head">
                    <h3 className="neon-quiz-card-title">{quiz.title}</h3>
                    <span className={`neon-quiz-status-badge status-${quiz.status || "draft"}`}>
                      {quiz.status === "waiting"
                        ? "Waiting"
                        : quiz.status === "live"
                          ? "Live"
                          : quiz.status === "finished" || quiz.status === "completed"
                            ? "Completed"
                            : "Draft"}
                    </span>
                  </div>

                  <p className="neon-quiz-card-desc">{quiz.description || "No description provided."}</p>

                  <div className="neon-quiz-card-footer">
                    <span className="neon-edit-action-link">Click to edit →</span>

                    <div className="neon-quiz-card-actions" onClick={(e) => e.stopPropagation()}>
                      {(quiz.status === "completed" || quiz.status === "finished") && (
                        <button
                          type="button"
                          className="neon-btn-ghost neon-analytics-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setQuizId(quiz.id);
                            setPage("analytics");
                          }}
                        >
                          Analytics
                        </button>
                      )}
                      <button
                        type="button"
                        className="neon-btn-danger neon-delete-btn"
                        onClick={(e) => handleDeleteQuiz(e, quiz)}
                        aria-label="Delete Quiz"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <Toast message={message} />
        {showDeleteQuizDialog && (
          <div className="neon-dialog-overlay">
            <div className="neon-dialog-box">
              <h2 className="neon-dialog-title">Delete Quiz?</h2>
              <p className="neon-dialog-desc">Are you sure you want to delete this quiz? All associated questions will be removed. This action cannot be undone.</p>
              <div className="neon-dialog-actions">
                <button
                  type="button"
                  className="neon-btn-ghost"
                  onClick={() => {
                    setShowDeleteQuizDialog(false);
                    setQuizToDelete(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="neon-btn-danger"
                  onClick={confirmDeleteQuiz}
                >
                  Delete Quiz
                </button>
              </div>
            </div>
          </div>
        )}
      </DashboardLayout>
    );
  }

  if (page === "analytics") {
    return (
      <div className="app">
        <DashboardLayout
          page={page}
          setPage={setPage}
          handleMyQuizzes={handleMyQuizzes}
          handleLogout={handleLogout}
          handleOpenCreateQuiz={handleOpenCreateQuiz}
        >
          <HostAnalytics quizId={quizId} setPage={setPage} />
          <Toast message={message} />
        </DashboardLayout>
      </div>
    );
  }

  if (page === "questions") {
    return (
      <DashboardLayout
        page={page}
        setPage={setPage}
        handleMyQuizzes={handleMyQuizzes}
        handleLogout={handleLogout}
        handleOpenCreateQuiz={handleOpenCreateQuiz}
      >
        <div className="neon-questions-container">
          <div className="neon-dash-header">
            <div className="neon-dash-titles">
              <button type="button" className="neon-dash-back-btn" onClick={() => setPage("editor")}>
                ← Back to Quiz Editor
              </button>
              <h1 className="neon-dash-title">Manage Questions</h1>
              <p className="neon-dash-sub">
                {title} • {questions.length}{" "}
                {questions.length === 1 ? "Question" : "Questions"}
              </p>
            </div>
          </div>

          <div className="neon-search-bar-wrap">
            <span className="neon-search-icon">🔍</span>
            <input
              type="text"
              className="neon-input neon-search-input"
              placeholder="Search questions by keyword..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                className="neon-search-clear-btn"
                onClick={() => setSearchTerm("")}
              >
                ✕
              </button>
            )}
          </div>

          {searchTerm && (
            <p className="neon-search-result-count">
              {filteredQuestions.length}{" "}
              {filteredQuestions.length === 1 ? "question" : "questions"} found
            </p>
          )}

          {questions.length === 0 ? (
            <div className="neon-card neon-empty-card">
              <div className="neon-empty-icon">❓</div>
              <h3>No Questions Yet</h3>
              <p>Add your first question from the Quiz Editor to populate your quiz.</p>
              <button type="button" className="neon-btn-primary" onClick={() => setPage("editor")}>
                + Add Question
              </button>
            </div>
          ) : filteredQuestions.length === 0 ? (
            <div className="neon-card neon-empty-card">
              <h3>No Questions Found</h3>
              <p>No questions matched your search query. Try another keyword.</p>
            </div>
          ) : (
            <div className="neon-questions-grid">
              {filteredQuestions.map((question, index) => (
                <div className="neon-card neon-question-item-card" key={question.id}>
                  <div className="neon-question-card-header">
                    <span className="neon-q-num-badge">Question {index + 1}</span>
                    <div className="neon-q-actions">
                      <button
                        type="button"
                        className="neon-btn-ghost neon-btn-sm"
                        onClick={() => handleEditQuestion(question)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="neon-btn-danger neon-btn-sm"
                        onClick={() => handleDeleteQuestion(question)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <h3 className="neon-question-item-title">{question.question}</h3>

                  <div className="neon-question-options-list">
                    {question.options.map((option, optionIndex) => {
                      const isCorrect = optionIndex + 1 === question.correctAnswer;
                      const tags = ["▲ A", "◆ B", "● C", "■ D"];
                      return (
                        <div
                          key={optionIndex}
                          className={`neon-question-option-item ${isCorrect ? "correct-answer" : ""}`}
                        >
                          <span className="neon-option-idx-tag">{tags[optionIndex] || `${optionIndex + 1}.`}</span>
                          <span className="neon-option-item-text">{option}</span>
                          {isCorrect && (
                            <span className="neon-correct-tag">✓ Correct Answer</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showDeleteDialog && (
          <div className="neon-dialog-overlay">
            <div className="neon-dialog-box">
              <h2 className="neon-dialog-title">Delete Question?</h2>
              <p className="neon-dialog-desc">
                Are you sure you want to delete this question? This action cannot be undone.
              </p>
              <div className="neon-dialog-actions">
                <button
                  type="button"
                  className="neon-btn-ghost"
                  onClick={() => {
                    setShowDeleteDialog(false);
                    setQuestionToDelete(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="neon-btn-danger"
                  onClick={confirmDeleteQuestion}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
        <Toast message={message} />
      </DashboardLayout>
    );
  }

    return null;
  };

  return (
    <>
      <div className={`app-content-transition ${isLoaderExiting ? "app-content-revealed" : "app-content-hidden"}`}>
        {renderAppContent()}
      </div>
      {showLoadingPortal && (
        <NeonLoadingScreen isExiting={isLoaderExiting} />
      )}
    </>
  );
}

export default App;
