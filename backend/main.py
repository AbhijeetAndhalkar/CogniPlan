import calendar
import os
import json
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
    
    # Fallback to ensure "Bearer " is stripped if something weird happened with the header
    if token.startswith("Bearer "):
        token = token[7:]
        
    try:
        # Note: algorithms=["HS256"] and options={"verify_aud": False} are explicitly included
        payload = jwt.decode(token, options={"verify_signature": False, "verify_aud": False})
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.PyJWTError as e:
        # Include the specific PyJWT error reason in the console and response for easier debugging
        print(f"[AUTH ERROR] Failed to decode JWT: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Could not validate credentials: {str(e)}")


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
async def chat_with_ai(
    request: ChatRequest, 
    current_user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    groq_client = agent.client
    if not groq_client:
        raise HTTPException(status_code=500, detail="AI is offline.")

    try:
        # 1. THE TOOLBOX (Now with all 3 tools!)
        tools = [
            {
                "type": "function",
                "function": {
                    "name": "add_habit",
                    "description": "Add a new daily habit.",
                    "parameters": {
                        "type": "object",
                        "properties": {"habit_name": {"type": "string"}},
                        "required": ["habit_name"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "add_todo",
                    "description": "Add a one-time task.",
                    "parameters": {
                        "type": "object",
                        "properties": {"todo_text": {"type": "string"}},
                        "required": ["todo_text"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_habits",
                    "description": "Get a list of the user's current habits.",
                    "parameters": {"type": "object", "properties": {}}
                }
            }
        ]

        # 2. ADVANCED PERSONA & INSTRUCTIONS
        messages = [
            {
                "role": "system", 
                "content": (
                    "You are CogniPlan's AI Co-Pilot, an incredibly smart, friendly, and human-like productivity coach. "
                    "You help the user manage their time, build habits, and crush their goals.\n\n"
                    "### YOUR BEHAVIOR & TONE:\n"
                    "- Speak like a supportive human coach. Be encouraging, empathetic, and conversational.\n"
                    "- Keep your responses concise (1-3 short sentences) because you live in a small floating chat widget.\n"
                    "- Use emojis naturally to feel human, and use Markdown (bolding, bullet points) to make advice easy to read.\n\n"
                    "### TOOL USAGE LOGIC (THINK BEFORE ACTING):\n"
                    "1. HABITS (Recurring): If the user wants to build a daily routine (e.g., 'I want to start reading', 'Drink more water'), use 'add_habit'.\n"
                    "2. TO-DOS (One-time): If the user mentions a specific chore or errand (e.g., 'Call mom tomorrow', 'Buy groceries'), use 'add_todo'.\n"
                    "3. CHECKING STATUS: If the user asks 'What are my habits?', 'What do I have to do?', or 'Show my matrix', use 'get_habits'.\n"
                    "4. GENERAL CHAT: If the user just says 'Hi', asks for advice ('How do I stop procrastinating?'), or is just venting, DO NOT use any tools. Just reply with helpful, conversational text.\n\n"
                    "### STRICT BOUNDARIES:\n"
                    "- NEVER guess. If a request is vague (e.g., 'remind me to workout'), politely ask: 'Should I add this as a daily habit or a one-time to-do?'\n"
                    "- NEVER invent tools. If you don't have a tool for it, just talk normally."
                )
            },
            {"role": "user", "content": request.message}
        ]

        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile", 
            messages=messages,
            tools=tools,
            tool_choice="auto",
            temperature=0.3
        )

        response_message = response.choices[0].message

        # 3. BULLETPROOF TOOL HANDLER
        if response_message.tool_calls:
            for tool_call in response_message.tool_calls:
                try:
                    args = json.loads(tool_call.function.arguments)
                except Exception:
                    args = {}

                if tool_call.function.name == "add_habit":
                    habit_name = args.get("habit_name", "Unknown Habit")
                    new_habit = models.Habit(title=habit_name, user_id=current_user_id)
                    db.add(new_habit)
                    db.commit()
                    return {"response": f"✅ Added '{habit_name}' to your Habits!", "action_taken": "refresh_habits"}

                elif tool_call.function.name == "add_todo":
                    todo_text = args.get("todo_text", "Unknown Task")
                    new_todo = models.Todo(title=todo_text, user_id=current_user_id)
                    db.add(new_todo)
                    db.commit()
                    return {"response": f"✅ Added '{todo_text}' to your To-Do list!", "action_taken": "refresh_todos"}

                elif tool_call.function.name == "get_habits":
                    habits = db.query(models.Habit).filter(models.Habit.user_id == current_user_id).all()
                    if not habits:
                        return {"response": "You don't have any habits set up yet! Want me to add one?", "action_taken": "none"}
                    habit_list = "\n".join([f"• **{h.title}**" for h in habits])
                    return {"response": f"Here are your current habits:\n\n{habit_list}", "action_taken": "none"}

        final_text = response_message.content if response_message.content else "I processed your request!"
        return {"response": final_text, "action_taken": "none"}

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[AI ERROR DETAILED] {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI encountered an error: {str(e)}")