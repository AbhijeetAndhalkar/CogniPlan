# ⚡ FlowBoard (CogniPlan) – AI-Powered Productivity Dashboard

FlowBoard (CogniPlan) is a full-stack productivity app that combines **habit tracking**, **todo management**, and an **AI chat assistant** into a single premium dark-themed dashboard. The backend and UI run locally, while user authentication and data are securely synced to the cloud via Supabase (PostgreSQL).

---

## ✨ Features

| Feature | Description |
|---|---|
| ✅ **Todo Manager** | Add, complete, and delete one-off tasks |
| 🔄 **Habit Tracker** | Track recurring daily habits across a full month grid |
| 📊 **Analytics Matrix** | Visual month-view grid with streaks and completion percentages |
| 🤖 **AI Chat Agent** | Natural language assistant powered by Groq (LLaMA 3.3 70B) that creates todos or marks habits done |
| 🔒 **Authentication** | Supabase JWT-based login/signup screen |
| 💾 **Database** | Supabase PostgreSQL cloud database (with local SQLite fallback) |

---

## 🗂️ Project Structure

```
FlowBoard/
├── backend/                  # FastAPI Python backend
│   ├── main.py               # App entry point, all API route definitions
│   ├── agent.py              # AI dispatcher (Groq LLM + SentenceTransformers)
│   ├── models.py             # SQLAlchemy ORM table definitions
│   ├── schemas.py            # Pydantic request/response schemas
│   ├── database.py           # Supabase PostgreSQL engine and session setup
│   ├── seed.py               # Script to pre-populate sample data
│   ├── requirements.txt      # Python dependencies
│   └── .env                  # 🔒 Secret API keys & Database URL (NOT committed to git)
│
├── docs/                     # React Frontend (served via GitHub Pages or FastAPI)
│   ├── index-react.html      # Single-page app shell + auth overlay
│   ├── CogniPlan.jsx         # React UI components and logic (Babel standalone)
│   ├── style.css             # Premium dark glassmorphic UI styles
│   └── icons/                # SVG/Image assets
│
├── supabase_setup.sql        # Supabase PostgreSQL schema and RLS policies
├── HOW_TO_RUN_ON_THIS_PC.txt # Local testing and deployment guide
├── Workflow.md               # Detailed workflow explanation
├── .gitignore                # Excludes .venv, .env files from git
└── README.md                 # This file
```

---

## ⚡ Quick Start

See [`HOW_TO_RUN_ON_THIS_PC.txt`](HOW_TO_RUN_ON_THIS_PC.txt) for the full step-by-step guide.

**Short version:**
```powershell
# 1. Create & activate virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 2. Install dependencies
pip install -r backend\requirements.txt

# 3. Set up your API keys and Database URL
copy backend\.env.example backend\.env
# Edit backend\.env with your real keys

# 4. Start the server
cd backend
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000

# 5. Open in browser
# → http://127.0.0.1:8000
```

---

## 🔑 Required API Keys

| Key | Where to get it | Required? |
|---|---|---|
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) | For AI Chat feature |
| `DATABASE_URL` | Your Supabase project settings | To connect to PostgreSQL |
| `SUPABASE_JWT_SECRET` | Your Supabase project settings | For auth verification |

---

## 🛠️ Tech Stack

- **Frontend:** React 18 (Babel Standalone), CSS3 (glassmorphism), HTML5
- **Backend:** Python 3.12, FastAPI, SQLAlchemy, Pydantic
- **Database & Auth:** Supabase (PostgreSQL), JWT
- **AI:** Groq API (LLaMA 3.3 70B), SentenceTransformers (`all-mpnet-base-v2`)
- **Server:** Uvicorn (ASGI)
