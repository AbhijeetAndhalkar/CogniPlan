# 🏗️ FlowBoard – Architecture & Code Breakdown

This document explains how FlowBoard works under the hood — how the pieces connect, what each file does, and how data flows through the system.

---

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                      BROWSER                             │
│                                                          │
│   index.html  ──►  app.js  ──►  style.css               │
│       │               │                                  │
│       │         fetch() API calls                        │
└───────┼───────────────┼──────────────────────────────────┘
        │               │
        ▼               ▼
┌─────────────────────────────────────────────────────────┐
│              FASTAPI SERVER (uvicorn)                    │
│                                                          │
│   main.py   ──►  schemas.py  (validates request/resp)   │
│      │                                                   │
│      ├──► models.py  (ORM table classes)                 │
│      │        │                                          │
│      │        ▼                                          │
│      │   database.py  ──►  productivity.db (SQLite)      │
│      │                                                   │
│      └──► agent.py  ──►  Groq API (LLaMA 3.3 70B)       │
│                    └──►  Pinecone (vector memory)        │
└─────────────────────────────────────────────────────────┘
        │
        ▼
   .env  (secret keys — never committed to git)
```

---

## How the Pieces Connect

### 1. Browser ↔ FastAPI (HTTP)

The frontend (`app.js`) communicates with the backend exclusively through **REST API calls** using the browser's built-in `fetch()`. There is no separate frontend build step — FastAPI serves the HTML/CSS/JS files directly as static files.

- `GET /` → Returns `frontend/index.html`
- `/static/app.js`, `/static/style.css` → Served from the `frontend/` folder
- All data endpoints (todos, habits, analytics) are JSON APIs

### 2. FastAPI ↔ SQLite (SQLAlchemy ORM)

FastAPI routes never write raw SQL. Instead they use **SQLAlchemy sessions** (provided by `database.py`) to query `models.py` ORM classes which map directly to SQLite tables.

### 3. FastAPI ↔ Groq AI (HTTP)

When the `/api/chat` endpoint is hit, `main.py` calls `agent.run_dispatcher()`. This sends the user's message to the **Groq API** (cloud LLM). The LLM decides whether to use a tool (create a todo, mark a habit done) or just chat. The result comes back and is returned to the frontend.

### 4. Agent ↔ Pinecone (Vector Memory)

Each chat message is stored as a vector in **Pinecone** so the AI can theoretically recall past context. Currently uses a placeholder zero-vector (production would use a real embedding model).

---

## File-by-File Breakdown

### 📁 `backend/`

#### `main.py` — The App Entry Point & Router
**Role:** The heart of the backend. Defines all API endpoints and wires everything together.

| Endpoint | Method | What it does |
|---|---|---|
| `/` | GET | Serves `frontend/index.html` |
| `/static/*` | GET | Serves CSS, JS files |
| `/todos/` | GET, POST | List all todos / Create a new todo |
| `/todos/{id}/toggle` | PUT | Mark a todo complete/incomplete |
| `/todos/{id}` | DELETE | Delete a todo |
| `/habits/` | GET, POST | List habits / Create a habit |
| `/track/` | POST | Toggle a habit done/not-done for a date |
| `/analytics/matrix` | GET | Full month grid of habit checkboxes + streaks |
| `/api/chat` | POST | Send a message to the AI assistant |

Also configures:
- **CORS** (allows any origin for local dev)
- **Static file serving** from `../frontend/`
- **Database table auto-creation** on startup

---

#### `database.py` — Database Connection
**Role:** Creates the SQLite database engine and session factory. Provides `get_db()` — a FastAPI dependency that automatically opens and closes a DB session per request.

```
SQLite file: backend/productivity.db  (auto-created on first run)
```

---

#### `models.py` — Database Tables (ORM)
**Role:** Defines the shape of the database using Python classes.

| Class | Table | Columns |
|---|---|---|
| `Todo` | `todos` | id, title, is_completed, created_at |
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

1. **Stores the message** in Pinecone (vector memory for future recall)
2. **Calls Groq API** with the user message and a set of available tools:
   - `create_agent_todo(title)` → Creates a new Todo in the DB
   - `mark_habit_done(habit_title, log_date)` → Marks a habit complete for a date
3. **Executes whichever tool** the LLM chose to call
4. **Returns a plain-English summary** back to the frontend

Model used: `llama-3.3-70b-versatile` via Groq

---

#### `seed.py` — Sample Data Script
**Role:** One-time script to populate the database with sample habits and todos for testing. Run it once manually, it is not called automatically.

---

#### `requirements.txt` — Python Dependencies
**Role:** Lists all packages needed. Run `pip install -r requirements.txt` to install everything.

Key packages:
- `fastapi` — Web framework
- `uvicorn[standard]` — ASGI server (runs FastAPI)
- `sqlalchemy` — ORM for SQLite
- `pydantic` — Data validation
- `python-dotenv` — Loads `.env` secret keys
- `groq` — Groq LLM client
- `pinecone` — Vector DB client

---

#### `.env` — Secret Keys *(not in git)*
**Role:** Stores sensitive credentials loaded at runtime via `python-dotenv`.

```
GROQ_API_KEY        → Authenticates calls to Groq AI
PINECONE_API_KEY    → Authenticates calls to Pinecone vector DB
SUPABASE_JWT_SECRET → Used to verify user login tokens
```

---

### 📁 `frontend/`

#### `index.html` — Page Shell
**Role:** The single HTML file for the entire app. Contains:
- The **auth overlay** (login/signup card) shown on top until the user logs in
- The **dashboard layout** behind the overlay: habit matrix, todo list, AI chat panel, analytics rings
- Links to `style.css` and `app.js`

No framework, no build step — plain HTML.

---

#### `app.js` — All Frontend Logic
**Role:** The entire client-side brain (~700+ lines). Responsible for:

- **Auth flow** — Calls Supabase to sign in / sign up. Hides the login overlay on success.
- **Todos** — Fetches todos from `/todos/`, renders the list, handles add/toggle/delete.
- **Habits** — Fetches habits from `/habits/`, allows creating new ones.
- **Habit Matrix** — Calls `/analytics/matrix` to get the full month grid and renders it as a checkbox table with colored streaks.
- **AI Chat** — Sends user messages to `/api/chat` and displays the AI's reply in the chat panel.
- **Analytics Rings** — Calculates and renders circular SVG progress rings per habit.

All API calls target `http://127.0.0.1:8000` (the local FastAPI server).

---

#### `style.css` — Premium Dark UI
**Role:** All visual styling. Key design elements:
- **Dark glassmorphism** — semi-transparent blurred panels over a deep navy background
- **Custom color themes** per habit (set in `habits.color_theme`)
- **Smooth transitions** and hover effects
- **Responsive grid layout** for the dashboard panels

---

### 📁 `docs/`

| File | Purpose |
|---|---|
| `SETUP.md` | Step-by-step guide to run the project from scratch |
| `ARCHITECTURE.md` | This file — explains how the system works |

---

## Data Flow: Creating a Todo via AI Chat

```
User types: "Add a task to review my notes"
         │
         ▼
app.js → POST /api/chat { message: "Add a task to review my notes" }
         │
         ▼
main.py → agent.run_dispatcher(message, db)
         │
         ├─► Pinecone: store message vector
         │
         ├─► Groq API: "Given tools available, what should I do?"
         │       └─► LLM responds: call create_agent_todo("review my notes")
         │
         ├─► agent.create_agent_todo(db, "review my notes")
         │       └─► models.Todo inserted into productivity.db
         │
         └─► Returns: "Created Todo: review my notes"
         │
         ▼
app.js receives reply → displays in chat panel
         │
         ▼
app.js refreshes todo list → GET /todos/ → new todo appears in UI
```

---

## Data Flow: Checking the Habit Matrix

```
User opens the dashboard (or navigates to the habit section)
         │
         ▼
app.js → GET /analytics/matrix?year=2026&month=3
         │
         ▼
main.py queries:
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
app.js renders a table: one row per habit, one column per day
Completed days → colored checkbox ✅
Incomplete days → empty checkbox ☐
```
