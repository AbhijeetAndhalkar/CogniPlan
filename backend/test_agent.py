import sys
import os

sys.path.append(r"d:\Projects\Tracker\backend")

from agent import run_agent
from database import SessionLocal

db = SessionLocal()

try:
    response, action = run_agent(
        user_message="Remind me to buy groceries tomorrow at 5pm",
        user_id="test-user-id", # Fake UUID just for testing if it's hitting DB, it might crash but let's see. Wait, groq api key might be needed.
        db=db,
        history=[]
    )
    print("Success:", response)
except Exception as e:
    import traceback
    traceback.print_exc()
