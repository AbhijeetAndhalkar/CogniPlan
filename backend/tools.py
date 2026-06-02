from datetime import date, datetime
from sqlalchemy.orm import Session
from langchain_core.tools import tool
from sentence_transformers import SentenceTransformer
import models

# ── Embedding model (loaded once at import time) ───────────────────────────────
print("Loading AI Embedding Model...")
embed_model = SentenceTransformer("all-mpnet-base-v2")
print("Embedding model ready!")

def make_tools(user_id: str, db: Session) -> list:
    """Build a set of LangChain tools bound to this request's user and DB."""

    @tool
    def add_habit(title: str, description: str = None, reminder_time: str = None) -> str:
        """Add a new recurring daily habit for the user."""
        new_habit = models.Habit(title=title, user_id=user_id, description=description, reminder_time=reminder_time)
        db.add(new_habit)
        db.commit()
        return f"✅ Created habit: '{title}'"

    @tool
    def delete_habit(name: str) -> str:
        """Delete an existing recurring habit by name (fuzzy match)."""
        habit = db.query(models.Habit).filter(models.Habit.title.ilike(f"%{name}%"), models.Habit.user_id == user_id).first()
        if not habit:
            return f"⚠️ No habit found matching '{name}'."
        db.delete(habit)
        db.commit()
        return f"🗑️ Deleted habit: '{habit.title}'"

    @tool
    def edit_habit(name: str, new_title: str = None, new_description: str = None, new_reminder_time: str = None) -> str:
        """Edit an existing recurring habit by name."""
        habit = db.query(models.Habit).filter(models.Habit.title.ilike(f"%{name}%"), models.Habit.user_id == user_id).first()
        if not habit:
            return f"⚠️ No habit found matching '{name}'."
        if new_title:
            habit.title = new_title
        if new_description is not None:
            habit.description = new_description
        if new_reminder_time is not None:
            habit.reminder_time = new_reminder_time
        db.commit()
        return f"✅ Updated habit '{habit.title}'."

    @tool
    def get_habits() -> str:
        """List all of the user's current habits."""
        habits = db.query(models.Habit).filter(models.Habit.user_id == user_id, models.Habit.is_active == True).all()
        if not habits:
            return "You don't have any habits yet!"
        return "\n".join([f"• {h.title}" for h in habits])

    @tool
    def mark_habit_done(name: str, log_date: str = None) -> str:
        """Mark a recurring habit as completed for a specific date (YYYY-MM-DD)."""
        habit = db.query(models.Habit).filter(models.Habit.title.ilike(f"%{name}%"), models.Habit.user_id == user_id).first()
        if not habit:
            return f"⚠️ No habit found matching '{name}'."

        if log_date:
            try:
                parsed_date = date.fromisoformat(log_date)
            except Exception:
                parsed_date = date.today()
        else:
            parsed_date = date.today()

        log = db.query(models.HabitLog).filter(models.HabitLog.habit_id == habit.id, models.HabitLog.date == parsed_date, models.HabitLog.user_id == user_id).first()
        if log:
            log.status = True
        else:
            log = models.HabitLog(habit_id=habit.id, date=parsed_date, status=True, user_id=user_id)
            db.add(log)
        db.commit()
        return f"✅ Marked '{habit.title}' as done for {parsed_date.isoformat()}."

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
    def add_task(task_text: str, due_date: str = None) -> str:
        """Add a new one-time task for the user. Generates a semantic embedding for future search.
        Optionally accepts a due_date (YYYY-MM-DD HH:MM:SS format)."""
        vector = embed_model.encode(task_text).tolist()
        
        if due_date:
            try:
                parsed_due = datetime.fromisoformat(due_date)
            except Exception:
                parsed_due = datetime.now()
        else:
            parsed_due = datetime.now()
            
        new_task = models.Task(title=task_text, user_id=user_id, embedding=vector, due_date=parsed_due)
        db.add(new_task)
        db.commit()
        return f"✅ Added task: '{task_text}'"

    @tool
    def reschedule_task(task_title: str, new_due_date: str) -> str:
        """Reschedule a task to a new due date (YYYY-MM-DD HH:MM:SS format)."""
        task = db.query(models.Task).filter(models.Task.title.ilike(f"%{task_title}%"), models.Task.user_id == user_id).first()
        if not task:
            return f"⚠️ No task found matching '{task_title}'."
        try:
            parsed_due = datetime.fromisoformat(new_due_date)
            task.due_date = parsed_due
            db.commit()
            return f"✅ Rescheduled task '{task.title}' to {new_due_date}."
        except:
            return "⚠️ Invalid date format. Please use YYYY-MM-DDTHH:MM:SS."

    @tool
    def mark_task_done(title: str) -> str:
        """Checks off a pending task."""
        task = db.query(models.Task).filter(models.Task.title.ilike(f"%{title}%"), models.Task.user_id == user_id).first()
        if not task:
            return f"⚠️ No task found matching '{title}'."
        task.is_completed = True
        db.commit()
        return f"✅ Marked task '{task.title}' as done."

    @tool
    def delete_all_tasks() -> str:
        """Bulk deletes every task."""
        tasks = db.query(models.Task).filter(models.Task.user_id == user_id).all()
        count = len(tasks)
        for t in tasks:
            db.delete(t)
        db.commit()
        return f"🗑️ Deleted all {count} tasks."

    @tool
    def search_past_tasks(query: str) -> str:
        """Semantic vector search to find past or existing tasks using natural language."""
        query_vector = embed_model.encode(query).tolist()
        results = db.query(models.Task).filter(models.Task.user_id == user_id, models.Task.embedding.isnot(None)).order_by(models.Task.embedding.cosine_distance(query_vector)).limit(5).all()
        if not results:
            return "No related tasks found."
        rows = [f"- {t.title} ({'✅ done' if t.is_completed else '⬜ pending'})" for t in results]
        return "\n".join(rows)

    @tool
    def get_daily_agenda() -> str:
        """Retrieves a combined list of all pending tasks and active habits for today."""
        pending_tasks = db.query(models.Task).filter(models.Task.user_id == user_id, models.Task.is_completed == False).all()
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
        logs_today = db.query(models.HabitLog).filter(models.HabitLog.user_id == user_id, models.HabitLog.date == today, models.HabitLog.status == True).all()
        if not logs_today:
            return "No habits logged yet today."
        completed = [str(log.habit_id) for log in logs_today]
        return f"Habit IDs completed today: {', '.join(completed)}."

    return [
        add_habit, delete_habit, edit_habit, get_habits, mark_habit_done, delete_all_habits,
        add_task, reschedule_task, mark_task_done, delete_all_tasks,
        search_past_tasks, get_daily_agenda, get_progress_report
    ]
