import calendar
import os
import json
from collections import defaultdict
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from sqlalchemy.orm import Session
from datetime import date
from pydantic import BaseModel
from database import SessionLocal

from database import engine, get_db
import models, schemas
import agent                          # LangGraph ReAct agent + embed_model
import groq                           # kept for legacy error type (now unused but harmless)

# Load the hidden variables from the .env file
load_dotenv()

# Securely fetch the secret key from environment variables (not hardcoded in code)
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

# This acts as our lightweight checkpointer for memory (keyed by user_id)
# Format: { user_id: [{"role": "user"|"assistant", "content": "..."}] }
chat_memory: dict[str, list] = defaultdict(list)

# Create tables in the database if they do not already exist
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Productivity Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)  # Enable cross-origin requests (frontend â†” backend communication)

# â”€â”€ Static file serving â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Ensures frontend works regardless of where the server is started from
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", "docs"))

# (Static files mount moved to the bottom of the file to serve from root without overriding API routes)

@app.get("/", include_in_schema=False)  # When user opens the website, return the React frontend
def serve_dashboard():
    react_path = os.path.join(FRONTEND_DIR, "index-react.html")
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(react_path):
        return FileResponse(react_path)       # â† React version (active)
    if os.path.exists(index_path):
        return FileResponse(index_path)       # â† Fallback: vanilla version
    return {"error": f"Could not find index-react.html. Looking here: {react_path}"}



security = HTTPBearer()

def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    token = credentials.credentials

    # Fallback to ensure "Bearer " is stripped if something weird happened with the header
    if token.startswith("Bearer "):
        token = token[7:]

    try:
        # key="" is required by PyJWT stubs even when verify_signature=False
        payload = jwt.decode(token, key="", algorithms=["HS256"], options={"verify_signature": False, "verify_aud": False})
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return str(user_id)  # explicit cast so Pylance knows the return type is str
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.PyJWTError as e:
        # Include the specific PyJWT error reason in the console and response for easier debugging
        print(f"[AUTH ERROR] Failed to decode JWT: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Could not validate credentials: {str(e)}")


# ==========================================
# 1. TASK ENDPOINTS (One-off Tasks)
# ==========================================

@app.post("/tasks/", response_model=schemas.TaskResponse)
def create_task(task: schemas.TaskCreate, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user_id)):
    # Generate a semantic embedding so this task is searchable by meaning later
    vector = agent.embed_model.encode(task.title).tolist()
    db_task = models.Task(**task.model_dump(), user_id=current_user_id, embedding=vector)
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task


@app.get("/tasks/", response_model=list[schemas.TaskResponse])
def get_tasks(db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user_id)):
    return db.query(models.Task).filter(models.Task.user_id == current_user_id).all()  # Fetch all tasks from database


@app.put("/tasks/{task_id}/toggle", response_model=schemas.TaskResponse)
def toggle_task(task_id: int, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user_id)):
    task = db.query(models.Task).filter(models.Task.id == task_id, models.Task.user_id == current_user_id).first()  # Find task by ID
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.is_completed = not task.is_completed  # Toggle completion status
    db.commit()
    db.refresh(task)
    return task

@app.put("/tasks/{task_id}", response_model=schemas.TaskResponse)
def update_task(task_id: int, task_update: schemas.TaskUpdate, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user_id)):
    task = db.query(models.Task).filter(models.Task.id == task_id, models.Task.user_id == current_user_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    update_data = task_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(task, key, value)
        
    db.commit()
    db.refresh(task)
    return task


@app.delete("/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user_id)):
    task = db.query(models.Task).filter(models.Task.id == task_id, models.Task.user_id == current_user_id).first()  # Find task

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    db.delete(task)  # Delete from DB
    db.commit()

    return {"message": f"Task {task_id} deleted successfully"}


# ==========================================
# 2. HABIT ENDPOINTS (Recurring Goals)
# ==========================================

@app.post("/habits/", response_model=schemas.HabitResponse)
def create_habit(habit: schemas.HabitCreate, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user_id)):
    db_habit = models.Habit(**habit.model_dump(), user_id=current_user_id)  # Convert request to DB object
    db.add(db_habit)
    db.commit()
    db.refresh(db_habit)
    return db_habit


@app.get("/habits/", response_model=list[schemas.HabitResponse])
def get_habits(db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user_id)):
    return db.query(models.Habit).filter(models.Habit.user_id == current_user_id).all()  # Fetch all habits

