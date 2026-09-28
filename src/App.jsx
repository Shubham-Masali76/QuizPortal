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
} from "firebase/firestore";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";



import { db, auth } from "./services/firebase";

import "./App.css";
import DashboardLayout from "./components/DashboardLayout";
import Toast from "./components/Toast";
import RoleSelection from "./pages/RoleSelection";

import AuthPage from "./pages/AuthPage";
import ParticipantLiveQuizzes from "./pages/ParticipantLiveQuizzes";
import HostWaitingRoom from "./pages/HostWaitingRoom";
import HostLiveQuiz from "./pages/HostLiveQuiz";
import HostAnalytics from "./pages/HostAnalytics";
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
  const [authLoading, setAuthLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState(null);
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);

      if (!currentUser) {
        setAuthPage("login");
      } else {
        setSelectedRole("host");
        setPage("dashboard");
      }
    });

    return () => unsubscribe();
  }, []);

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

      setSelectedRole("host");
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

      setSelectedRole(null);
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
      setQuizId(docRef.id);
      setQuizCode("");
      setQuizStatus("draft");
      setPage("editor");
      // alert("Quiz created successfully!");

      // setTitle("");
      // setDescription("");
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

        if (typeof correct === "string") {
          correct = correct.trim().toLowerCase();
          if (correct === "a" || correct === String(opt1).trim().toLowerCase()) correct = "1";
          else if (correct === "b" || correct === String(opt2).trim().toLowerCase()) correct = "2";
          else if (correct === "c" || correct === String(opt3).trim().toLowerCase()) correct = "3";
          else if (correct === "d" || correct === String(opt4).trim().toLowerCase()) correct = "4";
        }

        if (questionText && opt1 && opt2 && opt3 && opt4 && correct) {
          const questionData = {
            question: String(questionText),
            options: [String(opt1), String(opt2), String(opt3), String(opt4)],
            correctAnswer: Number(correct),
          };
          await addDoc(collection(db, "quizzes", quizId, "questions"), questionData);
          addedCount++;
        }
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
          questionData,
        );

        setMessage("Question updated successfully!");

        setTimeout(() => {
          setMessage("");
        }, 3000);

        setEditingQuestion(null);
      } else {
        // Add new question
        await addDoc(collection(db, "quizzes", quizId, "questions"), {
          ...questionData,
          createdAt: new Date(),
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
      const querySnapshot = await getDocs(
        collection(db, "quizzes", id, "questions"),
      );

      const questionList = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setQuestions(questionList);
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

  if (authLoading) {
    return (
      <div className="auth-loading">
        <h2>Loading QuizPortal...</h2>
      </div>
    );
  }

  if (!selectedRole) {
    return <RoleSelection onSelectRole={setSelectedRole} />;
  }

  if (selectedRole === "participant") {
    return <ParticipantLiveQuizzes onBack={() => setSelectedRole(null)} />;
  }

  if (!user) {
    return (
      <AuthPage
        authPage={authPage}
        setAuthPage={setAuthPage}
        handleLogin={handleLogin}
        handleSignup={handleSignup}
        onBack={() => setSelectedRole(null)}
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
      >
        <div className="page-header">
          <div>
            <h1>Dashboard</h1>
            <p>Manage your quizzes and create new challenges.</p>
          </div>

          <button className="primary-btn" onClick={() => setPage("create")}>
            + Create Quiz
          </button>
        </div>

        <div className="dashboard-actions">
          <div className="dashboard-action-card" onClick={handleMyQuizzes}>
            <h3>My Quizzes</h3>
            <p>View and continue editing your existing quizzes.</p>
            <span>View quizzes →</span>
          </div>

          <div
            className="dashboard-action-card"
            onClick={() => setPage("create")}
          >
            <h3>Create a Quiz</h3>
            <p>Start creating a brand-new quiz for your friends.</p>
            <span>Create quiz →</span>
          </div>
        </div>
        <Toast message={message} />
      </DashboardLayout>
    );
  }

  if (page === "create") {
    return (
      <div className="app">
        <DashboardLayout
          page={page}
          setPage={setPage}
          handleMyQuizzes={handleMyQuizzes}
          handleLogout={handleLogout}
        >
          <main className="create-page">
            <div className="create-card">
              <h2>Create Your Quiz</h2>
              <p>Start building a quiz and challenge your friends!</p>

              <input
                type="text"
                placeholder="Enter quiz title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />

              <textarea
                placeholder="Enter a short description"
                rows="4"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              ></textarea>

              <button className="primary-btn" onClick={handleCreateQuiz}>
                Create Quiz
              </button>
            </div>
          </main>
          <Toast message={message} />
        </DashboardLayout>
      </div>
    );
  }

  if (page === "editor") {
    return (
      <div className="app">
        <DashboardLayout
          page={page}
          setPage={setPage}
          handleMyQuizzes={handleMyQuizzes}
          handleLogout={handleLogout}
        >
          <main className="editor-page">
            <div className="editor-card">
              <h2>Quiz Editor</h2>

              <p>Add questions to your quiz.</p>

              <div className="quiz-info">
                <h3>{title}</h3>
                <p>{description}</p>
                {quizCode && (
                  <p className="quiz-code-info">
                    Quiz Code: <strong>{quizCode}</strong>
                  </p>
                )}
              </div>

              <div className="editor-actions">
                <button
                  className="secondary-btn manage-questions-btn"
                  onClick={() => {
                    fetchQuestions(quizId);
                    setPage("questions");
                  }}
                >
                  Manage Questions ({questions.length})
                </button>

                {quizStatus === "waiting" && (
                  <button
                    className="primary-btn waiting-room-direct-btn"
                    onClick={() => setPage("host-waiting-room")}
                  >
                    Enter Waiting Room →
                  </button>
                )}

                <button className="primary-btn host-quiz-btn" onClick={handleHostQuiz}>
                  Host Quiz
                </button>
              </div>

              <div className="question-form-section">
                <h3>{editingQuestion ? "Edit Question" : "Add New Question"}</h3>
                <div className="input-group">
                  <input
                    type="text"
                    placeholder="Enter your question"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                  />
                </div>
                <div className="options-grid">
                  <input
                    type="text"
                    placeholder="Option 1"
                    value={option1}
                    onChange={(e) => setOption1(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Option 2"
                    value={option2}
                    onChange={(e) => setOption2(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Option 3"
                    value={option3}
                    onChange={(e) => setOption3(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Option 4"
                    value={option4}
                    onChange={(e) => setOption4(e.target.value)}
                  />
                </div>

                <select
                  value={correctAnswer}
                  onChange={(e) => setCorrectAnswer(e.target.value)}
                  className="correct-answer-select"
                >
                  <option value="">Select the correct answer</option>
                  <option value="1">Option 1</option>
                  <option value="2">Option 2</option>
                  <option value="3">Option 3</option>
                  <option value="4">Option 4</option>
                </select>

                <div className="button-group">
                  <button className="primary-btn add-question-btn" onClick={handleAddQuestion} disabled={isUploading}>
                    {editingQuestion ? "Save Changes" : "+ Add Question"}
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
                        className="secondary-btn bulk-import-btn"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        {isUploading ? "Uploading..." : "Bulk Import"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </main>
          <Toast message={message} />
        </DashboardLayout>
      </div>
    );
  }

  if (page === "host-waiting-room") {
    return (
      <div className="app">
        <DashboardLayout
          page={page}
          setPage={setPage}
          handleMyQuizzes={handleMyQuizzes}
          handleLogout={handleLogout}
        >
          <HostWaitingRoom
            quizId={quizId}
            initialTitle={title}
            initialDescription={description}
            initialCode={quizCode}
            setPage={setPage}
            setQuizStatus={setQuizStatus}
          />
          <Toast message={message} />
        </DashboardLayout>
      </div>
    );
  }

  if (page === "host-live") {
    return (
      <div className="app">
        <DashboardLayout
          page={page}
          setPage={setPage}
          handleMyQuizzes={handleMyQuizzes}
          handleLogout={handleLogout}
        >
          <HostLiveQuiz quizId={quizId} setPage={setPage} />
          <Toast message={message} />
        </DashboardLayout>
      </div>
    );
  }

  if (page === "quizzes") {
    return (
      <div className="app">
        <DashboardLayout
          page={page}
          setPage={setPage}
          handleMyQuizzes={handleMyQuizzes}
          handleLogout={handleLogout}
        >
          <main className="quizzes-page">
            <div className="quizzes-card">
              <h2>My Quizzes</h2>
              <p>Select a quiz to continue editing.</p>

              {quizzes.length === 0 ? (
                <p>No quizzes found. Create your first quiz!</p>
              ) : (
                <div className="quiz-list">
                  {quizzes.map((quiz) => (
                    <div
                      className="quiz-item"
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
                      <h3>{quiz.title}</h3>
                      <p>{quiz.description}</p>

                      <div className="quiz-item-footer" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <span className="edit-text">Click to edit →</span>
                        { (quiz.status === "completed" || quiz.status === "finished") && (
                           <button 
                             className="secondary-btn" 
                             style={{ padding: '0.2rem 0.8rem', fontSize: '0.9rem' }}
                             onClick={(e) => {
                               e.stopPropagation();
                               setQuizId(quiz.id);
                               setPage("analytics");
                             }}
                           >
                             Analytics
                           </button>
                        )}
                        <span
                          className={`quiz-status ${quiz.status || "draft"}`}
                        >
                          {quiz.status === "waiting"
                            ? "Waiting"
                            : quiz.status === "live"
                              ? "Live"
                              : quiz.status === "finished"
                                ? "Finished"
                                : "Draft"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </main>
          <Toast message={message} />
        </DashboardLayout>
      </div>
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
      >
        <div className="questions-page">
          <div className="page-header">
            <div>
              <h1>Manage Questions</h1>
              <p>
                {title} • {questions.length}{" "}
                {questions.length === 1 ? "Question" : "Questions"}
              </p>
            </div>

            <button className="secondary-btn" onClick={() => setPage("editor")}>
              ← Back to Quiz Editor
            </button>
          </div>

          <div className="question-search">
            <span className="search-icon">🔍</span>

            <input
              type="text"
              placeholder="Search questions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            {searchTerm && (
              <button
                className="clear-search"
                onClick={() => setSearchTerm("")}
              >
                ✕
              </button>
            )}
          </div>

          {searchTerm && (
            <p className="search-results">
              {filteredQuestions.length}{" "}
              {filteredQuestions.length === 1 ? "question" : "questions"} found
            </p>
          )}

          {questions.length === 0 ? (
            <div className="empty-questions">
              <h3>No questions yet</h3>
              <p>Add your first question from the Quiz Editor.</p>

              <button className="primary-btn" onClick={() => setPage("editor")}>
                + Add Question
              </button>
            </div>
          ) : filteredQuestions.length === 0 ? (
            <div className="no-search-results">
              <h3>No questions found</h3>
              <p>Try searching with a different word.</p>
            </div>
          ) : (
            <div className="questions-grid">
              {filteredQuestions.map((question, index) => (
                <div className="question-card" key={question.id}>
                  <div className="question-card-header">
                    <span className="question-number">
                      Question {index + 1}
                    </span>
                  </div>

                  <h3>{question.question}</h3>

                  <div className="question-options">
                    {question.options.map((option, optionIndex) => (
                      <div
                        key={optionIndex}
                        className={`question-option ${
                          optionIndex + 1 === question.correctAnswer
                            ? "correct-option"
                            : ""
                        }`}
                      >
                        <span>{optionIndex + 1}.</span>
                        {option}

                        {optionIndex + 1 === question.correctAnswer && (
                          <span className="correct-label">✓ Correct</span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="question-actions">
                    <button
                      className="edit-question-btn"
                      onClick={() => handleEditQuestion(question)}
                    >
                      Edit
                    </button>

                    <button
                      className="delete-question-btn"
                      onClick={() => handleDeleteQuestion(question)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {showDeleteDialog && (
          <div className="dialog-overlay">
            <div className="dialog-box">
              <h2>Delete Question?</h2>

              <p>
                Are you sure you want to delete this question? This action
                cannot be undone.
              </p>

              <div className="dialog-actions">
                <button
                  className="dialog-cancel-btn"
                  onClick={() => {
                    setShowDeleteDialog(false);
                    setQuestionToDelete(null);
                  }}
                >
                  Cancel
                </button>

                <button
                  className="dialog-delete-btn"
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
}

export default App;
