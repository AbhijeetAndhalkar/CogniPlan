/*
  CogniPlan — Full React Conversion
  All original features preserved:
  - Supabase Auth (login/signup/logout/forgot password)
  - Habit Matrix (grid, toggle cells, delete habits, month nav)
  - Progress Rings (Chart.js doughnut)
  - Tasks (add/toggle/delete, floating widget toggle)
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
function HabitModal({ onClose, onCreated, showToast, initialData = null }) {
  const [title, setTitle] = useState(initialData?.title || "");
  const [color, setColor] = useState(initialData?.color_theme || "#6366f1");
  const [description, setDescription] = useState(initialData?.description || "");
  const [reminderTime, setReminderTime] = useState(initialData?.reminder_time || "");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title) return;
    try {
      if (initialData) {
        await api("PUT", `/habits/${initialData.id}`, { title, color_theme: color, description, reminder_time: reminderTime });
        showToast("✅ Habit updated!");
      } else {
        await api("POST", "/habits/", { title, color_theme: color, description, reminder_time: reminderTime });
        showToast("✅ Habit created!");
      }
      onCreated();
      onClose();
    } catch {
      showToast(initialData ? "⚠️ Failed to update habit" : "⚠️ Failed to create habit");
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
          <label className="form-label" htmlFor="habit-desc-input">Description (Optional)</label>
          <input id="habit-desc-input" type="text" className="form-input"
            placeholder="e.g. 30 mins running" maxLength={120}
            value={description} onChange={(e) => setDescription(e.target.value)} />
          <label className="form-label" htmlFor="habit-reminder-input">Reminder Time (Optional)</label>
          <input id="habit-reminder-input" type="time" className="form-input"
            value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} />
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
          <button type="submit" className="btn-primary btn-full">{initialData ? "Save Changes" : "Create Habit"}</button>
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
function HabitGrid({ data, currentYear, currentMonth, onRefresh, showToast, onEditHabit }) {
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
                style={{ position: "sticky", left: 0, zIndex: 11, boxShadow: "2px 0 5px rgba(0,0,0,0.3)" }}>
                <div className="habit-label-inner">
                  <span className="habit-dot" style={{ background: habit.color_theme }} />
                  <span className="habit-name" title={habit.title}>{habit.title}</span>
                  <button className="habit-edit-btn" title="Edit habit"
                    style={{ background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', opacity: 0.6, fontSize: '0.9rem', padding: '0 4px', marginRight: 4 }}
                    onClick={(e) => { e.stopPropagation(); onEditHabit(habit); }}>✎</button>
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
      if ((data.action_taken === "refresh_tasks" || data.action_taken === "refresh_all") && window.__loadTasks) window.__loadTasks();
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
// TASK CALENDAR VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function TaskCalendarView({ currentYear, currentMonth, showToast }) {
  const [tasks, setTasks] = useState([]);
  const [habits, setHabits] = useState([]);
  // Default to today if current month/year matches, otherwise 1st of month
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    if (today.getFullYear() === currentYear && today.getMonth() + 1 === currentMonth) {
      return padDate(currentYear, currentMonth, today.getDate());
    }
    return padDate(currentYear, currentMonth, 1);
  });
  const [loading, setLoading] = useState(false);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        const data = await api("GET", "/api/analytics/sidebar");
        setAnalytics(data);
      } catch (e) {
        console.error("Analytics load failed", e);
      }
    };
    loadAnalytics();
  }, []);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api("GET", "/tasks/");
      setTasks(data);
    } catch (e) {
      showToast("⚠️ Could not load calendar tasks");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchTasks();
  }, [currentYear, currentMonth, fetchTasks]);

  useEffect(() => {
    window.__loadTasks = fetchTasks;
    return () => { delete window.__loadTasks; };
  }, [fetchTasks]);
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const firstDay = new Date(currentYear, currentMonth - 1, 1).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDay === 0 ? 6 : firstDay - 1 }, (_, i) => i); // Mon as first day

  const filteredTasks = tasks.filter((t) => {
    const due = t.due_date ? t.due_date.slice(0, 10) : null;
    const created = t.created_at ? t.created_at.slice(0, 10) : null;
    return due === selectedDate || (!due && created === selectedDate);
  });

  const fetchHabits = useCallback(async () => {
    try {
      const data = await api("GET", `/analytics/matrix?year=${currentYear}&month=${currentMonth}`);
      setHabits(data.habits || []);
    } catch (e) {
      console.error(e);
    }
  }, [currentYear, currentMonth]);

  useEffect(() => { fetchHabits(); }, [fetchHabits]);

  const toggleHabit = async (habitId, dateStr) => {
    setHabits(prev => prev.map(h => {
      if (h.id === habitId) {
        const currentLog = h.logs && h.logs[dateStr] === true;
        return { ...h, logs: { ...h.logs, [dateStr]: !currentLog } };
      }
      return h;
    }));
    
    try {
      await api("POST", `/track/?habit_id=${habitId}&log_date=${dateStr}`);
      showToast("✅ Habit logged");
    } catch (e) {
      showToast("⚠️ Update failed");
      fetchHabits(); // revert
    }
  };

  const handleToggle = async (id, currentStatus) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, is_completed: !currentStatus } : t));
    try {
      await api("PUT", `/tasks/${id}/toggle`);
      showToast("✅ Task updated");
    } catch {
      showToast("⚠️ Update failed");
      setTasks(prev => prev.map(t => t.id === id ? { ...t, is_completed: currentStatus } : t));
    }
  };

  return (
    <>
      <div className="task-calendar-view left-column">
        {/* Calendar Card */}
      <div className="panel calendar-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f1f5f9', margin: 0 }}>
            {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(currentYear, currentMonth - 1))}
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', textAlign: 'center', fontWeight: 700, color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '8px' }}>
          <div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div>
        </div>

        {loading ? <div className="spinner" style={{ margin: "40px auto", borderColor: '#e2e8f0', borderTopColor: '#6B4EFF' }} /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
            {blanks.map((_, i) => <div key={`blank-${i}`} />)}
            {days.map((d) => {
              const dateStr = padDate(currentYear, currentMonth, d);
              const isSelected = selectedDate === dateStr;
              const hasTask = tasks.some(t => (t.due_date && t.due_date.slice(0, 10) === dateStr) || (!t.due_date && t.created_at.slice(0, 10) === dateStr));
              
              return (
                <div key={d} onClick={() => setSelectedDate(dateStr)} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  height: '32px', width: '32px', margin: '0 auto',
                  background: isSelected ? '#8b5cf6' : 'transparent',
                  color: isSelected ? 'white' : '#f1f5f9',
                  borderRadius: '50%', cursor: 'pointer', transition: 'all 0.2s ease',
                  position: 'relative',
                  fontSize: '0.85rem',
                  fontWeight: isSelected || hasTask ? 700 : 500,
                  boxShadow: isSelected ? '0 0 12px rgba(139, 92, 246, 0.7)' : 'none',
                  border: isSelected ? 'none' : '1px solid transparent'
                }}>
                  <span>{d}</span>
                  {hasTask && !isSelected && (
                    <div style={{ position: 'absolute', bottom: '2px', width: '4px', height: '4px', background: '#f43f5e', borderRadius: '50%' }} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tasks Below */}
      {/* Tasks Below */}
      <div className="panel calendar-tasks-card" style={{ 
        flex: 1,
        padding: '30px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
            Tasks for {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(selectedDate))}
          </h3>
        </div>

        {/* Toggle / Tabs */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '30px' }}>
          <button style={{ 
            padding: '8px 20px', 
            borderRadius: '99px', 
            border: 'none', 
            background: '#1e293b', 
            color: '#ffffff', 
            fontWeight: 600, 
            fontSize: '0.9rem',
            cursor: 'pointer' 
          }}>Daily Task</button>
          <button style={{ 
            padding: '8px 20px', 
            borderRadius: '99px', 
            border: '1px solid #e2e8f0', 
            background: '#ffffff', 
            color: '#64748b', 
            fontWeight: 600, 
            fontSize: '0.9rem',
            cursor: 'pointer' 
          }}>Important Dates</button>
        </div>
        
        {filteredTasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>✨</div>
            <p>No tasks for this day. You're all caught up!</p>
          </div>
        ) : (
          <div className="task-list-wrapper" style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {/* The vertical timeline line */}
            <div style={{ position: 'absolute', left: '79px', top: '24px', bottom: '24px', width: '2px', background: 'rgba(255, 255, 255, 0.1)', zIndex: 0 }} />
            
            <ul className="todo-list" style={{ listStyle: 'none', padding: 0, margin: 0, position: 'relative', zIndex: 1, gap: '20px' }}>
              {filteredTasks.map(t => (
                <li key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                  {/* Time label */}
                  <div style={{ width: '50px', textAlign: 'right', paddingTop: '18px', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b' }}>
                      {t.due_date ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(t.due_date)) : '--:--'}
                    </span>
                  </div>
                  
                  {/* Checkbox (Timeline Dot) */}
                  <div style={{ paddingTop: '14px', background: 'transparent', paddingBottom: '4px' }}>
                    <button onClick={() => handleToggle(t.id, t.is_completed)}
                      title="Toggle Task"
                      style={{
                        width: '28px', height: '28px', borderRadius: '50%', border: `2px solid ${t.is_completed ? '#10b981' : '#cbd5e1'}`,
                        background: t.is_completed ? '#10b981' : 'rgba(255, 255, 255, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', color: '#fff', flexShrink: 0, transition: 'all 0.2s',
                        boxShadow: 'none'
                      }}>
                      {t.is_completed && <span style={{ fontSize: '14px', fontWeight: 'bold' }}>✓</span>}
                    </button>
                  </div>

                  {/* Task Card */}
                  <div style={{ 
                    flex: 1, 
                    background: 'rgba(255, 255, 255, 0.05)', 
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    padding: '16px 20px', 
                    borderRadius: '16px', 
                    display: 'flex', 
                    flexDirection: 'column',
                    transition: 'all 0.2s'
                  }}>
                    <span style={{ 
                      color: t.is_completed ? '#94a3b8' : '#f1f5f9', 
                      textDecoration: t.is_completed ? 'line-through' : 'none', 
                      fontWeight: 700, 
                      fontSize: '1rem' 
                    }}>
                      {t.title}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* DAILY HABITS */}
      </div> {/* Closes task-calendar-view left column */}

      {/* RIGHT SIDEBAR: ANALYTICS & HABITS */}
      <div className="analytics-sidebar right-column">
        {/* DAILY HABITS */}
        <div className="panel habit-daily-panel">
          <h3 className="panel-title">Habits for {selectedDate ? new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(selectedDate)) : ''}</h3>
          <ul className="todo-list">
            {habits.map(habit => {
              const isCompletedForSelectedDate = habit.logs && habit.logs[selectedDate] === true;
              return (
                <li key={habit.id} className={`todo-item ${isCompletedForSelectedDate ? 'completed' : ''}`}>
                  <div className="todo-checkbox" onClick={() => toggleHabit(habit.id, selectedDate)}></div>
                  <span className="todo-text">{habit.title}</span>
                </li>
              );
            })}
            {habits.length === 0 && <p style={{ color: '#94a3b8' }}>No habits found.</p>}
          </ul>
        </div>

        {!analytics ? (
          <div className="spinner" style={{ margin: "40px auto", borderColor: '#e2e8f0', borderTopColor: '#6B4EFF' }} />
        ) : (
          <>
            {/* Widget 1: Progress Rings */}
            <div className="panel progress-panel">
              <h3 className="panel-title">Daily Execution</h3>
              <div className="rings-container">
                <div className="progress-ring">
                  <svg viewBox="0 0 36 36" className="circular-chart purple">
                    <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <path className="circle" strokeDasharray={`${analytics.execution.habits}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <text x="18" y="20.35" className="percentage">{analytics.execution.habits}%</text>
                  </svg>
                  <span className="ring-label">Habits Completed</span>
                </div>
                <div className="progress-ring">
                  <svg viewBox="0 0 36 36" className="circular-chart green">
                    <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <path className="circle" strokeDasharray={`${analytics.execution.tasks}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <text x="18" y="20.35" className="percentage">{analytics.execution.tasks}%</text>
                  </svg>
                  <span className="ring-label">Tasks Completed</span>
                </div>
              </div>
            </div>




          </>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
function App() {
  const [authed, setAuthed] = useState(false);

  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [toastMsg, showToast] = useToast();
  const [showHabitModal, setShowHabitModal] = useState(false);
  const [editingHabit, setEditingHabit] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [profileInitial, setProfileInitial] = useState("");


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

  const topStreak = 0; // Removed matrix data

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

          <div className="month-nav" style={{ marginLeft: 'auto' }}>
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
        <TaskCalendarView currentYear={currentYear} currentMonth={currentMonth} showToast={showToast} />
      </main>

      {/* MODALS */}
      {(showHabitModal || editingHabit) && (
        <HabitModal
          initialData={editingHabit}
          onClose={() => { setShowHabitModal(false); setEditingHabit(null); }}
          onCreated={() => window.__loadTasks?.()}
          showToast={showToast}
        />
      )}
      {showProfileModal && (
        <ProfileModal onClose={() => setShowProfileModal(false)} showToast={showToast} />
      )}

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
        onRefreshHabits={() => window.__loadTasks?.()}
      />

      {/* TOAST */}
      <Toast message={toastMsg} />
    </>
  );
}

// Ensure App is globally accessible for the mounting script in index-react.html
window.App = App;
