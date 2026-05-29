# 🏗️ FlowBoard / CogniPlan – Architecture & Workflow

This document explains the technical architecture, data flow, and development lifecycle for the FlowBoard (CogniPlan) project. It serves as a comprehensive guide to understanding how the system is built and how to work with it effectively.

## 1. System Architecture

The application follows a client-server architecture with a clear separation between the React frontend UI and the Python-based backend API. It also integrates an LLM (Groq) for AI capabilities.

```mermaid
flowchart TD
    subgraph Frontend [Client Browser]
        HTML[index-react.html] --> React[CogniPlan.jsx]
        HTML --> CSS[style.css]
    end

    subgraph Backend [FastAPI Server]
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

### Key Components

1. **Frontend (React/HTML/CSS):** Served dynamically by FastAPI or GitHub Pages. Uses React (via Babel standalone) combined with a responsive, glassmorphism-themed dark UI.
2. **FastAPI Server:** Provides REST API endpoints for todos, habits, state storage, and analytics. Interacts with the frontend using JSON over HTTP.
3. **Database (Supabase PostgreSQL):** Accessed through SQLAlchemy ORM, ensuring robust and schema-validated database migrations and queries. Also handles user authentication.
4. **AI Intelligence Engine:** Driven by the Groq API utilizing `llama-3.3-70b-versatile`. Agent functionality is housed in `agent.py`, which supports specific tool calls to interact directly with the user's tracker (like adding a todo or habit list), leveraging local `SentenceTransformers` for semantic search.

---

## 2. File & Directory Breakdown

* **`backend/`**
  * `main.py`: Entry point for the FastAPI server, defines all endpoints (GET/POST for todos, habits, etc.), and sets up CORS and static routes.
  * `database.py`: Establishes the SQLAlchemy engine and dependency injection (`get_db`) for FastAPI endpoint sessions, linking to Supabase.
  * `models.py`: Database schema definitions via ORM classes (e.g., `Todo`, `Habit`, `HabitLog`).
  * `schemas.py`: Pydantic models for strict API request validation and response shaping.
  * `agent.py`: Houses the logic for communicating with Groq and embedding text with SentenceTransformers. Converts user natural language into actionable tool calls.
* **`docs/`**
  * `index-react.html`: The core page structure, handling Babel/React loading and fallback error UI.
  * `CogniPlan.jsx`: Central React component handling fetch requests, API authentication wrapping, state management, and DOM rendering.
  * `style.css`: All styling variables and design logic matching the premium aesthetic.

---

## 3. Data Flow Example: Adding a Todo via AI

1. User sends a message via the frontend chat interface in React: *"Remind me to read 10 pages today."*
2. `CogniPlan.jsx` runs a `POST /api/chat` request to the backend.
3. `main.py` forwards the message to `agent.run_agent()`.
4. The AI receives the message context, determines the proper intent, and calls the `add_todo` tool.
5. In `agent.py`, a local SentenceTransformer model creates a semantic vector embedding of the task.
6. In `models.py`, a new `Todo` entity (with the embedding) is created and securely saved to the Supabase database.
7. The frontend receives the 'refresh_todos' action signal and fetches the updated todos list automatically, and the UI immediately displays the newly created Todo item.

---

## 4. Development & Deployment Workflow

The development environment is decoupled from deployment complexities, allowing seamless switching between local testing and production builds.

### 4.1 Local Development (The "Code-Save-Test" Loop)
1. Ensure the Python virtual environment (`.venv`) is activated.
2. Move into the `backend/` directory and execute the server run command:
   ```bash
   uvicorn main:app --reload --host 127.0.0.1 --port 8000
   ```
3. Local UI automatically connects via `http://127.0.0.1:8000`. Check endpoints by reading CLI output errors.

### 4.2 Shared Hosted Data
Whether deploying via local terminal or via the production cloud target, data resides dynamically on the identical **Supabase Postgres Database**. Environmental configuration files (`.env`) point towards your cloud environment so development seamlessly matches what is shown in production without localized test-database discrepancy issues.

### 4.3 Deployment to Production (Render)
When local features are perfected and tested:
1. Open `docs/CogniPlan.jsx`.
2. Disable the localhost endpoints by commenting them out, and uncomment the Render deployment URLs.
3. Check code into Git and Push:
   ```bash
   git add .
   git commit -m "chore: enable production endpoints for release"
   git push origin main
   ```
4. Render's CI/CD pipeline correctly ingests the changes, building the backend API logic and re-wiring the DNS points toward the active build instance automatically.
