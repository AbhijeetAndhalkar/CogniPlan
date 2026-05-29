"""
agent.py — CogniPlan LangGraph ReAct Agent
===========================================
Architecture: cyclic StateGraph
  START → agent_node
             │ (tool call?)
             ├─ YES → tools_node → agent_node  (loop until done)
             └─ NO  → END

Key design choices:
- embed_model lives here so all AI logic is co-located.
- make_tools() is a factory that returns @tool closures capturing (user_id, db).
  This lets us compile the graph structure once and only rebuild the
  LLM+tools binding per request (cheap).
- run_agent() is the single public function called from main.py.
"""

import os
import time
from datetime import date, timedelta
from typing import Annotated, TypedDict

from dotenv import load_dotenv
from sqlalchemy.orm import Session

# ── LangGraph / LangChain ──────────────────────────────────────────────────────
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, BaseMessage
from langchain_core.tools import tool
from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

# ── Local modules ──────────────────────────────────────────────────────────────
from sentence_transformers import SentenceTransformer
import models

load_dotenv()  # MUST be before ChatGroq() so GROQ_API_KEY is in the environment

# ── Embedding model (loaded once at import time) ───────────────────────────────
# all-mpnet-base-v2 → 768-dim vectors. First run downloads ~420 MB to
# ~/.cache/huggingface; every subsequent start is instant.
print("Loading AI Embedding Model...")
embed_model = SentenceTransformer("all-mpnet-base-v2")
print("Embedding model ready!")

# ── LLM — instantiated lazily in run_agent() so .env is always loaded first ──
_groq_api_key = os.getenv("GROQ_API_KEY")  # read once as a sanity check
if not _groq_api_key:
    print("WARNING: GROQ_API_KEY not found in environment. AI chat will fail until .env is loaded.")

# ── Agent State ────────────────────────────────────────────────────────────────
class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]  # append-only via add_messages
    user_id: str


