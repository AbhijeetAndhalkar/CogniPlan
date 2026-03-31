# ⚡ FlowBoard – AI-Powered Productivity Dashboard

FlowBoard is a full-stack productivity app that combines **habit tracking**, **todo management**, and an **AI chat assistant** into a single premium dark-themed dashboard — all running locally with no external cloud services required (except optional AI features).

---

## ✨ Features

| Feature | Description |
|---|---|
| ✅ **Todo Manager** | Add, complete, and delete one-off tasks |
| 🔄 **Habit Tracker** | Track recurring daily habits across a full month grid |
| 📊 **Analytics Matrix** | Visual month-view grid with streaks and completion percentages |
| 🤖 **AI Chat Agent** | Natural language assistant powered by Groq (LLaMA 3.3 70B) that creates todos or marks habits done |
| 🔒 **Authentication** | Supabase JWT-based login/signup screen |
| 💾 **Local Database** | SQLite — no external database needed |

---

## 🗂️ Project Structure

```
FlowBoard/
├── backend/                  # FastAPI Python backend
│   ├── main.py               # App entry point, all API route definitions
│   ├── agent.py              # AI dispatcher (Groq LLM + Pinecone memory)
│   ├── models.py             # SQLAlchemy ORM table definitions
│   ├── schemas.py            # Pydantic request/response schemas
│   ├── database.py           # SQLite engine and session setup
│   ├── seed.py               # Script to pre-populate sample data
│   ├── requirements.txt      # Python dependencies
│   └── .env                  # 🔒 Secret API keys (NOT committed to git)
│
├── frontend/                 # Vanilla HTML/CSS/JS frontend
│   ├── index.html            # Single-page app shell + auth overlay
│   ├── app.js                # All frontend logic (API calls, rendering, auth)
│   └── style.css             # Premium dark glassmorphic UI styles
│
├── docs/                     # Project documentation
│   ├── SETUP.md              # Step-by-step startup guide
│   └── ARCHITECTURE.md       # How the system works & file-by-file breakdown
│
├── .gitignore                # Excludes .venv, .env, .db files from git
└── README.md                 # This file
```

---

## ⚡ Quick Start

See [`docs/SETUP.md`](docs/SETUP.md) for the full step-by-step guide.

**Short version:**
```powershell
# 1. Create & activate virtual environment
python -m venv .venv
.venv\Scripts\Activate.ps1

# 2. Install dependencies
pip install -r backend\requirements.txt

# 3. Set up your API keys
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
| `PINECONE_API_KEY` | [app.pinecone.io](https://app.pinecone.io) | For AI memory (optional) |
| `SUPABASE_JWT_SECRET` | Your Supabase project settings | For auth verification |

---

## 🛠️ Tech Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy, SQLite, Pydantic
- **Frontend:** Vanilla HTML5, CSS3 (glassmorphism), JavaScript (ES6+)
- **AI:** Groq API (LLaMA 3.3 70B), Pinecone vector DB
- **Auth:** Supabase JWT
- **Server:** Uvicorn (ASGI)
