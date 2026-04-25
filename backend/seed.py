"""
Seed script — create fake data — run once to populate example habits and todos.
Usage (from project root):
    python -m backend.seed
"""
from datetime import date, timedelta
import random
from backend.database import SessionLocal, engine
from backend import models

models.Base.metadata.create_all(bind=engine)

HABITS = [
    {"title": "Morning Workout", "color_theme": "#6366f1"},
    {"title": "Read 20 Pages",   "color_theme": "#10b981"},
    {"title": "Meditate",        "color_theme": "#f59e0b"},
    {"title": "No Junk Food",    "color_theme": "#ef4444"},
    {"title": "Code 1 Hour",     "color_theme": "#3b82f6"},
]

TODOS = [
    "Review project architecture",
    "Write unit tests for analytics",
    "Design dark-mode color palette",
    "Set up GitHub repository",
    "Schedule weekly retrospective",
]

def seed():
    db = SessionLocal()
    try:
        # Skip if data already exists
        if db.query(models.Habit).count() > 0:
            print("Database already seeded. Skipping.")
            return

        # Create habits
        habit_objs = []
        for h in HABITS:
            habit = models.Habit(title=h["title"], color_theme=h["color_theme"])
            db.add(habit)
            habit_objs.append(habit)
        db.flush()   # get IDs before commit

        # Seed last 30 days of logs with realistic-looking data
        today = date.today()
        for habit in habit_objs:
            for offset in range(30):
                d = today - timedelta(days=offset)
                # ~70% completion rate to make rings look meaningful
                if random.random() < 0.70:
                    log = models.HabitLog(habit_id=habit.id, date=d, status=True)
                    db.add(log)

        # Create todos
        for i, t in enumerate(TODOS):
            todo = models.Todo(title=t, is_completed=(i % 3 == 0))
            db.add(todo)

        db.commit()
        print(f"✅ Seeded {len(HABITS)} habits and {len(TODOS)} todos successfully.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
