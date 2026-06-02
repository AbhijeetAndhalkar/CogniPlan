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
from datetime import date, timedelta, datetime
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
from tools import make_tools
import models

# ── LLM — instantiated lazily in run_agent() so .env is always loaded first ──
_groq_api_key = os.getenv("GROQ_API_KEY")  # read once as a sanity check
if not _groq_api_key:
    print("WARNING: GROQ_API_KEY not found in environment. AI chat will fail until .env is loaded.")

# ── Agent State ────────────────────────────────────────────────────────────────
class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]  # append-only via add_messages
    user_id: str





# ══════════════════════════════════════════════════════════════════════════════
# ACTION DETECTOR
# Inspects the final message list to determine what the AI did —
# so the frontend knows whether to refresh todos, habits, or nothing.
# ══════════════════════════════════════════════════════════════════════════════
_TASK_TOOLS   = {"add_task", "reschedule_task", "mark_task_done", "delete_all_tasks"}
_HABIT_TOOLS  = {"add_habit", "delete_habit", "edit_habit", "mark_habit_done", "delete_all_habits"}

def _detect_action(messages: list[BaseMessage]) -> str:
    """Walk the message list and return the highest-priority action_taken signal."""
    task_touched  = False
    habit_touched = False
    for msg in messages:
        # ToolMessage carries the tool name in its `name` attribute
        tool_name = getattr(msg, "name", None)
        if tool_name in _TASK_TOOLS:
            task_touched = True
        if tool_name in _HABIT_TOOLS:
            habit_touched = True
    if habit_touched and task_touched:
        return "refresh_all"
    if habit_touched:
        return "refresh_habits"
    if task_touched:
        return "refresh_tasks"
    return "none"


# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC ENTRY POINT
# Called once per chat message from main.py.
# ══════════════════════════════════════════════════════════════════════════════
SYSTEM_PROMPT = (
    "You are CogniPlan's AI Co-Pilot — a smart, friendly, human-like productivity coach.\n"
    "Today's exact date and time is {today}.\n"
    "You have access to tools to manage the user's habits and tasks. "
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
    today_str = datetime.now().strftime("%A, %Y-%m-%d %H:%M:%S")
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