# 🏗️ FlowBoard – Architecture & Code Breakdown

This document explains how FlowBoard works under the hood — how the pieces connect, what each file does, and how data flows through the system.

---

## System Overview

```
┌─────────────────────────────────────────────────────────
│                      BROWSER                             │
│                                                          │
│index-react.html ──► CogniPlan.jsx ──►  style.css         │
│       │               │                                  │
│       │         fetch() API calls                        │
└───────┼───────────────┼──────────────────────────────────┘
        │               │
        ▼               ▼
┌─────────────────────────────────────────────────────────┐
│              FASTAPI SERVER (uvicorn)                    │
│                                                          │
│   main.py   ──►  schemas.py  (validates request/resp)    │
│      │                                                   │
│      ├──► models.py  (ORM table classes)                 │
│      │        │                                          │
│      │        ▼                                          │
│      │   database.py  ──►  Supabase (PostgreSQL)         │
│      │                                                   │
│      └──► agent.py  ──►  Groq API (LLaMA 3.3 70B)        │
│                    └──►  SentenceTransformers (embeds)   │
└─────────────────────────────────────────────────────────┘
        │
        ▼
   .env  (secret keys — never committed to git)
```

---

## How the Pieces Connect

### 1. Browser ↔ FastAPI (HTTP)

The frontend (`CogniPlan.jsx`) communicates with the backend exclusively through **REST API calls** using the browser's built-in `fetch()`. It runs React 18 loaded directly in the browser via Babel standalone. FastAPI serves the HTML/CSS/JS files directly as static files.

- `GET /` → Returns `docs/index-react.html`
- `/static/*` → Serves files from the `docs/` folder
- All data endpoints (todos, habits, analytics) are JSON APIs

### 2. FastAPI ↔ Supabase (SQLAlchemy ORM)

FastAPI routes never write raw SQL. Instead they use **SQLAlchemy sessions** (provided by `database.py`) to query `models.py` ORM classes which map directly to PostgreSQL tables in Supabase. Supabase also handles JWT user authentication.

### 3. FastAPI ↔ Groq AI (HTTP)

When the `/api/chat` endpoint is hit, `main.py` calls `agent.run_agent()`. This sends the user's message to the **Groq API** (cloud LLM). The LLM decides whether to use a tool (create a todo, mark a habit done) or just chat. The result comes back and is returned to the frontend.

### 4. Agent ↔ SentenceTransformers (Vector Embeddings)

When tasks are created, a local `SentenceTransformer` model (`all-mpnet-base-v2`) converts the text into a vector embedding. This is saved directly into the database row alongside the task text, allowing the AI to search past tasks by meaning instead of needing an external vector database like Pinecone.

---

## File-by-File Breakdown

### 📁 `backend/`

#### `main.py` — The App Entry Point & Router
**Role:** The heart of the backend. Defines all API endpoints and wires everything together.

| Endpoint | Method | What it does |
|---|---|---|
| `/` | GET | Serves `docs/index-react.html` |
| `/static/*` | GET | Serves CSS, JS, JSX files |
| `/todos/` | GET, POST | List all todos / Create a new todo |
| `/todos/{id}/toggle` | PUT | Mark a todo complete/incomplete |
| `/todos/{id}` | DELETE | Delete a todo |
| `/habits/` | GET, POST | List habits / Create a habit |
| `/track/` | POST | Toggle a habit done/not-done for a date |
| `/analytics/matrix` | GET | Full month grid of habit checkboxes + streaks |
| `/api/chat` | POST | Send a message to the AI assistant |

Also configures:
- **CORS** (allows any origin for local dev)
- **Static file serving** from `../docs/`

---

#### `database.py` — Database Connection
**Role:** Creates the Supabase PostgreSQL database engine and session factory. Provides `get_db()` — a FastAPI dependency that automatically opens and closes a DB session per request.

---

#### `models.py` — Database Tables (ORM)
**Role:** Defines the shape of the database using Python classes.

| Class | Table | Columns |
|---|---|---|
| `Todo` | `todos` | id, title, is_completed, created_at, embedding |
| `Habit` | `habits` | id, title, frequency, color_theme, is_active, created_at |
| `HabitLog` | `habit_logs` | id, habit_id (FK), date, status |

`HabitLog` links to `Habit` via a **foreign key** relationship. Deleting a habit cascades and deletes all its logs.

---

#### `schemas.py` — Request & Response Shapes (Pydantic)
**Role:** Validates all incoming API requests and outgoing responses. Acts as a contract between the frontend and backend.

- `TodoCreate` → What the frontend sends when creating a todo
- `TodoResponse` → What the backend returns (includes `id`, `created_at`, etc.)
- `HabitCreate` / `HabitResponse` → Same pattern for habits
- `HabitMatrixRow` → A single row in the analytics grid (habit + all 31 day booleans + streak)
- `MatrixResponse` → The full month matrix returned by `/analytics/matrix`

---