@app.put("/habits/{habit_id}", response_model=schemas.HabitResponse)
def update_habit(habit_id: int, habit_update: schemas.HabitUpdate, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user_id)):
    habit = db.query(models.Habit).filter(models.Habit.id == habit_id, models.Habit.user_id == current_user_id).first()
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")
    
    update_data = habit_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(habit, key, value)
        
    db.commit()
    db.refresh(habit)
    return habit


@app.delete("/habits/{habit_id}")
def delete_habit(habit_id: int, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user_id)):
    habit = db.query(models.Habit).filter(models.Habit.id == habit_id, models.Habit.user_id == current_user_id).first()

    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")

    db.delete(habit)
    db.commit()

    return {"message": f"Habit {habit_id} deleted successfully"}


# ==========================================
# 3. HABIT TRACKING (Checkbox Logic)
# ==========================================

@app.post("/track/")
def toggle_habit_log(habit_id: int, log_date: date, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user_id)):
    """
    Handles checkbox behavior in UI:
    - If log exists â†’ toggle True/False
    - If not â†’ create new log (True)
    """

    habit = db.query(models.Habit).filter(models.Habit.id == habit_id, models.Habit.user_id == current_user_id).first()
    if not habit:
        raise HTTPException(status_code=403, detail="Not authorized or habit not found")

    log = db.query(models.HabitLog).filter(
        models.HabitLog.habit_id == habit_id,
        models.HabitLog.date == log_date,
        models.HabitLog.user_id == current_user_id
    ).first()

    if log:
        log.status = not log.status  # Toggle existing status
    else:
        log = models.HabitLog(habit_id=habit_id, date=log_date, status=True, user_id=current_user_id)
        db.add(log)  # Create new log

    db.commit()
    db.refresh(log)

    return {"message": "Habit toggled", "habit_id": habit_id, "date": log.date, "status": log.status}


# ==========================================
# 4. ANALYTICS â€” Habit Matrix (Gap-Fill)
# ==========================================

def _compute_streak(logs_map: dict, total_days: int, today_day: int) -> int:  # Returns current streak
    streak = 0  # Initialize streak counter

    # Iterate backward from today to day 1
    for d in range(min(today_day, total_days), 0, -1):
        if logs_map.get(str(d)):  # Check if habit was completed (True)
            streak += 1
        else:
            break  # Stop when streak breaks

    return streak


@app.get("/analytics/matrix", response_model=schemas.MatrixResponse)  # API to generate habit calendar matrix
def get_matrix(
    year: int = Query(default=None),  # Optional query parameter
    month: int = Query(default=None),  # Optional query parameter
    db: Session = Depends(get_db),  # Inject DB session
    current_user_id: str = Depends(get_current_user_id)
):
    """
    Returns full habit calendar:
    - Fills missing days as False
    - Calculates streak and completion %
    """

    today = date.today()
    year  = year  or today.year
    month = month or today.month

    _, days_in_month = calendar.monthrange(year, month)
    day_range  = list(range(1, days_in_month + 1))

    today_day = today.day if (today.year == year and today.month == month) else days_in_month

    habits = (
        db.query(models.Habit)
        .filter(models.Habit.is_active == True, models.Habit.user_id == current_user_id)  # Only active habits for user
        .order_by(models.Habit.created_at)  # Sort by creation
        .all()
    )

    month_start = date(year, month, 1)
    month_end   = date(year, month, days_in_month)

    all_logs = (
        db.query(models.HabitLog)
        .filter(
            models.HabitLog.date >= month_start,
            models.HabitLog.date <= month_end,
            models.HabitLog.user_id == current_user_id
        )
        .all()  # Fetch logs for this month
    )

    log_index = {}  # {habit_id: {day: status}}
    for log in all_logs:
        log_index.setdefault(log.habit_id, {})[str(log.date.day)] = log.status

    habit_rows = []

    for habit in habits:
        logs_map = {
            str(d): log_index.get(habit.id, {}).get(str(d), False)  # Gap-fill missing days as False
            for d in day_range
        }

        completed = sum(1 for v in logs_map.values() if v)  # Count completed days

        pct = round((completed / today_day) * 100, 1) if today_day else 0.0  # Completion %

        streak = _compute_streak(logs_map, days_in_month, today_day)  # Current streak

        habit_rows.append({
            "id": habit.id,
            "title": habit.title,
            "color_theme": habit.color_theme,
            "logs": logs_map,
            "streak": streak,
            "completion_pct": pct,
        })

    return {
        "year": year,
        "month": month,
        "days": day_range,
        "today": today.day if (today.year == year and today.month == month) else None,
        "habits": habit_rows,
    }


