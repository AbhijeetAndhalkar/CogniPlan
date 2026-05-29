/*
  CogniPlan — Full React Conversion
  All original features preserved:
  - Supabase Auth (login/signup/logout/forgot password)
  - Habit Matrix (grid, toggle cells, delete habits, month nav)
  - Progress Rings (Chart.js doughnut)
  - Todos (add/toggle/delete, floating widget toggle)
  - AI Co-Pilot Chat (floating widget toggle, suggestion chips, markdown)
  - Profile modal
  - Toast notifications

  External dependencies loaded via CDN (in index.html):
    - @supabase/supabase-js@2
    - chart.js@4
    - marked (for markdown in chat)
  These are already in your original index.html.
*/

const { useState, useEffect, useRef, useCallback } = React;

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://ftzaiphsficsylkntqjw.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0emFpcGhzZmljc3lsa250cWp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4Mzc3MTksImV4cCI6MjA5MDQxMzcxOX0.nK7gwwcQeKQKwlGCS0uxjBhMW12wFIPMaPBU_Mv19yQ";

// ─── DYNAMIC API BASE URL ──────────────────────────────────────────────────────
// Stored in localStorage so the choice survives a page refresh.
// 'local'  → http://localhost:8000  (backend running on this machine)
// 'prod'   → Render cloud backend
const API_URLS = {
  local: "http://localhost:8000",
  prod:  "https://cogniplan-siaf.onrender.com",
};
function getApiBaseUrl() {
  const env = localStorage.getItem("cogniplan_env") || "local";
  return API_URLS[env] || API_URLS.local;
}

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const COLOR_SWATCHES = [
  "#6366f1","#10b981","#f59e0b","#ef4444",
  "#3b82f6","#a855f7","#ec4899","#14b8a6",
];

