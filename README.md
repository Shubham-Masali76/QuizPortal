# 🚀 QuizPortal

**QuizPortal** is a modern, real-time interactive quiz platform built with React, Vite, and Firebase. It allows hosts to create quizzes, bulk-import questions via CSV/Excel, and host them live for hundreds of participants with perfectly synchronized timers, live leaderboards, and instant analytics.

## ✨ Features

- **🎓 Host Dashboard:** Create, manage, and edit quizzes effortlessly.
- **📁 Bulk Import:** Import questions instantly using `.csv`, `.json`, or `.xlsx` files.
- **⚡ Real-time Synchronization:** Powered by Firebase Realtime Database and Firestore, ensuring zero-lag state synchronization even with 500+ concurrent students.
- **🏆 Live Leaderboards & Podium:** See the rankings update live as participants answer, ending with a beautiful top-3 podium celebration.
- **📊 Analytics & Export:** Dive deep into quiz metrics and export complete participant data with one click, before clearing the data to reuse the quiz.
- **⏱️ Fair Scoring:** Features a strictly clamped time-to-score calculation system that neutralizes client clock skew and rewards fast, accurate responses.

## 🛠️ Tech Stack

- **Frontend:** React, Vite, Recharts, PapaParse, SheetJS
- **Backend/Database:** Firebase Firestore (for persistent data), Firebase Realtime Database (for high-frequency live responses & presence)
- **Authentication:** Firebase Auth
- **Styling:** Custom CSS (Responsive & Animated)

## 🚀 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/QuizPortal.git
   cd QuizPortal
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Firebase Setup:**
   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com/).
   - Enable **Authentication** (Email/Password).
   - Enable **Firestore** and **Realtime Database**.
   - Copy your Firebase config and place it in `src/services/firebase.js`.

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Build for production:**
   ```bash
   npm run build
   ```

## 📈 Scalability Note

QuizPortal is explicitly architected to handle large classrooms (500+ participants). It utilizes chunked batch writes to bypass Firestore limits, prevents N² read explosions by delegating rank calculations to the host, and relies on RTDB for rapid heartbeat and presence tracking.

## 📄 License

This project is open-source and available under the MIT License.
