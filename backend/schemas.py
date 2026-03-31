from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel


# ── Todo Schemas ──────────────────────────────────────────────────────────────

class TodoCreate(BaseModel):
    title: str


class TodoUpdate(BaseModel):
    is_completed: Optional[bool] = None
    title: Optional[str] = None


class TodoOut(BaseModel):
    id: int
    title: str
    is_completed: bool
    created_at: datetime

    model_config = {"from_attributes": True}

# Alias used by Phase 2 routes
TodoResponse = TodoOut


# ── Habit Schemas ─────────────────────────────────────────────────────────────

class HabitCreate(BaseModel):
    title: str
    frequency: str = "daily"
    color_theme: str = "#6366f1"


class HabitOut(BaseModel):
    id: int
    title: str
    frequency: str
    color_theme: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}

# Alias used by Phase 2 routes
HabitResponse = HabitOut


# ── Tracking Schemas ──────────────────────────────────────────────────────────

class ToggleHabitRequest(BaseModel):
    habit_id: int
    date: date


class ToggleHabitResponse(BaseModel):
    habit_id: int
    date: date
    status: bool


# ── Analytics Schemas ─────────────────────────────────────────────────────────

class HabitMatrixRow(BaseModel):
    id: int
    title: str
    color_theme: str
    logs: dict[str, bool]        # day-number (str) → completed bool
    streak: int
    completion_pct: float


class MatrixResponse(BaseModel):
    year: int
    month: int
    days: list[int]
    habits: list[HabitMatrixRow]
