import os
from dotenv import load_dotenv
from groq import Groq
import json
from datetime import date
from sqlalchemy.orm import Session
import models

# ── 1. SETUP & AUTHENTICATION ─────────────────────────────────────────────────
# We load the .env file to keep our API keys secret. 
# Then we initialize the Groq client, which acts as our connection to the LLaMA model.
load_dotenv()
api_key = os.getenv("GROQ_API_KEY")
client = Groq(api_key=api_key)


# ── 2. DATABASE FUNCTIONS (The "Action" Tools) ────────────────────────────────
# The AI cannot magically talk to a database. It only generates text.
# So, we write these standard Python functions to do the actual database work.
# Later, we will give the AI a "remote control" to trigger these functions.

def create_agent_habit(db: Session, title: str, user_id: str):
    habit = models.Habit(title=title, user_id=user_id)
    db.add(habit)
    db.commit()
    db.refresh(habit)
    return f"Created Habit: {title}"

def delete_agent_habit(db: Session, title: str, user_id: str):
    # We use .ilike() for a flexible search (e.g., finding "gym" even if they type "Gym")
    habit = db.query(models.Habit).filter(models.Habit.title.ilike(f"%{title}%"), models.Habit.user_id == user_id).first()
    if not habit:
        return f"Could not find habit matching '{title}' to delete"
    db.delete(habit)
    db.commit()
    return f"Deleted habit: {habit.title}"

def create_agent_todo(db: Session, title: str, user_id: str):
    todo = models.Todo(title=title, user_id=user_id)
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return f"Created Todo: {title}"

def mark_habit_done(db: Session, habit_title: str, log_date: str, user_id: str):
    habit = db.query(models.Habit).filter(models.Habit.title.ilike(f"%{habit_title}%"), models.Habit.user_id == user_id).first()
    if not habit:
        return f"Could not find habit matching '{habit_title}'"
    
    # We parse the date string sent by the AI into a real Python date object
    try:
        parsed_date = date.fromisoformat(log_date)
    except Exception:
        parsed_date = date.today()
    
    # Check if a log already exists for this exact day
    log = db.query(models.HabitLog).filter(
        models.HabitLog.habit_id == habit.id,
        models.HabitLog.date == parsed_date,
        models.HabitLog.user_id == user_id
    ).first()

    if log:
        log.status = True
        action_msg = f"Updated habit '{habit.title}' as done for {log_date}."
    else:
        log = models.HabitLog(habit_id=habit.id, date=parsed_date, status=True, user_id=user_id)
        db.add(log)
        action_msg = f"Marked habit '{habit.title}' as done for {log_date}."
        
    db.commit()
    return action_msg


# ── 3. AI TOOL SCHEMA (The "Menu") ────────────────────────────────────────────
# This is how we teach the AI what our Python functions do.
# We define a strict JSON schema describing the function names and the required arguments.
tools = [
    {
        "type": "function",
        "function": {
            "name": "create_agent_habit",
            "description": "Create a new recurring Habit.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "The title or description of the habit."
                    }
                },
                "required": ["title"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_agent_habit",
            "description": "Delete an existing recurring Habit.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "The title or description of the habit to delete."
                    }
                },
                "required": ["title"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_agent_todo",
            "description": "Create a new one-off Todo task.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "The title or description of the task."
                    }
                },
                "required": ["title"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mark_habit_done",
            "description": "Mark a recurring habit as done for a specific date.",
            "parameters": {
                "type": "object",
                "properties": {
                    "habit_title": {
                        "type": "string",
                        "description": "The name of the habit (e.g., 'gym', 'read', 'code')."
                    },
                    "log_date": {
                        "type": "string",
                        "description": "The date the habit was done, in YYYY-MM-DD format."
                    }
                },
                "required": ["habit_title", "log_date"]
            }
        }
    }
]


# ── 4. THE DISPATCHER (The "Brain") ───────────────────────────────────────────
# This function is called by main.py every time the user types a message.

def run_dispatcher(user_message: str, db: Session, user_id: str):
    if not client:
        return "Groq client is not initialized (check API keys in .env)."
    
    # 4A. Build the System Prompt (Giving the AI context like today's date)
    today_str = date.today().isoformat()
    system_prompt = f"You are a helpful productivity assistant. Today's date is {today_str}. Route the user's intent to the available functions. Provide a short conversational reply summarizing what you did."
    
    try:
        # 4B. Send the message and the 'tools' menu to the LLaMA model
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            tools=tools,
            tool_choice="auto", # The AI decides if it needs a tool or just normal chat
            max_tokens=1000
        )
    except Exception as e:
        return f"Error contacting LLM: {str(e)}"
    
    message = response.choices[0].message
    
    # 4C. Execute Python code if the AI decided to use a tool
    if message.tool_calls:
        results = []
        for tool_call in message.tool_calls:
            function_name = tool_call.function.name
            args = json.loads(tool_call.function.arguments) # Parse the JSON arguments from the AI
            
            # Map the AI's choice to the actual Python function
            if function_name == "create_agent_todo":
                res = create_agent_todo(db, args.get("title"), user_id)
                results.append(res)
            elif function_name == "create_agent_habit":
                res = create_agent_habit(db, args.get("title"), user_id)
                results.append(res)
            elif function_name == "delete_agent_habit":
                res = delete_agent_habit(db, args.get("title"), user_id)
                results.append(res)
            elif function_name == "mark_habit_done":
                res = mark_habit_done(db, args.get("habit_title"), args.get("log_date"), user_id)
                results.append(res)
                
        # Return a text summary of what was saved to the database
        return " | ".join(results)
    
    # 4D. If no tools were needed, just return the conversational text
    return message.content or "Action completed."