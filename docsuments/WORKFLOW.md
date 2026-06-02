# 🧠 Tracker (FlowBoard / CogniPlan) Project Workflow

## 🌟 What is this project?
This project is an AI-powered Productivity Dashboard. It allows users to manage their daily habits and one-off tasks (to-dos) using a natural language chat interface. 

This document explains the data flow for user actions, how features like AI chat and analytics work, and the development/deployment lifecycle.

---

## 1. Development & Deployment Workflow

The development environment is decoupled from deployment complexities, allowing seamless switching between local testing and production builds.

### 1.1 Local Development (The "Code-Save-Test" Loop)
1. Ensure the Python virtual environment (`.venv`) is activated.
2. Move into the `backend/` directory and execute the server run command:
   ```bash
   uvicorn main:app --reload --host 127.0.0.1 --port 8000
   ```
3. Local UI automatically connects via `http://127.0.0.1:8000`. Check endpoints by reading CLI output errors.

### 1.2 Shared Hosted Data
Whether deploying locally or via the production cloud target, data resides dynamically on the identical **Supabase Postgres Database**. Environmental configuration files (`.env`) point towards your cloud environment so development seamlessly matches what is shown in production.

### 1.3 Deployment to Production (Render)
When local features are perfected and tested:
1. Open `docs/CogniPlan.jsx`.
2. Disable the localhost endpoints by commenting them out, and uncomment the Render deployment URLs.
3. Commit and push your code:
   ```bash
   git add .
   git commit -m "chore: enable production endpoints for release"
   git push origin main
   ```
4. Render's CI/CD pipeline correctly ingests the changes, building the backend API logic and re-wiring the DNS points toward the active build instance automatically.

---

## 2. Data Flow: Core Features

### 2.1 The Request Lifecycle: Adding a Todo via AI

**Step 1: The User Sends a Message (Frontend)**
- The user types: *"Remind me to prep for my interview tomorrow"*
- `CogniPlan.jsx` sends a `POST /api/chat` request to the FastAPI backend.

**Step 2: The AI Starts Thinking (LangGraph ReAct Agent)**
- `main.py` forwards the message to `agent.run_agent(message, db)`.
- The **LLaMA 3.3** model (via Groq) determines the user wants to add a task, and decides to use the `add_todo` tool.

**Step 3: Creating the Vector Embedding (AI Magic)**
- Before saving the task, `agent.py` uses the **SentenceTransformer** (`all-mpnet-base-v2` model) to turn the text into a mathematical vector.
- This "semantic embedding" allows the AI to find this task later even using related words (like *"practice questions"*).

**Step 4: Saving to Database (Supabase / PostgreSQL)**
- A new `models.Todo` entity (with text and vector) is created and securely saved to the **Supabase** database using SQLAlchemy.

**Step 5: The Agent Answers**
- LangGraph realizes the tool finished. The LLaMA model creates a text reply: *"I've added the interview prep to your to-do list!"*
- The backend returns this reply along with a hidden signal `action="refresh_todos"`.

**Step 6: The Screen Updates (Frontend)**
- The frontend shows the AI's reply in the chatbox.
- It receives the 'refresh_todos' signal, automatically runs `GET /todos/`, and the new task appears instantly on the dashboard.

### 2.2 Data Flow: Checking the Habit Matrix

**Step 1: Dashboard Load**
- User opens the dashboard (or navigates to the habit section).
- `CogniPlan.jsx` requests: `GET /analytics/matrix?year=2026&month=3`

**Step 2: Backend Aggregation**
- `main.py` queries Supabase for:
  - All active Habits.
  - All HabitLogs for the requested month.
- It gap-fills missing days as `False`.
- Computes streak (consecutive days done going back from today).
- Computes completion percentage (done days / days elapsed this month).

**Step 3: UI Rendering**
- Backend returns a JSON response with days, habit titles, boolean logs, streaks, and completion percentages.
- `CogniPlan.jsx` renders a table: one row per habit, one column per day.
- Completed days → colored checkbox ✅
- Incomplete days → empty checkbox ☐

---

## 3. Interview Insights 💡

**LangChain vs. LangGraph**
If an interviewer asks, *"Are you using only LangGraph or both, and can you remove LangChain?"*, you should explain that they are two halves of the same ecosystem and **must be used together**:
- **LangChain (The Engine):** Used to connect to the Groq API, format chat messages, and define custom Python tools (like `add_todo`). 
- **LangGraph (The Driver):** Used to build the "Reason + Act" loop. It controls the flow, tells the AI when to think, when to trigger a tool, and when to return the final answer.
- Because LangGraph relies on LangChain's building blocks, they work in tandem and one cannot simply replace the other for agentic workflows.
