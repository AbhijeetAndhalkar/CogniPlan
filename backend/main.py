import calendar
import os
from dotenv import load_dotenv

# Load the hidden variables from the .env file
load_dotenv()

# Now it securely pulls the secret without showing it in the code!
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from datetime import date
from typing import List
from pydantic import BaseModel

from database import engine, get_db
import models, schemas
import agent

# Create tables in the database
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Productivity Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Static file serving (bulletproof absolute-path version) ──────────────────
# Works no matter which directory uvicorn is launched from.
BASE_DIR     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

@app.get("/", include_in_schema=False)
def serve_dashboard():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    # If it fails, tell you exactly where it looked
    return {"error": f"Could not find index.html. Looking here: {index_path}"}



# ==========================================
# 1. TODO ENDPOINTS (One-off Tasks)
# ==========================================

@app.post("/todos/", response_model=schemas.TodoResponse)
def create_todo(todo: schemas.TodoCreate, db: Session = Depends(get_db)):
    db_todo = models.Todo(**todo.model_dump())
    db.add(db_todo)
    db.commit()
    db.refresh(db_todo)
    return db_todo

@app.get("/todos/", response_model=List[schemas.TodoResponse])
def get_todos(db: Session = Depends(get_db)):
    return db.query(models.Todo).all()

@app.put("/todos/{todo_id}/toggle", response_model=schemas.TodoResponse)
def toggle_todo(todo_id: int, db: Session = Depends(get_db)):
    todo = db.query(models.Todo).filter(models.Todo.id == todo_id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    todo.is_completed = not todo.is_completed
    db.commit()
    db.refresh(todo)
    return todo

@app.delete("/todos/{todo_id}")
def delete_todo(todo_id: int, db: Session = Depends(get_db)):
    # Find the todo by ID
    todo = db.query(models.Todo).filter(models.Todo.id == todo_id).first()
    
    # If it doesn't exist, return an error
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    
    # Delete it and save changes
    db.delete(todo)
    db.commit()
    
    return {"message": f"Todo {todo_id} deleted successfully"}


# ==========================================
# 2. HABIT ENDPOINTS (Recurring Goals)
# ==========================================

@app.post("/habits/", response_model=schemas.HabitResponse)
def create_habit(habit: schemas.HabitCreate, db: Session = Depends(get_db)):
    db_habit = models.Habit(**habit.model_dump())
    db.add(db_habit)
    db.commit()
    db.refresh(db_habit)
    return db_habit

@app.get("/habits/", response_model=List[schemas.HabitResponse])
def get_habits(db: Session = Depends(get_db)):
    return db.query(models.Habit).all()


# ==========================================
# 3. HABIT TRACKING (The Grid Checkboxes)
# ==========================================

@app.post("/track/")
def toggle_habit_log(habit_id: int, log_date: date, db: Session = Depends(get_db)):
    """
    This endpoint powers the checkboxes in your UI.
    If a log exists for that day, it flips the status.
    If it doesn't exist, it creates it and marks it as True (Done).
    """
    # 1. Check if a log already exists for this exact habit and date
    log = db.query(models.HabitLog).filter(
        models.HabitLog.habit_id == habit_id,
        models.HabitLog.date == log_date
    ).first()

    if log:
        # If it exists, flip the boolean (True -> False -> True)
        log.status = not log.status
    else:
        # If it doesn't exist, create a new record and set to True
        log = models.HabitLog(habit_id=habit_id, date=log_date, status=True)
        db.add(log)

    db.commit()
    db.refresh(log)

    return {"message": "Habit toggled", "habit_id": habit_id, "date": log.date, "status": log.status}


# ==========================================
# 4. ANALYTICS — Habit Matrix (Gap-Fill)
# ==========================================

def _compute_streak(logs_map: dict, total_days: int, today_day: int) -> int:
    streak = 0
    for d in range(min(today_day, total_days), 0, -1):
        if logs_map.get(str(d)):
            streak += 1
        else:
            break
    return streak


@app.get("/analytics/matrix")
def get_matrix(
    year: int = Query(default=None),
    month: int = Query(default=None),
    db: Session = Depends(get_db),
):
    """
    Returns a full month grid of every habit x every day.
    Missing logs are gap-filled as False so the UI never breaks.
    """
    today = date.today()
    year  = year  or today.year
    month = month or today.month

    _, days_in_month = calendar.monthrange(year, month)
    day_range  = list(range(1, days_in_month + 1))
    today_day  = today.day if (today.year == year and today.month == month) else days_in_month

    habits = (
        db.query(models.Habit)
        .filter(models.Habit.is_active == True)
        .order_by(models.Habit.created_at)
        .all()
    )

    month_start = date(year, month, 1)
    month_end   = date(year, month, days_in_month)
    all_logs = (
        db.query(models.HabitLog)
        .filter(
            models.HabitLog.date >= month_start,
            models.HabitLog.date <= month_end,
        )
        .all()
    )

    # Index: {habit_id: {"day_str": bool}}
    log_index = {}
    for log in all_logs:
        log_index.setdefault(log.habit_id, {})[str(log.date.day)] = log.status

    habit_rows = []
    for habit in habits:
        logs_map = {
            str(d): log_index.get(habit.id, {}).get(str(d), False)
            for d in day_range
        }
        completed   = sum(1 for v in logs_map.values() if v)
        pct         = round((completed / today_day) * 100, 1) if today_day else 0.0
        streak      = _compute_streak(logs_map, days_in_month, today_day)

        habit_rows.append({
            "id":             habit.id,
            "title":         habit.title,
            "color_theme":   habit.color_theme,
            "logs":          logs_map,
            "streak":        streak,
            "completion_pct": pct,
        })

    return {
        "year":   year,
        "month":  month,
        "days":   day_range,
        "today":  today.day if (today.year == year and today.month == month) else None,
        "habits": habit_rows,
    }


# ==========================================
# 5. AI INTELLIGENCE — Dispatcher chat
# ==========================================

class ChatRequest(BaseModel):
    message: str

@app.post("/api/chat")
def chat_endpoint(request: ChatRequest, db: Session = Depends(get_db)):
    reply = agent.run_dispatcher(request.message, db)
    return {"reply": reply}
