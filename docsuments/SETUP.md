# 🚀 FlowBoard – Complete Setup & Startup Guide

This guide walks you through everything from a fresh clone to a fully running FlowBoard instance.

---

## Prerequisites

Make sure you have these installed before starting:

- **Python 3.10+** → [python.org/downloads](https://www.python.org/downloads/)
- **Git** → [git-scm.com](https://git-scm.com/)
- A terminal (PowerShell on Windows recommended)

---

## Step 1 — Clone the Repository

```powershell
git clone https://github.com/AbhijeetAndhalkar/CogniPlan.git
cd CogniPlan
```

---

## Step 2 — Create the Virtual Environment

A virtual environment keeps project dependencies isolated from your system Python.

```powershell
python -m venv .venv
```

This creates a `.venv/` folder in the project root.

---

## Step 3 — Activate the Virtual Environment

> [!IMPORTANT]
> You must activate the venv **every time** you open a new terminal session.

**Windows (PowerShell):**
```powershell
.venv\Scripts\Activate.ps1
```

**Windows (Command Prompt):**
```cmd
.venv\Scripts\activate.bat
```

✅ When activated, your terminal prompt will show `(.venv)` at the start.

---

## Step 4 — Install Dependencies

```powershell
pip install -r backend\requirements.txt
```

This installs: FastAPI, Uvicorn, SQLAlchemy, Pydantic, Groq, Pinecone, and all other required packages.

---

## Step 5 — Configure API Keys

Copy the example env file and fill in your real keys:

```powershell
copy backend\.env.example backend\.env
```

Then open `backend\.env` in a text editor and fill in:

```env
GROQ_API_KEY="your_groq_key_here"
PINECONE_API_KEY="your_pinecone_key_here"
SUPABASE_JWT_SECRET="your_supabase_jwt_secret_here"
```

| Key | Where to get it |
|---|---|
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) → API Keys |
| `PINECONE_API_KEY` | [app.pinecone.io](https://app.pinecone.io) → API Keys |
| `SUPABASE_JWT_SECRET` | Supabase Dashboard → Project Settings → API → JWT Secret |

> [!NOTE]
> The AI Chat and memory features require Groq and Pinecone keys. The rest of the app (Todos, Habits, Analytics) works without them.

---

## Step 6 — (Optional) Seed Sample Data

If you want to start with some pre-filled habits and todos:

```powershell
cd backend
python seed.py
cd ..
```

---

## Step 7 — Start the Server

> [!IMPORTANT]
> The server **must be started from inside the `backend/` folder** due to how Python resolves local imports.

```powershell
cd backend
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Application startup complete.
```

---

## Step 8 — Open in Browser

Navigate to:

```
http://127.0.0.1:8000
```

You'll see the **FlowBoard** login screen. Sign up or log in to access the dashboard.

---

## Stopping the Server

Press `CTRL + C` in the terminal where uvicorn is running.

---

## Restarting After a Break

Every time you come back to the project:

```powershell
# 1. Activate the venv (from project root)
.venv\Scripts\Activate.ps1

# 2. Start the server
cd backend
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `ModuleNotFoundError: No module named 'fastapi'` | Run `pip install -r backend\requirements.txt` |
| `ModuleNotFoundError: No module named 'database'` | Make sure you `cd backend` before running uvicorn |
| `Address already in use` on port 8000 | Change port: add `--port 8001` to the uvicorn command |
| AI Chat returns an error | Check that `GROQ_API_KEY` is set correctly in `backend\.env` |
| Page shows JSON instead of UI | Make sure you opened `http://127.0.0.1:8000` not a different route |
