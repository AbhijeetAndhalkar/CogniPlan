import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("No DATABASE_URL found")
    exit(1)

engine = create_engine(DATABASE_URL)

queries = [
    "ALTER TABLE todos RENAME TO tasks;",
    "ALTER TABLE tasks ADD COLUMN due_date TIMESTAMP;",
]

for q in queries:
    with engine.connect() as conn:
        try:
            conn.execute(text(q))
            conn.commit()
            print(f"Success: {q}")
        except Exception as e:
            print(f"Failed: {q} - {e}")
