import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

# Load secrets from .env (GROQ_API_KEY, SUPABASE_JWT_SECRET, DATABASE_URL)
load_dotenv()

# Default to a local SQLite file.
# Set DATABASE_URL in your .env to switch to PostgreSQL in production.
DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./productivity.db")

# Some cloud providers (e.g. Heroku) return 'postgres://' instead of 'postgresql://'.
# SQLAlchemy 2.0 only accepts 'postgresql://', so we fix it here if needed.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Create the database engine.
# SQLite needs check_same_thread=False so FastAPI threads can share the connection.
# PostgreSQL uses pool_pre_ping=True to detect and recover dropped idle connections.
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

# Session factory — each API request gets its own isolated database session.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class that all ORM models (Todo, Habit, HabitLog) inherit from.
Base = declarative_base()


# FastAPI dependency injected into every route that needs the database.
# Opens a session before the request runs, closes it automatically afterward.
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()