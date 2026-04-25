from datetime import date, datetime
from typing import Optional
# BaseModel is the core of Pydantic. It automatically checks if the data types 
# (like strings or integers) match what you asked for.
from pydantic import BaseModel


# ── Todo Schemas ──────────────────────────────────────────────────────────────

# The "Create" schemas are for INCOMING data (Frontend -> Backend).
# When the user creates a Todo, they only need to provide a title. 
# The database will automatically handle the ID and the timestamp later.
class TodoCreate(BaseModel):
    title: str

# The "Update" schema uses 'Optional'. 
# This means the frontend can send just a new title, OR just a new status, 
# and it won't crash if it doesn't send both.
class TodoUpdate(BaseModel):
    is_completed: Optional[bool] = None
    title: Optional[str] = None

# The "Out" schemas are for OUTGOING data (Backend -> Frontend).
# When we send data back to React, we include everything: ID, title, status, and time.
class TodoOut(BaseModel):
    id: int
    title: str
    is_completed: bool
    created_at: datetime

    # This is a crucial FastAPI setting! 
    # It tells Pydantic to read data directly from SQLAlchemy database objects 
    # and convert them into JSON dictionaries automatically.
    model_config = {"from_attributes": True}

# We just create an alias here so it's easier to read in our main.py routes.
TodoResponse = TodoOut


# ── Habit Schemas ─────────────────────────────────────────────────────────────

# Just like Todos, this defines what we REQUIRE from the frontend to make a habit.
# We set default values ("daily" and "#6366f1") so if the frontend forgets to send them, 
# the app won't crash; it will just use these defaults.
class HabitCreate(BaseModel):
    title: str
    frequency: str = "daily"
    color_theme: str = "#6366f1"

# What we send back to the frontend when it asks for a list of habits.
class HabitOut(BaseModel):
    id: int
    title: str
    frequency: str
    color_theme: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}

HabitResponse = HabitOut


# ── Tracking Schemas ──────────────────────────────────────────────────────────

# When a user clicks a day on the calendar to log a habit, the frontend MUST send 
# exactly two things: the ID of the habit, and the date they clicked.
class ToggleHabitRequest(BaseModel):
    habit_id: int
    date: date

# What we send back to confirm the habit was toggled successfully.
class ToggleHabitResponse(BaseModel):
    habit_id: int
    date: date
    status: bool


# ── Analytics Schemas ─────────────────────────────────────────────────────────

# This is a complex schema. It dictates exactly how the data must be formatted 
# to draw those nice rings and streaks on your frontend dashboard.
class HabitMatrixRow(BaseModel):
    id: int
    title: str
    color_theme: str
    # A dictionary where the key is the day (string) and value is True/False
    logs: dict[str, bool]        
    streak: int
    completion_pct: float

# The final payload sent to the frontend for the whole month's analytics.
class MatrixResponse(BaseModel):
    year: int
    month: int
    days: list[int]
    habits: list[HabitMatrixRow]