/* ═══════════════════════════════════════════════════════════════
   FlowBoard — Vanilla JS Client
   Connects to FastAPI backend at http://127.0.0.1:8000
   ═══════════════════════════════════════════════════════════════ */

const API = 'http://127.0.0.1:8000';

// ── State ─────────────────────────────────────────────────────────────────────
let currentYear  = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1; // 1-indexed
let chartInstances = {};   // habit_id → Chart.js instance

// ── Helpers ──────────────────────────────────────────────────────────────────
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  if (res.status === 204) return null;
  return res.json();
}

function showToast(msg, duration = 2200) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

function padDate(year, month, day) {
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// HABIT GRID
// ═════════════════════════════════════════════════════════════════════════════

async function loadMatrix() {
  const loading   = document.getElementById('grid-loading');
  const container = document.getElementById('habit-grid-container');
  const empty     = document.getElementById('grid-empty');

  loading.classList.remove('hidden');
  container.classList.add('hidden');
  empty.classList.add('hidden');

  try {
    const data = await api('GET', `/analytics/matrix?year=${currentYear}&month=${currentMonth}`);
    renderGrid(data);
    renderRings(data);
    updateMonthLabel();
    updateTopStreak(data);
  } catch (e) {
    console.error(e);
    showToast('⚠️ Could not load habit matrix');
  } finally {
    loading.classList.add('hidden');
  }
}

function updateMonthLabel() {
  document.getElementById('month-label').textContent =
    `${MONTH_NAMES[currentMonth - 1]} ${currentYear}`;
}

function updateTopStreak(data) {
  const max = data.habits.reduce((m, h) => Math.max(m, h.streak), 0);
  document.getElementById('top-streak').textContent = max;
}

function renderGrid(data) {
  const container = document.getElementById('habit-grid-container');
  const empty     = document.getElementById('grid-empty');

  if (!data.habits.length) {
    empty.classList.remove('hidden');
    container.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  container.classList.remove('hidden');

  const today = data.today;   // null if not current month

  // Build column widths: label col + one col per day
  const table = document.createElement('table');
  table.className = 'habit-table';

  // ── Header row (day numbers) ──
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.className = 'day-header-row';

  // Empty corner cell for habit labels
  const corner = document.createElement('th');
  corner.style.minWidth = '150px';
  headerRow.appendChild(corner);

  data.days.forEach(d => {
    const th = document.createElement('th');
    th.textContent = d;
    if (d === today) th.classList.add('today-header');
    headerRow.appendChild(th);
  });

  // Streak header
  const streakTh = document.createElement('th');
  streakTh.textContent = '🔥';
  streakTh.title = 'Current streak';
  streakTh.style.paddingLeft = '8px';
  headerRow.appendChild(streakTh);

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // ── Body rows (one per habit) ──
  const tbody = document.createElement('tbody');

  data.habits.forEach(habit => {
    const tr = document.createElement('tr');
    tr.className = 'habit-row';
    tr.dataset.habitId = habit.id;

    // Label cell
    const labelTd = document.createElement('td');
    labelTd.className = 'habit-label-cell';
    labelTd.innerHTML = `
      <div class="habit-label-inner">
        <span class="habit-dot" style="background:${habit.color_theme}"></span>
        <span class="habit-name" title="${habit.title}">${habit.title}</span>
        <button class="habit-delete-btn" data-habit-id="${habit.id}" title="Archive habit">✕</button>
      </div>`;
    tr.appendChild(labelTd);

    // Day cells
    data.days.forEach(d => {
      const td = document.createElement('td');
      td.className = 'habit-cell';
      if (d === today) td.classList.add('today-col');

      const isFuture = today !== null && d > today;
      const isDone   = habit.logs[String(d)] === true;
      const dateStr  = padDate(currentYear, currentMonth, d);

      const btn = document.createElement('button');
      btn.className = `cell-btn${isDone ? ' done' : ''}${isFuture ? ' future' : ''}`;
      btn.style.setProperty('color', isDone ? habit.color_theme : 'transparent');
      btn.setAttribute('aria-label', `${habit.title} on day ${d}`);
      btn.dataset.habitId = habit.id;
      btn.dataset.date    = dateStr;
      btn.dataset.color   = habit.color_theme;

      if (!isFuture) {
        btn.addEventListener('click', onCellClick);
      }

      td.appendChild(btn);
      tr.appendChild(td);
    });

    // Streak cell
    const streakTd = document.createElement('td');
    streakTd.style.textAlign = 'center';
    streakTd.style.paddingLeft = '8px';
    streakTd.innerHTML = `<span style="font-size:.78rem;font-weight:700;color:#f59e0b">${habit.streak}</span>`;
    tr.appendChild(streakTd);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.innerHTML = '';
  container.appendChild(table);

  // Delegate archive buttons
  container.querySelectorAll('.habit-delete-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      onDeleteHabit(Number(btn.dataset.habitId));
    });
  });
}

async function onCellClick(e) {
  const btn     = e.currentTarget;
  const habitId = Number(btn.dataset.habitId);
  const dateStr = btn.dataset.date;
  const color   = btn.dataset.color;

  // Optimistic UI toggle
  const wasDone = btn.classList.contains('done');
  applyDoneState(btn, !wasDone, color);

  try {
    const result = await api('POST', `/track/?habit_id=${habitId}&log_date=${dateStr}`);
    // Sync with server truth
    applyDoneState(btn, result.status, color);
    // Refresh rings quietly
    refreshRingsQuiet();
  } catch (err) {
    // Revert
    applyDoneState(btn, wasDone, color);
    showToast('⚠️ Toggle failed — check your connection');
  }
}

function applyDoneState(btn, done, color) {
  btn.classList.toggle('done', done);
  btn.style.setProperty('color', done ? color : 'transparent');
}

async function refreshRingsQuiet() {
  try {
    const data = await api('GET', `/analytics/matrix?year=${currentYear}&month=${currentMonth}`);
    renderRings(data);
    updateTopStreak(data);
  } catch (_) { /* silent */ }
}

async function onDeleteHabit(habitId) {
  if (!confirm('Archive this habit? It will no longer appear in new months.')) return;
  try {
    await api('DELETE', `/habits/${habitId}`);
    showToast('Habit archived');
    loadMatrix();
  } catch (e) {
    showToast('⚠️ Could not archive habit');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PROGRESS RINGS (Chart.js doughnuts)
// ═════════════════════════════════════════════════════════════════════════════

function renderRings(data) {
  const container = document.getElementById('rings-container');

  if (!data.habits.length) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:.82rem;text-align:center;padding:1rem">Add habits to see rings</p>';
    return;
  }

  // Keep existing DOM, just update charts
  data.habits.forEach(habit => {
    const cardId   = `ring-card-${habit.id}`;
    const canvasId = `ring-canvas-${habit.id}`;
    const pct      = habit.completion_pct;

    let card = document.getElementById(cardId);

    if (!card) {
      // Create card
      card = document.createElement('div');
      card.className = 'ring-card';
      card.id = cardId;
      card.innerHTML = `
        <div class="ring-canvas-wrap">
          <canvas id="${canvasId}" width="80" height="80"></canvas>
          <div class="ring-pct" id="ring-pct-${habit.id}">0%</div>
        </div>
        <div class="ring-label" title="${habit.title}">${habit.title}</div>
        <div class="ring-streak" id="ring-streak-${habit.id}">🔥 0</div>`;
      container.appendChild(card);

      // Init Chart.js
      const ctx = document.getElementById(canvasId).getContext('2d');
      chartInstances[habit.id] = new Chart(ctx, {
        type: 'doughnut',
        data: {
          datasets: [{
            data: [pct, 100 - pct],
            backgroundColor: [habit.color_theme, 'rgba(255,255,255,0.05)'],
            borderWidth: 0,
            borderRadius: 4,
          }],
        },
        options: {
          cutout: '72%',
          animation: { duration: 600, easing: 'easeInOutQuart' },
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          responsive: false,
        },
      });
    } else {
      // Update existing chart
      const chart = chartInstances[habit.id];
      if (chart) {
        chart.data.datasets[0].data = [pct, 100 - pct];
        chart.update('active');
      }
    }

    // Update text overlays
    document.getElementById(`ring-pct-${habit.id}`).textContent = `${Math.round(pct)}%`;
    document.getElementById(`ring-streak-${habit.id}`).textContent = `🔥 ${habit.streak}`;
  });

  // Remove cards for habits that no longer exist
  container.querySelectorAll('.ring-card').forEach(card => {
    const id = Number(card.id.replace('ring-card-', ''));
    if (!data.habits.find(h => h.id === id)) {
      if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
      card.remove();
    }
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// TODOS
// ═════════════════════════════════════════════════════════════════════════════

async function loadTodos() {
  try {
    const todos = await api('GET', '/todos/');
    renderTodos(todos);
  } catch (e) {
    console.error(e);
  }
}

function renderTodos(todos) {
  const list  = document.getElementById('todo-list');
  const empty = document.getElementById('todo-empty');
  const badge = document.getElementById('todo-count');

  const pending = todos.filter(t => !t.is_completed);
  badge.textContent = pending.length || '';

  if (!todos.length) {
    empty.classList.remove('hidden');
    list.innerHTML = '';
    return;
  }
  empty.classList.add('hidden');

  // Sort: pending first, then completed
  const sorted = [...todos].sort((a, b) => a.is_completed - b.is_completed);

  list.innerHTML = '';
  sorted.forEach(todo => {
    const li = document.createElement('li');
    li.className = `todo-item${todo.is_completed ? ' completed' : ''}`;
    li.dataset.id = todo.id;
    li.innerHTML = `
      <div class="todo-checkbox" aria-hidden="true"></div>
      <span class="todo-text">${escHtml(todo.title)}</span>
      <button class="todo-del-btn" data-id="${todo.id}" title="Delete">✕</button>`;

    li.addEventListener('click', e => {
      if (e.target.classList.contains('todo-del-btn')) return;
      onToggleTodo(todo.id, li);
    });

    li.querySelector('.todo-del-btn').addEventListener('click', e => {
      e.stopPropagation();
      onDeleteTodo(todo.id, li);
    });

    list.appendChild(li);
  });
}

async function onToggleTodo(id, li) {
  // Optimistic
  li.classList.toggle('completed');
  try {
    const updated = await api('PUT', `/todos/${id}/toggle`);
    // Re-render all todos to keep sort order + badge count
    loadTodos();
  } catch (e) {
    li.classList.toggle('completed'); // revert
    showToast('⚠️ Could not update todo');
  }
}

async function onDeleteTodo(id, li) {
  li.style.opacity = '0.4';
  li.style.pointerEvents = 'none';
  try {
    // Specifically hitting the new DELETE route at http://127.0.0.1:8000/todos/{id}
    await api('DELETE', `/todos/${id}`);
    
    // Visually remove it immediately
    li.remove();
    
    // Refresh the entire todo list from the database to ensure sync
    await loadTodos(); 
  } catch (e) {
    li.style.opacity = '';
    li.style.pointerEvents = '';
    showToast('⚠️ Could not delete todo, check console.');
    console.error("Delete Error:", e);
  }
}

function escHtml(str) {
  return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// ═════════════════════════════════════════════════════════════════════════════
// ADD HABIT MODAL
// ═════════════════════════════════════════════════════════════════════════════

function openHabitModal() {
  document.getElementById('habit-modal').classList.remove('hidden');
  document.getElementById('habit-title-input').focus();
}

function closeHabitModal() {
  document.getElementById('habit-modal').classList.add('hidden');
  document.getElementById('habit-form').reset();
}

document.getElementById('btn-add-habit').addEventListener('click', openHabitModal);
document.getElementById('modal-close').addEventListener('click', closeHabitModal);
document.getElementById('habit-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeHabitModal();
});

// Color swatches
document.querySelectorAll('.swatch').forEach(swatch => {
  swatch.addEventListener('click', () => {
    document.getElementById('habit-color-input').value = swatch.dataset.color;
    document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
    swatch.classList.add('active');
  });
});

document.getElementById('habit-form').addEventListener('submit', async e => {
  e.preventDefault();
  const title = document.getElementById('habit-title-input').value.trim();
  const color = document.getElementById('habit-color-input').value;
  if (!title) return;

  try {
    await api('POST', '/habits/', { title, color_theme: color, frequency: 'daily' });
    closeHabitModal();
    showToast(`✅ "${title}" habit created!`);
    loadMatrix();
  } catch (err) {
    showToast('⚠️ Could not create habit');
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// ADD TODO FORM
// ═════════════════════════════════════════════════════════════════════════════

document.getElementById('todo-form').addEventListener('submit', async e => {
  e.preventDefault();
  const input = document.getElementById('todo-input');
  const title = input.value.trim();
  if (!title) return;

  input.value = '';
  try {
    await api('POST', '/todos/', { title });
    loadTodos();
    showToast('✅ Task added');
  } catch (err) {
    showToast('⚠️ Could not add task');
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// MONTH NAVIGATION
// ═════════════════════════════════════════════════════════════════════════════

document.getElementById('btn-prev-month').addEventListener('click', () => {
  currentMonth--;
  if (currentMonth < 1) { currentMonth = 12; currentYear--; }
  loadMatrix();
});

document.getElementById('btn-next-month').addEventListener('click', () => {
  currentMonth++;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  loadMatrix();
});

// ═════════════════════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═════════════════════════════════════════════════════════════════════════════

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeHabitModal();
  if (e.key === 'n' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
    openHabitModal();
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// TODO WIDGET TOGGLE
// ═════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    const todoToggleBtn = document.getElementById('todo-toggle-btn');
    const todoCloseBtn = document.getElementById('todo-close-btn');
    const todoWindow = document.getElementById('todo-window');

    if (todoToggleBtn && todoCloseBtn && todoWindow) {
        todoToggleBtn.addEventListener('click', () => todoWindow.classList.add('open'));
        todoCloseBtn.addEventListener('click', () => todoWindow.classList.remove('open'));
    }
});

// ═════════════════════════════════════════════════════════════════════════════
// AI CHAT WIDGET
// ═════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const toggleBtn = document.getElementById('chat-toggle-btn');
    const closeBtn = document.getElementById('chat-close-btn');
    const chatWindow = document.getElementById('chat-window');
    const micBtn = document.getElementById('mic-btn');
    const sendBtn = document.getElementById('send-btn');
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.getElementById('chat-messages');
    const homeView = document.getElementById('chat-home-view');
    const chips = document.querySelectorAll('.chip');

    // 1. OPEN / CLOSE WINDOW
    toggleBtn.addEventListener('click', () => chatWindow.classList.add('open'));
    closeBtn.addEventListener('click', () => chatWindow.classList.remove('open'));

    // 2. SUGGESTION CHIPS (Two-View System)
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            homeView.style.display = 'none'; // Hide the home menu
            sendMessage(chip.innerText);     // Send the text
        });
    });

    // 3. VOICE INPUT (Web Speech API)
    micBtn.addEventListener('click', () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Voice input is not supported in this browser. Try Chrome!");
            return;
        }
        
        const recognition = new SpeechRecognition();
        
        recognition.onstart = () => {
            chatInput.placeholder = "Listening...";
            micBtn.classList.add('listening'); // Makes the mic pulse red
        };
        
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            chatInput.placeholder = "Type a message...";
            micBtn.classList.remove('listening');
            
            homeView.style.display = 'none';
            sendMessage(transcript); // Automatically send when they stop talking
        };
        
        recognition.onerror = () => micBtn.classList.remove('listening');
        recognition.start();
    });

    // SEND BUTTON & ENTER KEY
    sendBtn.addEventListener('click', () => triggerSend());
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') triggerSend();
    });

    function triggerSend() {
        const text = chatInput.value.trim();
        if (text) {
            homeView.style.display = 'none';
            sendMessage(text);
        }
    }

    // 4. CORE SEND MESSAGE LOGIC & TYPING INDICATOR
    async function sendMessage(text) {
        // Clear input and append User bubble
        chatInput.value = '';
        appendBubble(text, 'msg-user');

        // Inject Typing Indicator HTML
        const typingId = 'typing-' + Date.now();
        const typingHtml = `<div id="${typingId}" class="typing-dots"><div></div><div></div><div></div></div>`;
        chatMessages.insertAdjacentHTML('beforeend', typingHtml);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        try {
            // Call your FastAPI Backend
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text })
            });
            const data = await response.json();
            
            // Remove Typing Indicator
            document.getElementById(typingId).remove();
            
            // Append AI Response
            appendBubble(data.reply, 'msg-ai');
            
            // Refresh the grid so checkboxes update immediately!
            if(typeof loadMatrix === "function") loadMatrix(); 
            if(typeof loadTodos === "function") loadTodos(); 
            
        } catch (error) {
            document.getElementById(typingId).remove();
            appendBubble("Error connecting to the AI brain.", 'msg-ai');
        }
    }

    // Helper to create chat bubbles
    function appendBubble(text, className) {
        const div = document.createElement('div');
        div.className = className;
        div.innerText = text;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll to bottom
    }
});