# ==========================================
# 4.5 ANALYTICS SIDEBAR
# ==========================================

@app.get("/api/analytics/sidebar")
def get_sidebar_analytics(db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user_id)):
    from datetime import datetime, timedelta

    today = datetime.utcnow().date()
    # Execution: Today's habits and tasks completion %
    tasks = db.query(models.Task).filter(models.Task.user_id == current_user_id).all()
    tasks_today = [t for t in tasks if (t.due_date and t.due_date.date() == today) or (not t.due_date and t.created_at.date() == today)]
    tasks_completed = sum(1 for t in tasks_today if t.is_completed)
    tasks_pct = int((tasks_completed / len(tasks_today) * 100)) if tasks_today else 0

    habits = db.query(models.Habit).filter(models.Habit.user_id == current_user_id, models.Habit.is_active == True).all()
    habit_logs_today = db.query(models.HabitLog).filter(models.HabitLog.user_id == current_user_id, models.HabitLog.date == today).all()
    logged_habit_ids = {log.habit_id for log in habit_logs_today if log.status}
    habits_completed = sum(1 for h in habits if h.id in logged_habit_ids)
    habits_pct = int((habits_completed / len(habits) * 100)) if habits else 0

    # Consistency: 30 days
    start_date = today - timedelta(days=29)
    consistency = []
    all_logs = db.query(models.HabitLog).filter(models.HabitLog.user_id == current_user_id, models.HabitLog.date >= start_date).all()
    
    for i in range(30):
        d = start_date + timedelta(days=i)
        has_log = any(log.date == d and log.status for log in all_logs)
        has_task = any(t.is_completed and ((t.due_date and t.due_date.date() == d) or (not t.due_date and t.created_at.date() == d)) for t in tasks)
        consistency.append(bool(has_log or has_task))

    # Focus Allocation
    coding_kws = ["code", "dev", "bug", "feature", "build", "dsa", "leetcode", "react", "api"]
    prep_kws = ["interview", "prep", "study", "read", "apply", "resume"]
    break_kws = ["break", "rest", "lunch", "walk", "gym", "workout"]
    
    alloc_counts = {"coding": 0, "prep": 0, "break": 0}
    for t in tasks:
        title = t.title.lower()
        if any(kw in title for kw in break_kws): alloc_counts["break"] += 1
        elif any(kw in title for kw in prep_kws): alloc_counts["prep"] += 1
        elif any(kw in title for kw in coding_kws): alloc_counts["coding"] += 1
        
    mapped_total = sum(alloc_counts.values())
    if mapped_total > 0:
        coding_pct = int(alloc_counts["coding"] / mapped_total * 100)
        prep_pct = int(alloc_counts["prep"] / mapped_total * 100)
        break_pct = 100 - coding_pct - prep_pct
        allocation = {"coding": coding_pct, "prep": prep_pct, "break": break_pct}
    else:
        allocation = {"coding": 60, "prep": 25, "break": 15}

    return {
        "execution": {"habits": habits_pct, "tasks": tasks_pct},
        "consistency": consistency,
        "allocation": allocation
    }

# ==========================================
# 5. AI INTELLIGENCE â€” LangGraph ReAct Agent
# ==========================================

class ChatRequest(BaseModel):
    message: str


@app.post("/api/chat")
async def chat_with_ai(
    request: ChatRequest,
    current_user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Single entry point for the AI Co-Pilot.
    Delegates entirely to the LangGraph ReAct agent in agent.py.
    The agent loops (reason â†’ tool â†’ observe â†’ reasonâ€¦) until it hits END,
    then returns a synthesized response and an action signal for the frontend.
    """
    try:
        # Retrieve this user's conversation history (plain dicts)
        history = chat_memory[current_user_id]

        # Run the LangGraph ReAct loop â€” returns only when the AI is done
        response_text, action_taken = agent.run_agent(
            user_message=request.message,
            user_id=current_user_id,
            db=db,
            history=history,
        )

        # Update in-memory history (last 10 turns to avoid context blowup)
        chat_memory[current_user_id].append({"role": "user",      "content": request.message})
        chat_memory[current_user_id].append({"role": "assistant", "content": response_text})
        chat_memory[current_user_id] = chat_memory[current_user_id][-20:]  # 10 turns = 20 messages

        return {"response": response_text, "action_taken": action_taken}

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")


# Mount static files at root / so relative paths in index-react.html work perfectly.
# MUST BE AT THE END so it does not override API routes.
app.mount("/", StaticFiles(directory=FRONTEND_DIR), name="static")