#### `agent.py` — AI Intelligence Engine
**Role:** The AI brain. When the user sends a chat message, this file:

1. **Calculates semantic embeddings** using local `SentenceTransformers` when saving new tasks.
2. **Calls Groq API** with the user message and a set of available tools:
   - `add_todo(todo_text)` → Creates a new Todo in the DB with an embedding
   - `mark_habit_done(name, log_date)` → Marks a habit complete for a date
   - `search_past_tasks(query)` → Searches the database for similar vectors
3. **Executes whichever tool** the LLM chose to call via LangGraph.
4. **Returns a plain-English summary** and a frontend refresh signal back to `main.py`.

Model used: `llama-3.3-70b-versatile` via Groq

---

#### `seed.py` — Sample Data Script
**Role:** One-time script to populate the database with sample habits and todos for testing. Run it once manually, it is not called automatically.

---

#### `requirements.txt` — Python Dependencies
**Role:** Lists all packages needed. Run `pip install -r backend/requirements.txt` to install everything.

Key packages:
- `fastapi` — Web framework
- `uvicorn[standard]` — ASGI server (runs FastAPI)
- `sqlalchemy` — ORM for Database queries
- `pydantic` — Data validation
- `python-dotenv` — Loads `.env` secret keys
- `groq` — Groq LLM client
- `sentence-transformers` — Local vector embeddings
- `langgraph`, `langchain` — AI agent orchestration

---

#### `.env` — Secret Keys *(not in git)*
**Role:** Stores sensitive credentials loaded at runtime via `python-dotenv`.

```
GROQ_API_KEY        → Authenticates calls to Groq AI
DATABASE_URL        → Connects to the Supabase PostgreSQL database
SUPABASE_JWT_SECRET → Used to verify user login tokens
```

---

### 📁 `docs/`

#### `index-react.html` — Page Shell
**Role:** The single HTML file for the entire app. Contains:
- Error logging and Babel standalone loader configuration.
- The root DOM element for React to attach to.

---

#### `CogniPlan.jsx` — All Frontend Logic
**Role:** The entire client-side brain written in React. Responsible for:

- **Auth flow** — Calls Supabase to sign in / sign up. Hides the login overlay on success.
- **Todos** — Fetches todos from `/todos/`, renders the list, handles add/toggle/delete.
- **Habits** — Fetches habits from `/habits/`, allows creating new ones.
- **Habit Matrix** — Calls `/analytics/matrix` to get the full month grid and renders it as a checkbox table with colored streaks.
- **AI Chat** — Sends user messages to `/api/chat` and displays the AI's reply in the chat panel.
- **Analytics Rings** — Calculates and renders circular SVG progress rings per habit.

---

#### `style.css` — Premium Dark UI
**Role:** All visual styling. Key design elements:
- **Dark glassmorphism** — semi-transparent blurred panels over a deep navy background
- **Custom color themes** per habit (set in `habits.color_theme`)
- **Smooth transitions** and hover effects
- **Responsive grid layout** for the dashboard panels

---

### 📁 `docsuments/`

| File | Purpose |
|---|---|
| `SETUP.md` | Step-by-step guide to run the project from scratch |
| `ARCHITECTURE.md` | This file — explains how the system works |
| `ARCHITECTURE_WORKFLOW.md` | Explains data flow and deployment loop |

---

## Data Flow: Creating a Todo via AI Chat

```
User types: "Add a task to review my notes"
         │
         ▼
CogniPlan.jsx → POST /api/chat { message: "Add a task to review my notes" }
         │
         ▼
main.py → agent.run_agent(message, db)
         │
         ├─► Groq API: "Given tools available, what should I do?"
         │       └─► LLM responds: call add_todo("review my notes")
         │
         ├─► agent.add_todo(db, "review my notes")
         │       ├─► SentenceTransformer: generate embedding vector
         │       └─► models.Todo inserted into Supabase DB
         │
         └─► Returns: "Created Todo: review my notes", action="refresh_todos"
         │
         ▼
CogniPlan.jsx receives reply → displays in chat panel
         │
         ▼
CogniPlan.jsx refreshes todo list → GET /todos/ → new todo appears in UI
```

---

## Data Flow: Checking the Habit Matrix

```
User opens the dashboard (or navigates to the habit section)
         │
         ▼
CogniPlan.jsx → GET /analytics/matrix?year=2026&month=3
         │
         ▼
main.py queries Supabase:
  - All active Habits from habits table
  - All HabitLogs for March 2026 from habit_logs table
  - Gap-fills missing days as False
  - Computes streak (consecutive days done going back from today)
  - Computes completion % (done days / days elapsed this month)
         │
         ▼
Returns JSON: { year, month, days: [1..31], habits: [ {title, logs: {"1": true, "2": false, ...}, streak, completion_pct} ] }
         │
         ▼
CogniPlan.jsx renders a table: one row per habit, one column per day
Completed days → colored checkbox ✅
Incomplete days → empty checkbox ☐
```
