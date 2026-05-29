# 🧠 Tracker (FlowBoard / CogniPlan) Project Workflow

## 🌟 What is this project?
This project is an AI-powered Productivity Dashboard. It allows users to manage their daily habits and one-off tasks (to-dos) using a natural language chat interface. The backend API runs locally on your computer, while the AI's reasoning uses the Groq API and user data/authentication is securely handled by Supabase (PostgreSQL).

---

## 🛠️ The Tech Stack (What are we using?)

Here is the exact list of tools and models used in this project. You can mention these in an interview:

1. **Frontend (The User Interface):** **React** (loaded directly in the browser) with HTML, CSS, and JavaScript.
2. **Backend (The Server):** Python with **FastAPI**. It handles the logic and talks to the database.
3. **Database & Auth:** **Supabase (PostgreSQL)**. It manages user authentication (login/signup) and stores all tasks, habits, and user profiles in a cloud Postgres database. (We use **SQLAlchemy** in Python to talk to it).
4. **AI Framework:** **LangGraph** & **LangChain**. These create a "thinking loop" for the AI (called a ReAct agent) so it can decide which tools to use.
5. **LLM (The Brain):** **LLaMA 3.3 70B** (accessed via the **Groq API**). This is the large language model that understands the user's chat messages.
6. **Embedding Model:** **`all-mpnet-base-v2`** (via the **SentenceTransformers** library). This model converts text into numbers (vectors) so the AI can search through past tasks by their "meaning" rather than just exact word matches.

---

### 💡 Interview Tip: LangChain vs. LangGraph
If an interviewer asks, *"Are you using only LangGraph or both, and can you remove LangChain?"*, you should explain that they are two halves of the same ecosystem and **must be used together**:
- **LangChain (The Engine):** You use it to connect to the Groq API, format chat messages, and define your custom Python tools (like `add_todo`). 
- **LangGraph (The Driver):** You use it to build the actual "Reason + Act" loop. It controls the flow, tells the AI when to think, when to trigger a tool, and when to return the final answer.
Because LangGraph relies on LangChain's building blocks to function, you cannot remove LangChain without breaking LangGraph.


### Example: The user types, *"Remind me to prep for my interview tomorrow"*

**Step 1: The User Sends a Message (Frontend)**
- The user types their request in the chatbox on the screen.
- The frontend sends this text to the FastAPI backend (`/api/chat`).

**Step 2: The AI Starts Thinking (LangGraph ReAct Agent)**
- The backend gives the message to **LangGraph**.
- The **LLaMA 3.3** model (via Groq) looks at the message, realizes the user wants to add a task, and decides to use a specific tool called `add_todo`.

**Step 3: Creating the Vector Embedding (AI Magic)**
- Before saving the task, the backend uses the **SentenceTransformer** (`all-mpnet-base-v2` model) to turn the text *"prep for my interview tomorrow"* into a mathematical vector (a list of 768 numbers).
- This is called a "semantic embedding." It allows the AI to find this task later even if you search for related words (like *"practice questions"*) instead of exact matches.

**Step 4: Saving to Database (Supabase / PostgreSQL)**
- The backend saves the text of the task and its vector numbers into the **Supabase PostgreSQL database** using SQLAlchemy.

**Step 5: The Agent Answers**
- LangGraph realizes the tool finished successfully. The LLaMA model creates a friendly text reply: *"I've added the interview prep to your to-do list!"*
- The backend also sends a hidden signal (like `refresh_todos`) back to the frontend to say something changed.

**Step 6: The Screen Updates (Frontend)**
- The frontend shows the AI's friendly reply in the chatbox.
- Because it received the hidden signal, the frontend automatically refreshes the to-do list on the dashboard, and the new task appears instantly!