# ══════════════════════════════════════════════════════════════════════════════
# TOOL FACTORY
# Returns a fresh list of @tool closures that already "know" the current
# user_id and db session, so the LLM never sees those internal parameters.
# ══════════════════════════════════════════════════════════════════════════════
def make_tools(user_id: str, db: Session) -> list:
    """Build a set of LangChain tools bound to this request's user and DB."""

    @tool
    def add_habit(title: str) -> str:
        """Add a new recurring daily habit for the user."""
        new_habit = models.Habit(title=title, user_id=user_id)
        db.add(new_habit)
        db.commit()
        return f"✅ Created habit: '{title}'"

    @tool
    def delete_habit(name: str) -> str:
        """Delete an existing recurring habit by name (fuzzy match)."""
        habit = (
            db.query(models.Habit)
            .filter(
                models.Habit.title.ilike(f"%{name}%"),
                models.Habit.user_id == user_id,
            )
            .first()
        )
        if not habit:
            return f"⚠️ No habit found matching '{name}'."
        db.delete(habit)
        db.commit()
        return f"🗑️ Deleted habit: '{habit.title}'"

    @tool
    def get_habits() -> str:
        """List all of the user's current habits."""
        habits = (
            db.query(models.Habit)
            .filter(models.Habit.user_id == user_id, models.Habit.is_active == True)
            .all()
        )
        if not habits:
            return "You don't have any habits yet!"
        return "\n".join([f"• {h.title}" for h in habits])

    @tool
    def add_todo(todo_text: str) -> str:
        """Add a new one-time to-do task for the user. Generates a semantic embedding for future search."""
        vector = embed_model.encode(todo_text).tolist()
        new_todo = models.Todo(title=todo_text, user_id=user_id, embedding=vector)
        db.add(new_todo)
        db.commit()
        return f"✅ Added to To-Do list: '{todo_text}'"

    @tool
    def mark_habit_done(name: str, log_date: str = None) -> str:
        """Mark a recurring habit as completed for a specific date (YYYY-MM-DD).
        If the user does not specify a date, leave log_date empty and it will default to today."""
        habit = (
            db.query(models.Habit)
            .filter(
                models.Habit.title.ilike(f"%{name}%"),
                models.Habit.user_id == user_id,
            )
            .first()
        )
        if not habit:
            return f"⚠️ No habit found matching '{name}'."

        # Safely handle the date parsing
        if log_date:
            try:
                parsed_date = date.fromisoformat(log_date)
            except Exception:
                parsed_date = date.today()
        else:
            parsed_date = date.today()

        log = (
            db.query(models.HabitLog)
            .filter(
                models.HabitLog.habit_id == habit.id,
                models.HabitLog.date == parsed_date,
                models.HabitLog.user_id == user_id,
            )
            .first()
        )
        if log:
            log.status = True
        else:
            log = models.HabitLog(
                habit_id=habit.id, date=parsed_date, status=True, user_id=user_id
            )
            db.add(log)
        db.commit()
        return f"✅ Marked '{habit.title}' as done for {parsed_date.isoformat()}."

    @tool
    def search_past_tasks(query: str) -> str:
        """Semantic vector search to find past or existing to-do tasks using natural language.
        Use when the user asks what tasks they have related to a topic, or wants to find something they added before."""
        query_vector = embed_model.encode(query).tolist()
        results = (
            db.query(models.Todo)
            .filter(
                models.Todo.user_id == user_id,
                models.Todo.embedding.isnot(None),
            )
            .order_by(models.Todo.embedding.cosine_distance(query_vector))
            .limit(5)
            .all()
        )
        if not results:
            return "No related tasks found in your list."
        rows = [
            f"- {t.title} ({'✅ done' if t.is_completed else '⬜ pending'})"
            for t in results
        ]
        return "\n".join(rows)

    @tool
    def delete_all_habits() -> str:
        """Bulk deletes every habit to clear the board."""
        habits = db.query(models.Habit).filter(models.Habit.user_id == user_id).all()
        count = len(habits)
        for h in habits:
            db.delete(h)
        db.commit()
        return f"🗑️ Deleted all {count} habits."

    @tool
    def mark_todo_done(title: str) -> str:
        """Checks off a pending task."""
        todo = (
            db.query(models.Todo)
            .filter(
                models.Todo.title.ilike(f"%{title}%"),
                models.Todo.user_id == user_id,
            )
            .first()
        )
        if not todo:
            return f"⚠️ No task found matching '{title}'."
        todo.is_completed = True
        db.commit()
        return f"✅ Marked task '{todo.title}' as done."

    @tool
    def delete_all_todos() -> str:
        """Bulk deletes every task."""
        todos = db.query(models.Todo).filter(models.Todo.user_id == user_id).all()
        count = len(todos)
        for t in todos:
            db.delete(t)
        db.commit()
        return f"🗑️ Deleted all {count} tasks."

    @tool
    def get_daily_agenda() -> str:
        """Retrieves a combined list of all pending to-do tasks and active habits for today."""
        pending_tasks = db.query(models.Todo).filter(models.Todo.user_id == user_id, models.Todo.is_completed == False).all()
        active_habits = db.query(models.Habit).filter(models.Habit.user_id == user_id, models.Habit.is_active == True).all()
        
        task_list = [f"- Task: {t.title}" for t in pending_tasks]
        habit_list = [f"- Habit: {h.title}" for h in active_habits]
        
        if not task_list and not habit_list:
            return "Your agenda is completely clear today!"
        return "PENDING TASKS:\n" + "\n".join(task_list) + "\n\nACTIVE HABITS:\n" + "\n".join(habit_list)

    @tool
    def get_progress_report() -> str:
        """Checks the user's habit logs to see what they have completed today."""
        today = date.today()
        logs_today = db.query(models.HabitLog).filter(
            models.HabitLog.user_id == user_id,
            models.HabitLog.date == today,
            models.HabitLog.status == True,
        ).all()

        if not logs_today:
            return "No habits logged yet today."
        completed = [str(log.habit_id) for log in logs_today]
        return f"Habit IDs completed today: {', '.join(completed)}."

    return [
        add_habit, delete_habit, get_habits, mark_habit_done, delete_all_habits,
        add_todo, mark_todo_done, delete_all_todos,
        search_past_tasks, get_daily_agenda, get_progress_report
    ]


