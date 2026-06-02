# 🏗️ FlowBoard / CogniPlan – System Architecture

This document explains the technical architecture for the FlowBoard (CogniPlan) project. It serves as a comprehensive guide to understanding how the system is built, what technologies are used, and how the codebase is structured.

## 1. System Overview

The application follows a client-server architecture with a clear separation between the React frontend UI and the Python-based backend API. It integrates an LLM (Groq) for AI capabilities and Supabase for database and authentication.

```mermaid
flowchart TD
    subgraph Frontend [Client Browser]
        HTML[index-react.html] --> React[CogniPlan.jsx]
        HTML --> CSS[style.css]
    end

    subgraph Backend [FastAPI Server (uvicorn)]
        API[main.py: App & Routes] --> Val[schemas.py: Pydantic]
        API --> ORM[models.py: SQLAlchemy]
        ORM --> DB_Connection[database.py]
        API --> Agent[agent.py: AI Dispatcher]
        Agent --> Embed[SentenceTransformers: all-mpnet-base-v2]
    end

    subgraph External [Cloud Services]
        Groq[Groq API: LLaMA 3.3]
        Supabase[(Supabase: PostgreSQL & Auth)]
    end

    React -- "REST API (fetch HTTP)" --> API
    DB_Connection -- "Reads / Writes" --> Supabase
    Agent -- "Prompts / Tool Calls" --> Groq
```

## 2. Tech Stack

1. **Frontend:** Served dynamically by FastAPI. Uses **React** (via Babel standalone) combined with a responsive, glassmorphism-themed dark UI.
2. **Backend:** Python with **FastAPI**. It handles the logic and REST API endpoints (todos, habits, state storage, analytics).
3. **Database & Auth:** **Supabase (PostgreSQL)**. Accessed through **SQLAlchemy** ORM, ensuring robust and schema-validated database interactions. Manages user authentication.
4. **AI Framework:** **LangGraph** & **LangChain**. These create a ReAct agent loop for the AI to decide which tools to use.
5. **LLM:** **LLaMA 3.3 70B** via the **Groq API**. Serves as the brain to understand user requests.
6. **Embedding Model:** **`all-mpnet-base-v2`** via **SentenceTransformers**. Converts text into vectors for semantic search functionality over tasks.

## 3. How the Pieces Connect

### 3.1 Browser ↔ FastAPI (HTTP)
The frontend (`CogniPlan.jsx`) communicates with the backend exclusively through **REST API calls** using the browser's built-in `fetch()`. It runs React 18 loaded directly in the browser. FastAPI serves the HTML/CSS/JS files as static files.
- `GET /` → Returns `docs/index-react.html`
- `/static/*` → Serves files from the `docs/` folder

### 3.2 FastAPI ↔ Supabase (SQLAlchemy ORM)
FastAPI routes do not write raw SQL. Instead, they use **SQLAlchemy sessions** (provided by `database.py`) to query `models.py` ORM classes, mapping directly to PostgreSQL tables in Supabase. Supabase handles JWT user authentication.

### 3.3 FastAPI ↔ Groq AI (HTTP)
When the `/api/chat` endpoint is hit, `main.py` calls `agent.run_agent()`. This sends the user's message to the **Groq API**. The LLM decides whether to use a tool (create a todo, mark a habit done) or just chat. The result is returned to the frontend.

### 3.4 Agent ↔ SentenceTransformers (Vector Embeddings)
When tasks are created, a local `SentenceTransformer` model calculates a vector embedding. This is saved directly into the database row alongside the task, allowing the AI to search past tasks by meaning instead of needing an external vector database.

## 4. File-by-File Breakdown

### 📁 `backend/`

* **`main.py` (App Entry Point & Router):** Defines all API endpoints (`/todos/`, `/habits/`, `/api/chat`, etc.) and wires everything together. Sets up CORS and static routes.
* **`database.py` (DB Connection):** Creates the SQLAlchemy engine and provides `get_db()` dependency injection for FastAPI endpoint sessions, linking to Supabase.
* **`models.py` (Database Tables):** Database schema definitions via ORM classes (`Todo`, `Habit`, `HabitLog`).
* **`schemas.py` (Pydantic Models):** Validates all incoming API requests and outgoing responses. Acts as a strict contract between the frontend and backend.
* **`agent.py` (AI Intelligence Engine):** Calculates semantic embeddings using SentenceTransformers. Calls Groq API with user messages and available tools (e.g., `add_todo`, `mark_habit_done`). Executes tool logic via LangGraph.
* **`seed.py`:** Sample data script to populate the database for testing.
* **`requirements.txt`:** Lists all Python packages needed (fastapi, uvicorn, sqlalchemy, pydantic, groq, sentence-transformers, langgraph, etc.).
* **`.env`:** Stores sensitive credentials (GROQ_API_KEY, DATABASE_URL, SUPABASE_JWT_SECRET) loaded at runtime. Never committed to git.

### 📁 `docs/`

* **`index-react.html`:** The core page structure, handling Babel/React loading and fallback error UI.
* **`CogniPlan.jsx`:** Central React component handling fetch requests, API authentication wrapping, state management (todos, habits, habit matrix), AI chat, and DOM rendering.
* **`style.css`:** All visual styling, including dark glassmorphism, color themes, smooth transitions, and grid layouts.

### 📁 `docsuments/`
* **`SETUP.md`:** Step-by-step guide to run the project from scratch.
* **`ARCHITECTURE.md`:** This file — explains system architecture and code structure.
* **`WORKFLOW.md`:** Explains data flows, request lifecycles, and deployment.
