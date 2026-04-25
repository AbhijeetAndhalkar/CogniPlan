import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from dotenv import load_dotenv

# 1. LOAD SECRETS
# This pulls in your hidden .env file so your database passwords aren't exposed in the code.
load_dotenv()

# 2. THE ENVIRONMENT ROUTER (Local vs. Production)
# This looks for a cloud database URL (like Supabase). 
# If it doesn't find one (because you are running it locally on your laptop), 
# it safely falls back to creating a local SQLite file.
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./sql_app.db")

# 3. THE "RENDER/SUPABASE FIX" (Crucial for Deployment)
# Older cloud providers give URLs starting with 'postgres://'.
# Modern SQLAlchemy will crash unless it says 'postgresql://'. 
# This line automatically fixes that typo if it exists.
if SQLALCHEMY_DATABASE_URL and SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

# 4. ENGINE CREATION (Building the Pipe)
if "sqlite" in SQLALCHEMY_DATABASE_URL:
    # SQLite doesn't like multiple FastAPI threads talking to it at once. 
    # 'check_same_thread: False' bypasses this rule safely for local testing.
    engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # THE CLOUD FIX: Cloud databases (like Supabase) sometimes drop idle connections.
    # 'pool_pre_ping=True' tells SQLAlchemy to "ping" the database to make sure 
    # it is awake before sending data, preventing random 500 Server Errors.
    engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)

# 5. SESSION FACTORY
# This creates the actual "Session" objects that our other files (like main.py) 
# use to add or delete data.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# This is the base template that all our tables in models.py will inherit from.
Base = declarative_base()

# 6. THE DEPENDENCY (The Valve)
# Whenever an API endpoint needs the database, it calls this function. 
# It opens the pipe (yield db), lets the endpoint do its work, 
# and then GUARANTEES the pipe is closed afterward (db.close()) so we don't leak memory.
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()