# ══════════════════════════════════════════════════════════════════════════════
# ACTION DETECTOR
# Inspects the final message list to determine what the AI did —
# so the frontend knows whether to refresh todos, habits, or nothing.
# ══════════════════════════════════════════════════════════════════════════════
_TODO_TOOLS   = {"add_todo", "mark_todo_done", "delete_all_todos"}
_HABIT_TOOLS  = {"add_habit", "delete_habit", "mark_habit_done", "delete_all_habits"}

def _detect_action(messages: list[BaseMessage]) -> str:
    """Walk the message list and return the highest-priority action_taken signal."""
    todo_touched  = False
    habit_touched = False
    for msg in messages:
        # ToolMessage carries the tool name in its `name` attribute
        tool_name = getattr(msg, "name", None)
        if tool_name in _TODO_TOOLS:
            todo_touched = True
        if tool_name in _HABIT_TOOLS:
            habit_touched = True
    if habit_touched and todo_touched:
        return "refresh_all"
    if habit_touched:
        return "refresh_habits"
    if todo_touched:
        return "refresh_todos"
    return "none"


# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC ENTRY POINT
# Called once per chat message from main.py.
# ══════════════════════════════════════════════════════════════════════════════
SYSTEM_PROMPT = (
    "You are CogniPlan's AI Co-Pilot — a smart, friendly, human-like productivity coach.\n"
    "Today's date is {today}.\n"
    "You have access to tools to manage the user's habits and to-do tasks. "
    "If a request is vague (e.g. 'I want to start going to the gym'), ask whether it should be "
    "a daily habit or a one-time task before acting.\n"
    "When you need multiple pieces of information, use tools in sequence — search first, then act."
)


def run_agent(
    user_message: str,
    user_id: str,
    db: Session,
    history: list[dict],          # raw dicts: [{"role": "user"|"assistant", "content": "..."}]
) -> tuple[str, str]:
    """
    Run the LangGraph ReAct loop and return (response_text, action_taken).

    Parameters
    ----------
    user_message : The new message from the user.
    user_id      : Authenticated user's UUID (from Supabase JWT).
    db           : SQLAlchemy session for this request.
    history      : Recent conversation history (last ~10 messages).
    """
    # Build the LLM here (after load_dotenv() has run in main.py at startup)
    llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0.3,
        api_key=os.getenv("GROQ_API_KEY"),
    )

    # 1. Build request-scoped tools (closures capture user_id + db)
    bound_tools = make_tools(user_id, db)
    llm_with_tools = llm.bind_tools(bound_tools)

    # 2. Build the graph (fast — no heavy computation)
    def agent_node(state: AgentState):
        time.sleep(1.5)
        response = llm_with_tools.invoke(state["messages"])
        return {"messages": [response]}

    tool_node = ToolNode(tools=bound_tools)

    builder = StateGraph(AgentState)
    builder.add_node("agent", agent_node)
    builder.add_node("tools", tool_node)
    builder.add_edge(START, "agent")
    builder.add_conditional_edges("agent", tools_condition)
    builder.add_edge("tools", "agent")
    graph = builder.compile()

    # 3. Convert history dicts → LangChain message objects
    lc_history: list[BaseMessage] = []
    for msg in history:
        if msg["role"] == "user":
            lc_history.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            lc_history.append(AIMessage(content=msg["content"]))

    # 4. Build the full messages list: system + history + new user message
    today_str = date.today().isoformat()
    all_messages: list[BaseMessage] = [
        SystemMessage(content=SYSTEM_PROMPT.format(today=today_str)),
        *lc_history,
        HumanMessage(content=user_message),
    ]

    # 5. Run the ReAct loop — returns only when the graph hits END
    final_state = graph.invoke({"messages": all_messages, "user_id": user_id})

    # 6. Extract the final AI text (last message in state)
    final_response = final_state["messages"][-1].content or "Done!"

    # 7. Detect what tools were called (for frontend refresh signals)
    action_taken = _detect_action(final_state["messages"])

    return final_response, action_taken