// ─── SUPABASE CLIENT (singleton from CDN global) ────────────────────────────
let _supabase = null;
function getSupabase() {
  if (!_supabase && window.supabase) {
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return _supabase;
}

// ─── API HELPER ────────────────────────────────────────────────────────────────
// Reads getApiBaseUrl() at call time so switching env takes effect immediately.
async function api(method, endpoint, body = null) {
  const token = localStorage.getItem("flowboard_auth_token");
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(`${getApiBaseUrl()}${endpoint}`, options);
  if (!response.ok) {
    const err = new Error(`API Error: ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return response.json();
}

// ─── ENV TOGGLE COMPONENT ──────────────────────────────────────────────────────
function EnvToggle() {
  const [env, setEnv] = useState(localStorage.getItem("cogniplan_env") || "local");

  const toggle = () => {
    const next = env === "local" ? "prod" : "local";
    localStorage.setItem("cogniplan_env", next);
    setEnv(next);
  };

  const isLocal = env === "local";
  return (
    <button
      id="env-toggle-btn"
      title={isLocal ? "Using local backend (localhost:8000) — click to switch to Render" : "Using Render cloud backend — click to switch to localhost"}
      onClick={toggle}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "4px 10px", borderRadius: 20, border: "1.5px solid",
        borderColor: isLocal ? "#10b981" : "#6366f1",
        background: isLocal ? "rgba(16,185,129,0.12)" : "rgba(99,102,241,0.12)",
        color: isLocal ? "#10b981" : "#a5b4fc",
        fontSize: 11, fontWeight: 700, cursor: "pointer",
        letterSpacing: "0.04em", transition: "all 0.2s",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{
        width: 7, height: 7, borderRadius: "50%",
        background: isLocal ? "#10b981" : "#6366f1",
        display: "inline-block",
        boxShadow: isLocal ? "0 0 6px #10b981" : "0 0 6px #6366f1",
      }} />
      {isLocal ? "LOCAL" : "PROD"}
    </button>
  );
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

function padDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function escHtml(str) {
  return str.replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════════════════════
function Toast({ message }) {
  return (
    <div
      id="toast"
      className="toast"
      role="status"
      aria-live="polite"
      style={message ? { opacity: 1, transform: "translateY(0)" } : {}}
    >
      {message}
    </div>
  );
}

function useToast() {
  const [msg, setMsg] = useState("");
  const timerRef = useRef(null);
  const showToast = useCallback((text, duration = 2200) => {
    setMsg(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMsg(""), duration);
  }, []);
  return [msg, showToast];
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════
function AuthOverlay({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return setError("Please enter both email and password.");
    setError("");
    const sb = getSupabase();
    const { data, error: err } = await sb.auth.signInWithPassword({ email, password });
    if (err) return setError(err.message);
    const token = data.session.access_token;
    localStorage.setItem("flowboard_auth_token", token);
    onLogin(token);
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    const sb = getSupabase();
    const { error: err } = await sb.auth.signUp({ email, password });
    if (err) setError(err.message);
    else alert("Success! Check your email for the confirmation link!");
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    if (!email) return setError("Enter your email first.");
    const sb = getSupabase();
    const { error: err } = await sb.auth.resetPasswordForEmail(email);
    if (err) setError(err.message);
    else setError("✅ Password reset email sent!");
  };

  return (
    <div className="auth-overlay" id="auth-overlay">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-brand">
            <span className="auth-brand-icon">⚡</span>
            <span className="auth-brand-name">CogniPlan</span>
          </div>
          <h2 id="auth-title">Welcome back</h2>
          <p id="auth-subtitle">Enter your details to access your dashboard.</p>
        </div>
        <form id="auth-form" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              type="email" id="email" placeholder="hello@example.com" required
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <input
              type="password" id="password" placeholder="••••••••" required
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="auth-footer" style={{ textAlign: "right", marginTop: 5 }}>
            <a href="#" id="forgot-password-link"
              style={{ color: "#6366f1", fontSize: 13, textDecoration: "none", fontWeight: 600 }}
              onClick={handleForgot}>
              Forgot Password?
            </a>
          </div>
          {error && <div className="auth-error" style={{ display: "block" }}>{error}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button id="login-btn" type="button" className="btn-primary btn-full btn-auth"
              style={{ flex: 1 }} onClick={handleLogin}>Sign In</button>
            <button id="signup-btn" type="button" className="btn-primary btn-full btn-auth"
              style={{ flex: 1, background: "#2a2f45", color: "#cbd5e1", boxShadow: "none" }}
              onClick={handleSignup}>Sign Up</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function ProfileModal({ onClose, showToast }) {
  const [form, setForm] = useState({ name: "", age: "", goal: "", bio: "", about: "" });

  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (profile) {
        setForm({
          name: profile.full_name || "",
          age: profile.age || "",
          goal: profile.target_goal || "",
          bio: profile.bio || "",
          about: profile.about || "",
        });
      }
    })();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const sb = getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    const profileData = {
      id: user.id,
      full_name: form.name,
      age: parseInt(form.age) || null,
      bio: form.bio,
      target_goal: form.goal,
      about: form.about,
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from("profiles").upsert(profileData);
    if (!error) { showToast("✅ Profile updated"); onClose(); }
    else showToast("⚠️ Could not update profile: " + error.message);
  };

  const handleLogout = async () => {
    const sb = getSupabase();
    await sb.auth.signOut();
    localStorage.removeItem("flowboard_auth_token");
    window.location.reload();
  };

  return (
    <div id="profile-modal" className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card">
        <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
        <h2 className="modal-title">Your Profile</h2>
        <form id="profile-form" onSubmit={handleSubmit}>
          {[
            { label: "Full Name", id: "name", type: "text" },
            { label: "Age", id: "age", type: "number" },
            { label: "Target Goal", id: "goal", type: "text" },
            { label: "Bio", id: "bio", type: "text" },
          ].map(({ label, id, type }) => (
            <div key={id}>
              <label className="form-label" style={{ marginTop: id !== "name" ? "1rem" : 0, display: "block" }}>{label}</label>
              <input type={type} className="form-input" style={{ width: "100%" }}
                value={form[id]} onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))} />
            </div>
          ))}
          <label className="form-label" style={{ marginTop: "1rem", display: "block" }}>About</label>
          <textarea className="form-input" rows="3" style={{ width: "100%", resize: "vertical" }}
            value={form.about} onChange={(e) => setForm((f) => ({ ...f, about: e.target.value }))} />
          <button type="submit" className="btn-primary btn-full" style={{ marginTop: "1.5rem" }}>Save Profile</button>
        </form>
        <button id="btn-logout" className="btn-full" onClick={handleLogout}
          style={{ marginTop: "1rem", background: "#ef4444", color: "#fff", border: "none", borderRadius: 12, cursor: "pointer", fontWeight: 600, padding: ".75rem 1.1rem", fontSize: ".9rem" }}>
          Log Out
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADD HABIT MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function HabitModal({ onClose, onCreated, showToast }) {
  const [title, setTitle] = useState("");
  const [color, setColor] = useState("#6366f1");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title) return;
    try {
      await api("POST", "/habits/", { title, color_theme: color });
      showToast("✅ Habit created!");
      onCreated();
      onClose();
      setTitle(""); setColor("#6366f1");
    } catch {
      showToast("⚠️ Failed to create habit");
    }
  };

  return (
    <div id="habit-modal" className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-card">
        <button id="modal-close" className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
        <h2 id="modal-title" className="modal-title">New Habit</h2>
        <form id="habit-form" className="habit-form" autoComplete="off" onSubmit={handleSubmit}>
          <label className="form-label" htmlFor="habit-title-input">Habit Name</label>
          <input id="habit-title-input" type="text" className="form-input"
            placeholder="e.g. Morning Workout" required maxLength={60}
            value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="form-label">Theme Color</label>
          <div className="color-picker-row">
            <div className="color-swatches">
              {COLOR_SWATCHES.map((c) => (
                <label key={c} className="swatch-label">
                  <input type="radio" name="color" value={c} className="hidden-radio"
                    checked={color === c} onChange={() => setColor(c)} />
                  <div className="swatch" style={{ background: c, outline: color === c ? `2px solid ${c}` : "none", outlineOffset: 2 }} />
                </label>
              ))}
            </div>
          </div>
          <button type="submit" className="btn-primary btn-full">Create Habit</button>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESS RINGS (Chart.js)
// ═══════════════════════════════════════════════════════════════════════════════
function RingCard({ habit }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !window.Chart) return;
    const ctx = canvasRef.current.getContext("2d");
    if (chartRef.current) {
      chartRef.current.data.datasets[0].data = [habit.completion_pct, 100 - habit.completion_pct];
      chartRef.current.update("active");
    } else {
      chartRef.current = new window.Chart(ctx, {
        type: "doughnut",
        data: {
          datasets: [{
            data: [habit.completion_pct, 100 - habit.completion_pct],
            backgroundColor: [habit.color_theme, "rgba(255,255,255,0.05)"],
            borderWidth: 0, borderRadius: 4,
          }],
        },
        options: {
          cutout: "72%",
          animation: { duration: 600, easing: "easeInOutQuart" },
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          responsive: false,
        },
      });
    }
    return () => {};
  }, [habit.completion_pct, habit.color_theme]);

  useEffect(() => {
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, []);

  return (
    <div className="ring-card">
      <div className="ring-canvas-wrap">
        <canvas ref={canvasRef} width="80" height="80" />
        <div className="ring-pct">{Math.round(habit.completion_pct)}%</div>
      </div>
      <div className="ring-label" title={habit.title}>{habit.title}</div>
      <div className="ring-streak">🔥 {habit.streak}</div>
    </div>
  );
}

function ProgressRings({ habits }) {
  if (!habits.length) {
    return (
      <p style={{ color: "var(--text-muted)", fontSize: ".82rem", textAlign: "center", padding: "1rem" }}>
        Add habits to see rings
      </p>
    );
  }
  return (
    <div id="rings-container" className="rings-grid">
      {habits.map((h) => <RingCard key={h.id} habit={h} />)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HABIT GRID
// ═══════════════════════════════════════════════════════════════════════════════
function HabitGrid({ data, currentYear, currentMonth, onRefresh, showToast }) {
  if (!data) {
    return (
      <div className="grid-loading" id="grid-loading">
        <div className="spinner" />
        <span>Loading habits…</span>
      </div>
    );
  }
  if (!data.habits.length) {
    return (
      <div id="grid-empty" className="empty-state">
        <div className="empty-icon">🌱</div>
        <p>No habits yet. Add one to get started!</p>
      </div>
    );
  }

  const { habits, days, today } = data;

  // BUG 1+3+9 fix: onCellClick no longer calls the API.
  // CellButton owns the full toggle lifecycle (optimistic + API + rollback).
  // This function only triggers a quiet ring refresh.
  const onCellClick = (habitId, dateStr, color, isDone) => {
    onRefresh(true); // quiet refresh for rings
  };

  const onDeleteHabit = async (habitId) => {
    if (!confirm("Permanently delete this habit?")) return;
    try {
      await api("DELETE", `/habits/${habitId}`);
      showToast("Habit deleted");
      onRefresh(false);
    } catch {
      showToast("⚠️ Could not delete habit");
    }
  };

  return (
    <div id="habit-grid-container">
      <table className="habit-table">
        <thead>
          <tr className="day-header-row">
            <th style={{ minWidth: 150, position: "sticky", left: 0, zIndex: 12, backgroundColor: "#0f0f1e" }} />
            {days.map((d) => (
              <th key={d} className={d === today ? "today-header" : ""}>{d}</th>
            ))}
            <th title="Current streak" style={{ paddingLeft: 8 }}>🔥</th>
          </tr>
        </thead>
        <tbody>
          {habits.map((habit) => (
            <tr key={habit.id} className="habit-row" data-habit-id={habit.id}>
              <td className="habit-label-cell"
                style={{ position: "sticky", left: 0, zIndex: 11, backgroundColor: "#0f0f1e", boxShadow: "2px 0 5px rgba(0,0,0,0.3)" }}>
                <div className="habit-label-inner">
                  <span className="habit-dot" style={{ background: habit.color_theme }} />
                  <span className="habit-name" title={habit.title}>{habit.title}</span>
                  <button className="habit-delete-btn" title="Delete habit"
                    onClick={(e) => { e.stopPropagation(); onDeleteHabit(habit.id); }}>✕</button>
                </div>
              </td>
              {days.map((d) => {
                const isFuture = today !== null && d > today;
                const isDone = habit.logs[String(d)] === true;
                const dateStr = padDate(currentYear, currentMonth, d);
                return (
                  <td key={d} className={`habit-cell${d === today ? " today-col" : ""}`}>
                    <CellButton
                      habitId={habit.id} dateStr={dateStr} color={habit.color_theme}
                      isDone={isDone} isFuture={isFuture} habitTitle={habit.title} day={d}
                      onCellClick={onCellClick} showToast={showToast}
                    />
                  </td>
                );
              })}
              <td style={{ textAlign: "center", paddingLeft: 8 }}>
                <span style={{ fontSize: ".78rem", fontWeight: 700, color: "#f59e0b" }}>{habit.streak}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// BUG 1+3 fix: CellButton is the single owner of the toggle API call.
// On success it calls onCellClick (which only triggers onRefresh).
// On failure it reverts local state and shows a toast.
function CellButton({ habitId, dateStr, color, isDone: initialDone, isFuture, habitTitle, day, onCellClick, showToast }) {
  const [done, setDone] = useState(initialDone);

  useEffect(() => { setDone(initialDone); }, [initialDone]);

  const handleClick = async () => {
    if (isFuture) return;
    const prev = done;
    setDone(!done);
    try {
      await api("POST", `/track/?habit_id=${habitId}&log_date=${dateStr}`);
      onCellClick(habitId, dateStr, color, !done); // BUG 9 fix: removed dead btnEl arg
    } catch {
      setDone(prev);
      showToast("⚠️ Toggle failed"); // now reachable — toast shown here instead of dead code in HabitGrid
    }
  };

  return (
    <button
      className={`cell-btn${done ? " done" : ""}${isFuture ? " future" : ""}`}
      style={{ color: done ? color : "transparent" }}
      aria-label={`${habitTitle} on day ${day}`}
      onClick={handleClick}
      disabled={isFuture}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TODO WIDGET
// ═══════════════════════════════════════════════════════════════════════════════
function TodoWindow({ isOpen, onClose, showToast }) {
  const [todos, setTodos] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const loadTodos = useCallback(async () => {
    const token = localStorage.getItem("flowboard_auth_token");
    if (!token) return;
    try {
      const data = await api("GET", "/todos/");
      setTodos(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { loadTodos(); }, [loadTodos]);

  // Expose loadTodos globally for AI chat refresh
  useEffect(() => { window.__loadTodos = loadTodos; }, [loadTodos]);

  const handleAdd = async () => {
    const title = input.trim();
    if (!title) return;
    try {
      await api("POST", "/todos/", { title });
      setInput("");
      showToast("✅ Task added");
      loadTodos();
    } catch {
      showToast("⚠️ Failed to add task");
    }
  };

  const handleToggle = async (id) => {
    setTodos((prev) => prev.map((t) => t.id === id ? { ...t, is_completed: !t.is_completed } : t));
    try {
      await api("PUT", `/todos/${id}/toggle`);
      loadTodos();
    } catch {
      loadTodos();
      showToast("⚠️ Could not update todo");
    }
  };

  const handleDelete = async (id) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try {
      await api("DELETE", `/todos/${id}`);
      loadTodos();
    } catch {
      loadTodos();
      showToast("⚠️ Could not delete todo");
    }
  };

  const pending = todos.filter((t) => !t.is_completed);
  const sorted = [...todos].sort((a, b) => a.is_completed - b.is_completed);

  return (
    <div id="todo-window" className={`todo-window panel panel-todos${isOpen ? " open" : ""}`}>
      <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <h2 className="panel-title">Todos</h2>
          <span id="todo-count" className="todo-count-badge">{pending.length || ""}</span>
        </div>
        <button id="todo-close-btn" style={{ background: "none", border: "none", color: "#64748b", fontSize: 16, cursor: "pointer" }}
          onClick={onClose}>✖</button>
      </div>
      <form id="todo-form" className="todo-add-form" autoComplete="off" onSubmit={(e) => { e.preventDefault(); handleAdd(); }}>
        <input id="todo-input" type="text" className="todo-input" placeholder="Add a new task…" maxLength={120}
          value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
        <button type="button" id="btn-add-todo" className="btn-add-todo" aria-label="Add todo" onClick={handleAdd}>+</button>
      </form>
      {sorted.length === 0 ? (
        <div id="todo-empty" className="empty-state">
          <div className="empty-icon">✅</div>
          <p>All tasks completed!</p>
        </div>
      ) : (
        <ul id="todo-list" className="todo-list" role="list">
          {sorted.map((todo) => (
            <li key={todo.id} className={`todo-item${todo.is_completed ? " completed" : ""}`}
              onClick={() => handleToggle(todo.id)}>
              <div className="todo-checkbox" aria-hidden="true" />
              <span className="todo-text" dangerouslySetInnerHTML={{ __html: escHtml(todo.title) }} />
              <button className="todo-del-btn" title="Delete"
                onClick={(e) => { e.stopPropagation(); handleDelete(todo.id); }}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI CHAT WIDGET
// ═══════════════════════════════════════════════════════════════════════════════
const CHIPS = [
  "What are my habits for today?",
  "Add a new task to buy groceries",
  "I just completed the Gym",
];

function ChatWindow({ isOpen, onClose, onRefreshHabits }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [showHome, setShowHome] = useState(true);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const appendMessage = (sender, text) => {
    setMessages((prev) => [...prev, { sender, text, id: Date.now() + Math.random() }]);
    setShowHome(false);
  };

  const sendMessage = async (text) => {
    if (!text.trim()) return;
    setShowHome(false);
    appendMessage("user", text);
    setInput("");
    const loadingId = "loading-" + Date.now();
    setMessages((prev) => [...prev, { sender: "ai", text: "...", id: loadingId, loading: true }]);
    try {
      const data = await api("POST", "/api/chat", { message: text });
      setMessages((prev) => prev.filter((m) => m.id !== loadingId));
      appendMessage("ai", data.response);
      if (data.action_taken === "refresh_habits" || data.action_taken === "refresh_all") onRefreshHabits();
      if ((data.action_taken === "refresh_todos" || data.action_taken === "refresh_all") && window.__loadTodos) window.__loadTodos();
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== loadingId));
      appendMessage("ai", "❌ Error connecting to AI. Is the server awake?");
    }
  };

  const handleChip = (chip) => {
    setInput(chip);
    sendMessage(chip);
  };

  // Mic (speech recognition)
  const handleMic = () => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-US"; rec.interimResults = false;
    rec.onresult = (e) => { const t = e.results[0][0].transcript; setInput(t); sendMessage(t); };
    rec.start();
  };

  return (
    <div id="chat-window" className={`chat-window${isOpen ? " open" : ""}`}
      style={{ display: isOpen ? "flex" : "none" }}
      onClick={(e) => e.stopPropagation()}>
      <div className="chat-header">
        <div className="header-info">
          <strong>AI Co-Pilot</strong>
          <span>Always active</span>
        </div>
        <button id="chat-close-btn" title="Close chat" onClick={onClose}>✖</button>
      </div>
      <div id="chat-messages" className="chat-messages">
        {showHome && (
          <div id="chat-home-view" className="chat-home-view">
            <p>👋 Hello! I'm your productivity agent. How can I help?</p>
            <div className="suggestion-chips">
              {CHIPS.map((c) => (
                <button key={c} className="chip" onClick={() => handleChip(c)}>{c}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.sender === "user" ? "msg-user" : "msg-ai"}
            {...(m.sender === "ai" && typeof window.marked !== "undefined"
              ? { dangerouslySetInnerHTML: { __html: window.marked.parse(m.text) } }
              : { children: m.text })}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input-area">
        <input type="text" id="chat-input" placeholder="Type a command..." autoComplete="off"
          value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage(input)} />
        <button id="mic-btn" title="Click to speak" onClick={handleMic}>🎤</button>
        <button id="send-btn" title="Send message" onClick={() => sendMessage(input)}>➤</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
function App() {
  const [authed, setAuthed] = useState(false);
  const [matrixData, setMatrixData] = useState(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixLoadMsg, setMatrixLoadMsg] = useState("Loading habits…");
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [toastMsg, showToast] = useToast();
  const [showHabitModal, setShowHabitModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isTodoOpen, setIsTodoOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [profileInitial, setProfileInitial] = useState("");
  const matrixScrollRef = useRef(null);

  // ── Auth state listener ───────────────────────────────────────────────────────
  // onAuthStateChange fires on page load with the current session state.
  // If the refresh token is invalid/expired, Supabase emits SIGNED_OUT so we
  // clear storage and drop back to the login screen — no red error bar.
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      // Supabase CDN not ready yet — fall back to the JWT check
      const token = localStorage.getItem("flowboard_auth_token");
      if (token && !isTokenExpired(token)) {
        setAuthed(true);
        loadProfileInitial();
      } else if (token) {
        localStorage.removeItem("flowboard_auth_token");
      }
      return;
    }

    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        const token = session?.access_token;
        if (token) {
          localStorage.setItem("flowboard_auth_token", token);
          setAuthed(true);
          loadProfileInitial();
        }
      } else if (event === "SIGNED_OUT" || event === "USER_DELETED") {
        // Refresh token invalid or user signed out — clear everything and show login
        localStorage.removeItem("flowboard_auth_token");
        setAuthed(false);
        setMatrixData(null);
        setProfileInitial("");
      } else if (event === "INITIAL_SESSION") {
        if (session?.access_token) {
          localStorage.setItem("flowboard_auth_token", session.access_token);
          setAuthed(true);
          loadProfileInitial();
        } else {
          // No valid session — clear any stale token
          localStorage.removeItem("flowboard_auth_token");
          setAuthed(false);
        }
      }
    });

    return () => subscription?.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProfileInitial = async () => {
    const sb = getSupabase();
    if (!sb) return;
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data: profile } = await sb.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      if (profile?.full_name) setProfileInitial(profile.full_name.charAt(0).toUpperCase());
    } catch (e) {
      // Silently ignore — profile initial is cosmetic
      console.warn("Could not load profile initial:", e.message);
    }
  };

  // BUG 7 fix: wrap in useCallback so the function identity is stable.
  // currentYear/currentMonth are in deps so the function always uses fresh values.
  const loadMatrix = useCallback(async (maxRetries = 12) => {
    const token = localStorage.getItem("flowboard_auth_token");
    if (!token) return;
    setMatrixLoading(true);
    setMatrixData(null);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      setMatrixLoadMsg(`Waking up the cloud… Attempt ${attempt} of ${maxRetries}`);
      try {
        const data = await api("GET", `/analytics/matrix?year=${currentYear}&month=${currentMonth}`);
        setMatrixData(data);
        setMatrixLoading(false);
        return;
      } catch (e) {
        if (e.status === 401 || e.status === 403) {
          setAuthed(false);
          setMatrixLoading(false);
          return;
        }
        if (e.status === 502 || e.status === 503 || e.message?.includes("Failed to fetch")) {
          await delay(5000);
        } else {
          setMatrixLoadMsg("❌ Error loading data.");
          setMatrixLoading(false);
          return;
        }
      }
    }
    setMatrixLoadMsg("❌ Connection failed. Please refresh.");
    setMatrixLoading(false);
  }, [currentYear, currentMonth]);

  const refreshRingsQuiet = useCallback(async () => {
    try {
      const data = await api("GET", `/analytics/matrix?year=${currentYear}&month=${currentMonth}`);
      setMatrixData(data);
    } catch (_) {}
  }, [currentYear, currentMonth]);

  // Load matrix whenever authed / month changes
  // BUG 7 fix: loadMatrix is now stable (useCallback) so it's safe to include in deps.
  useEffect(() => {
    if (authed) loadMatrix();
  }, [authed, currentYear, currentMonth, loadMatrix]);

  // Auto-scroll the habit matrix to the far right when data loads
  // so the current date column is immediately visible.
  useEffect(() => {
    if (matrixData && matrixScrollRef.current) {
      matrixScrollRef.current.scrollLeft = matrixScrollRef.current.scrollWidth;
    }
  }, [matrixData]);

  const handleLogin = (token) => {
    setAuthed(true);
    loadProfileInitial();
  };

  const handlePrevMonth = () => {
    setCurrentMonth((m) => {
      if (m === 1) { setCurrentYear((y) => y - 1); return 12; }
      return m - 1;
    });
  };
  const handleNextMonth = () => {
    setCurrentMonth((m) => {
      if (m === 12) { setCurrentYear((y) => y + 1); return 1; }
      return m + 1;
    });
  };

  // Close chat on outside click
  useEffect(() => {
    if (!isChatOpen) return;
    const handler = (e) => {
      const win = document.getElementById("chat-window");
      const btn = document.getElementById("chat-toggle-btn");
      if (win && !win.contains(e.target) && e.target !== btn) setIsChatOpen(false);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [isChatOpen]);

  const topStreak = matrixData ? matrixData.habits.reduce((m, h) => Math.max(m, h.streak), 0) : 0;

  return (
    <>
      {/* AUTH */}
      {!authed && <AuthOverlay onLogin={handleLogin} />}

      {/* HEADER */}
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-icon">⚡</span>
            <span className="brand-name">CogniPlan</span>
          </div>
          <div className="month-nav">
            <button id="btn-prev-month" className="nav-btn" aria-label="Previous month" onClick={handlePrevMonth}>‹</button>
            <h1 id="month-label" className="month-title">{MONTH_NAMES[currentMonth - 1]} {currentYear}</h1>
            <button id="btn-next-month" className="nav-btn" aria-label="Next month" onClick={handleNextMonth}>›</button>
          </div>
          <div className="header-actions">
            <EnvToggle />
            <button id="btn-add-habit" className="btn-primary" onClick={() => setShowHabitModal(true)}>+ Habit</button>
            <div className="streak-badge" id="top-streak-badge">🔥 <span id="top-streak">{topStreak}</span> day streak</div>
            {profileInitial && (
              <div id="profile-badge" className="profile-badge"
                onClick={() => setShowProfileModal(true)} style={{ cursor: "pointer" }}>
                <span id="profile-initial">{profileInitial}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <main className="dashboard">
        {/* LEFT: Habit Grid */}
        <section className="panel panel-grid" aria-label="Habit Grid">
          <div className="panel-header">
            <h2 className="panel-title">Habit Matrix</h2>
            <p className="panel-subtitle">Click any cell to toggle completion</p>
          </div>
          <div ref={matrixScrollRef} className="grid-wrapper" id="grid-wrapper">
            {matrixLoading ? (
              <div className="grid-loading" id="grid-loading">
                <div className="spinner" style={{ margin: "0 auto 12px" }} />
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <span style={{ fontWeight: 600, color: "#f8fafc", fontSize: 15 }}>Waking up the cloud...</span>
                  <span style={{ fontSize: 12.5, color: "#94a3b8" }}>{matrixLoadMsg}</span>
                </div>
              </div>
            ) : (
              <HabitGrid
                data={matrixData}
                currentYear={currentYear}
                currentMonth={currentMonth}
                onRefresh={(quiet) => quiet ? refreshRingsQuiet() : loadMatrix()}
                showToast={showToast}
              />
            )}
          </div>
        </section>

        {/* RIGHT: Analytics */}
        <aside className="sidebar">
          <section className="panel panel-analytics" aria-label="Progress Analytics">
            <div className="panel-header">
              <h2 className="panel-title">Progress Rings</h2>
              <p className="panel-subtitle">This month's completion</p>
            </div>
            <ProgressRings habits={matrixData ? matrixData.habits : []} />
          </section>
        </aside>
      </main>

      {/* MODALS */}
      {showHabitModal && (
        <HabitModal
          onClose={() => setShowHabitModal(false)}
          onCreated={() => loadMatrix()}
          showToast={showToast}
        />
      )}
      {showProfileModal && (
        <ProfileModal onClose={() => setShowProfileModal(false)} showToast={showToast} />
      )}

      {/* TODO FLOATING WIDGET */}
      <div className="todo-widget-container">
        <button id="todo-toggle-btn" title="Open Todos"
          onClick={() => setIsTodoOpen((o) => !o)}>
          <img src="./icons/icons8-notes-48.png" alt="Todos" width="28" height="28"
            draggable="false" style={{ pointerEvents: "none", borderRadius: 6 }} />
        </button>
      </div>
      <TodoWindow isOpen={isTodoOpen} onClose={() => setIsTodoOpen(false)} showToast={showToast} />

      {/* AI CHAT FLOATING WIDGET */}
      <div className="chat-widget-container">
        <button id="chat-toggle-btn" title="Open AI Co-Pilot"
          onClick={(e) => { e.stopPropagation(); setIsChatOpen((o) => !o); }}>
          <img src="./icons/icons8-ai.svg" alt="AI Co-Pilot" width="28" height="28"
            draggable="false" style={{ pointerEvents: "none", borderRadius: 6 }} />
        </button>
      </div>
      <ChatWindow
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        onRefreshHabits={() => loadMatrix()}
      />

      {/* TOAST */}
      <Toast message={toastMsg} />
    </>
  );
}

// Ensure App is globally accessible for the mounting script in index-react.html
window.App = App;
