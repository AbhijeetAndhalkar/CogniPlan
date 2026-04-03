import os
from dotenv import load_dotenv
from groq import Groq
import json
import uuid
from datetime import date
from sqlalchemy.orm import Session
from pinecone import Pinecone, ServerlessSpec

import models

# THIS IS THE CRUCIAL LINE THE AI PROBABLY MISSED
load_dotenv()

# Now initialize the client
api_key = os.getenv("GROQ_API_KEY")
client = Groq(api_key=api_key)

# Initialize Pinecone
pinecone_api_key = os.getenv("PINECONE_API_KEY")
pc = Pinecone(api_key=pinecone_api_key) if pinecone_api_key else None
index_name = "todo-log-memory"

# We assume index is created externally or we do it here if possible. 
# Try configuring only if pc is available
if pc:
    if index_name not in pc.list_indexes().names():
        try:
            pc.create_index(
                name=index_name,
                dimension=1536,
                metric="cosine",
                spec=ServerlessSpec(cloud='aws', region='us-east-1')
            )
        except Exception:
            pass # Fails gracefully if free tier doesn't support the region auto-selected
    
    index = pc.Index(index_name)
else:
    index = None

def remember_message(user_message: str):
    """Helper function to upsert user messages so the agent remembers past habits."""
    if not index:
        return
        
    # 1. First, make sure the text isn't empty BEFORE creating the embedding
    if not user_message or not user_message.strip():
        print("Warning: Tried to embed empty text. Skipping.")
        return # Skip the embedding process entirely
        
    # Dummy embedding of 1536 dims to satisfy Pinecone's vector requirements without external embedding API.
    # In a full production system, we'd use OpenAI or HuggingFace to embed the actual text.
    vector_data = [0.0] * 1536 
    
    # 2. Right before you upsert to Pinecone, verify the vector isn't all zeros
    is_all_zeros = all(v == 0.0 for v in vector_data)
    
    if is_all_zeros:
        print("Error: The embedding model returned all zeros! API might be failing.")
    else:
        # It's safe! Send it to Pinecone
        index.upsert(
            vectors=[
                {
                    "id": str(uuid.uuid4()),
                    "values": vector_data,
                    "metadata": {"text": user_message}
                }
            ]
        )

def create_agent_habit(db: Session, title: str):
    habit = models.Habit(title=title)
    db.add(habit)
    db.commit()
    db.refresh(habit)
    return f"Created Habit: {title}"

def delete_agent_habit(db: Session, title: str):
    habit = db.query(models.Habit).filter(models.Habit.title.ilike(f"%{title}%")).first()
    if not habit:
        return f"Could not find habit matching '{title}' to delete"
    db.delete(habit)
    db.commit()
    return f"Deleted habit: {habit.title}"

def create_agent_todo(db: Session, title: str):
    todo = models.Todo(title=title)
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return f"Created Todo: {title}"

def mark_habit_done(db: Session, habit_title: str, log_date: str):
    # Find habit by name loosely matching user input
    habit = db.query(models.Habit).filter(models.Habit.title.ilike(f"%{habit_title}%")).first()
    if not habit:
        return f"Could not find habit matching '{habit_title}'"
    
    # log_date should be string format YYYY-MM-DD
    try:
        parsed_date = date.fromisoformat(log_date)
    except Exception:
        parsed_date = date.today()
    
    log = db.query(models.HabitLog).filter(
        models.HabitLog.habit_id == habit.id,
        models.HabitLog.date == parsed_date
    ).first()

    if log:
        log.status = True
        action_msg = f"Updated habit '{habit.title}' as done for {log_date}."
    else:
        log = models.HabitLog(habit_id=habit.id, date=parsed_date, status=True)
        db.add(log)
        action_msg = f"Marked habit '{habit.title}' as done for {log_date}."
        
    db.commit()
    return action_msg


# JSON Schema for LLM tool selection
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

def run_dispatcher(user_message: str, db: Session):
    if not client:
        return "Groq client is not initialized (check API keys in .env)."
        
    # Remember message via Pinecone
    try:
        remember_message(user_message)
    except Exception as e:
        print("Pinecone upsert failed:", e)
    
    # Provide system prompt context
    today_str = date.today().isoformat()
    system_prompt = f"You are a helpful productivity assistant. Today's date is {today_str}. Route the user's intent to the available functions. Provide a short conversational reply summarizing what you did."
    
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            tools=tools,
            tool_choice="auto",
            max_tokens=1000
        )
    except Exception as e:
        return f"Error contacting LLM: {str(e)}"
    
    message = response.choices[0].message
    
    # Execute mapped Python functions if tools are invoked
    if message.tool_calls:
        results = []
        for tool_call in message.tool_calls:
            function_name = tool_call.function.name
            args = json.loads(tool_call.function.arguments)
            
            if function_name == "create_agent_todo":
                res = create_agent_todo(db, args.get("title"))
                results.append(res)
            elif function_name == "create_agent_habit":
                res = create_agent_habit(db, args.get("title"))
                results.append(res)
            elif function_name == "delete_agent_habit":
                res = delete_agent_habit(db, args.get("title"))
                results.append(res)
            elif function_name == "mark_habit_done":
                res = mark_habit_done(db, args.get("habit_title"), args.get("log_date"))
                results.append(res)
                
        # Return summary string
        return " | ".join(results)
    
    # Otherwise return conversational text
    return message.content or "Action completed."
