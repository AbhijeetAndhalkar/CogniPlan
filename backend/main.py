import calendar
import os
from dotenv import load_dotenv  # Load environment variables (like JWT secrets) securely from a .env file to avoid exposing sensitive data in the source code.

# Load the hidden variables from the .env file
load_dotenv()

# Securely fetch the secret key from environment variables (not hardcoded in code)
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

from fastapi import FastAPI, Depends, HTTPException, Query  # Core FastAPI tools
from fastapi.middleware.cors import CORSMiddleware  # Allows frontend to communicate with backend
from fastapi.staticfiles import StaticFiles  # Serve static files (HTML, CSS, JS)
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from sqlalchemy.orm import Session  # Used to interact with the database
from datetime import date
from typing import List  # For defining response types
from pydantic import BaseModel  # For request/response validation

from database import engine, get_db  # Database connection and session provider
import models, schemas  # models → DB tables, schemas → data validation layer
import agent  # Handles AI logic (calls external API like Groq)

# Create tables in the database if they do not already exist
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Productivity Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)  # Enable cross-origin requests (frontend ↔ backend communication)

# ── Static file serving ──────────────────
# Ensures frontend works regardless of where the server is started from
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", "docs"))

app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")  # Serve frontend files

@app.get("/", include_in_schema=False)  # When user opens the website, return homepage
def serve_dashboard():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"error": f"Could not find index.html. Looking here: {index_path}"}


security = HTTPBearer()

def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")


# ==========================================
# 1. TODO ENDPOINTS (One-off Tasks)
# ==========================================

@app.post("/todos/", response_model=schemas.TodoResponse)
def create_todo(todo: schemas.TodoCreate, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user_id)):
    db_todo = models.Todo(**todo.model_dump(), user_id=current_user_id)  # Convert request data into DB object
    db.add(db_todo)  # Add to session
    db.commit()  # Save to database
    db.refresh(db_todo)  # Refresh to get updated values (like ID)
    return db_todo  # Return created todo


@app.get("/todos/", response_model=List[schemas.TodoResponse])
def get_todos(db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user_id)):
    return db.query(models.Todo).filter(models.Todo.user_id == current_user_id).all()  # Fetch all todos from database


@app.put("/todos/{todo_id}/toggle", response_model=schemas.TodoResponse)
def toggle_todo(todo_id: int, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user_id)):
    todo = db.query(models.Todo).filter(models.Todo.id == todo_id, models.Todo.user_id == current_user_id).first()  # Find todo by ID
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    todo.is_completed = not todo.is_completed  # Toggle completion status
    db.commit()
    db.refresh(todo)
    return todo


@app.delete("/todos/{todo_id}")
def delete_todo(todo_id: int, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user_id)):
    todo = db.query(models.Todo).filter(models.Todo.id == todo_id, models.Todo.user_id == current_user_id).first()  # Find todo

    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    db.delete(todo)  # Delete from DB
    db.commit()

    return {"message": f"Todo {todo_id} deleted successfully"}


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


@app.get("/habits/", response_model=List[schemas.HabitResponse])
def get_habits(db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user_id)):
    return db.query(models.Habit).filter(models.Habit.user_id == current_user_id).all()  # Fetch all habits


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
    - If log exists → toggle True/False
    - If not → create new log (True)
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
# 4. ANALYTICS — Habit Matrix (Gap-Fill)
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


@app.get("/analytics/matrix")  # API to generate habit calendar matrix
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
# 5. AI INTELLIGENCE — Dispatcher chat
# ==========================================

class ChatRequest(BaseModel):
    message: str  # Defines input format for chat API


@app.post("/api/chat")
def chat_endpoint(request: ChatRequest, db: Session = Depends(get_db), current_user_id: str = Depends(get_current_user_id)):
    reply = agent.run_dispatcher(request.message, db, current_user_id)  # Send message to AI logic
    return {"reply": reply}  # Return AI response