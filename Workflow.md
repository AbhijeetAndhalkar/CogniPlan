# Project Workflow: 100% Local Document Q&A AI

This document explains exactly how our Local Document Q&A AI works from start to finish. It is written in simple language so you can easily understand the process and explain it during an interview.

---

## 🛠️ The Tech Stack (What we are using)

To make this project work, we use a combination of tools that act as different parts of a machine:

1. **Frontend (The User Interface)**: This is what the user sees. It's built with HTML, CSS, and JavaScript. It provides a simple webpage where users can upload a PDF and type their questions.
2. **Backend (The Brain/Bridge)**: We use **FastAPI** (a Python framework). It receives the PDF from the frontend, processes it, and sends the final answer back to the user.
3. **The LLM (Large Language Model)**: We use **Ollama** running the **Phi-3** model. Phi-3 is a smart but lightweight AI created by Microsoft that can run locally on your computer without needing the internet. It acts as the "speaker" that reads the text and answers the questions.
4. **Embeddings Model**: An AI model used to convert text into numbers (vectors) so the computer can understand the *meaning* of sentences.
5. **Vector Database**: A special type of database used to store those numbers (embeddings) so we can search through them instantly.

---

## 📖 Real-World Example: What happens when you insert a PDF?

Imagine you have a 50-page PDF about "The Rules of Chess." You upload it to the app and ask: *"How does the Knight move?"*

Here is the exact step-by-step workflow of what happens behind the scenes:

### Step 1: Uploading and Reading (Text Extraction)
When you insert the PDF, the frontend sends the file to the FastAPI backend. The backend uses a library to read all 50 pages and extract the raw text out of the document.

### Step 2: Chunking (Breaking it down)
The AI model (Phi-3) cannot read a 50-page book all at once—it has a limited "memory" (called context window). 
To solve this, the backend chops the 50 pages of text into smaller, manageable paragraphs called **"chunks."** 
*(Think of it like cutting a long book into individual flashcards).*

### Step 3: Creating Embeddings (Turning words into meaning)
Computers are bad at understanding words, but great at math. The system takes every single "chunk" (flashcard) and passes it through an **Embedding Model**. 
This model turns the text into a long list of numbers (a vector). These numbers represent the *actual meaning* of the text. So, sentences about "horses" and "knights" will have numbers that look mathematically similar.

### Step 4: Storage (The Vector Database)
All these chunks and their mathematical numbers are saved into a **Vector Database**. Now the PDF is fully processed and ready for questions!

---

## ❓ What happens when you ask a question?

Now you type the question: *"How does the Knight move?"*

### Step 5: Converting the Question
Just like we did with the PDF, the backend takes your question and passes it through the Embedding Model to turn your question into a list of numbers.

### Step 6: Similarity Search (Finding the needle in the haystack)
The Vector Database performs a lightning-fast mathematical comparison. It compares the numbers of your question against the numbers of all the PDF chunks. 
It finds the top 3 or 4 chunks that are the closest match. In this case, it finds the exact paragraph explaining that the Knight moves in an "L-shape."

### Step 7: Generating the Answer (The AI steps in)
The backend takes your original question AND the 3 matching text chunks it just found, and sends them both to the **Phi-3 AI model via Ollama**. 
It essentially tells the AI: 
*"Here is a user's question, and here are a few paragraphs from a book. Please read these paragraphs and answer the user's question."*

### Step 8: Delivering the Result
Phi-3 reads the context, generates a conversational, human-like answer (*"The Knight moves in an L-shape: two squares in one direction and then one square over..."*), and the backend sends this answer back to the frontend for you to see.

---

## 🎯 Summary for an Interview
If an interviewer asks how the system works, you can say:
> *"My project uses a Retrieval-Augmented Generation (RAG) architecture. When a user uploads a PDF, the text is extracted, split into chunks, converted into vector embeddings, and stored in a vector database. When the user asks a question, the system converts the question into an embedding, performs a similarity search to retrieve the most relevant document chunks, and passes that context to a local LLM (Ollama running Phi-3) to generate an accurate, hallucination-free answer."*