// ═════════════════════════════════════════════════════════════════════════════
// SUPABASE AUTHENTICATION
// ═════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Supabase
    const supabaseUrl = 'https://ftzaiphsficsylkntqjw.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0emFpcGhzZmljc3lsa250cWp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4Mzc3MTksImV4cCI6MjA5MDQxMzcxOX0.nK7gwwcQeKQKwlGCS0uxjBhMW12wFIPMaPBU_Mv19yQ'; // Your full key
    const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

    let authToken = null;

    // 2. Sign Up
    const signupBtn = document.getElementById('signup-btn');
    if (signupBtn) {
        signupBtn.addEventListener('click', async (e) => {
            // 1. Stop the form from refreshing the page
            e.preventDefault(); 
            
            // 2. Grab the text from the boxes
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            // 3. THE SAFETY CHECK: Are we actually getting the text?
            if (!email || !password) {
                alert("Error: The code cannot see your email or password! Check your HTML IDs.");
                return; // Stop here so we don't send a blank request to Supabase
            }

            // 4. Send to Supabase
            const { data, error } = await supabase.auth.signUp({ 
                email: email, 
                password: password 
            });

            // 5. Handle the result
            if (error) {
                alert("Supabase Error: " + error.message);
            } else {
                alert("Success! Check your email for the confirmation link!");
            }
        });
    }

    // 3. Login
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', async (e) => {
            e.preventDefault(); // Prevents the page from refreshing
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            if (!email || !password) {
                alert("Please enter both email and password to sign in.");
                return;
            }
            
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            
            if (error) {
                alert(error.message);
            } else {
                authToken = data.session.access_token;
                document.getElementById('auth-overlay').style.display = 'none';
                
                // Load dashboard data!
                updateMonthLabel();
                Promise.all([loadMatrix(), loadTodos()]);
                
                alert("Successfully logged in!");
            }
        });
    }
});
