/* ═══════════════════════════════════════════════════════════════
   CogniPlan — Vanilla JS Client (Full Fix Version)
   ═══════════════════════════════════════════════════════════════ */



// Helper function to pause execution (used for waking up the server)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const supabaseUrl = 'https://ftzaiphsficsylkntqjw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0emFpcGhzZmljc3lsa250cWp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4Mzc3MTksImV4cCI6MjA5MDQxMzcxOX0.nK7gwwcQeKQKwlGCS0uxjBhMW12wFIPMaPBU_Mv19yQ';
var supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// ── State ─────────────────────────────────────────────────────────────────────
let currentYear  = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1; 
let chartInstances = {};   

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

// ── Helpers ──────────────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════
// CORE API FETCHER (ENVIRONMENT ROUTER)
// ═════════════════════════════════════════════════════════════════════════════

/* INSTRUCTIONS FOR CHANGING ENVIRONMENTS:
  This variable tells your frontend exactly where to send data. 
  You must manually "toggle" these lines depending on what you are doing today.
  
  HOW TO TOGGLE:
  Remove the `//` from the line you want to use, and add `//` to the line you want to hide.
*/

// 🔴 PRODUCTION URL (The Live Cloud Server)
// -> ACTIVE when pushed to GitHub.
// -> Points to Render so anyone on the internet can use your app.
// const API_BASE_URL = 'https://cogniplan-siaf.onrender.com';

// 🟢 LOCAL DEVELOPMENT URL (Your Laptop)
// -> ACTIVE when building new features on your laptop.
// -> Points to your local Uvicorn terminal (http://127.0.0.1:8000).
// -> WARNING: Never leave this active when pushing to GitHub!
 const API_BASE_URL = "http://localhost:8000";
async function api(method, endpoint, body = null) {
    // 1. Get the auth token from localStorage (solves issues with async Supabase session retrieval)
    const token = localStorage.getItem('flowboard_auth_token');
    
    // 2. Prepare the standard headers
    const headers = {
        'Content-Type': 'application/json'
    };

    // 3. THE CRITICAL FIX: Attach the token to the header if they are logged in
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    } else {
        console.warn("⚠️ No active session found. The backend will likely reject this.");
    }

    // 4. Prepare the fetch options
    const options = {
        method: method,
        headers: headers
    };
    
    if (body) {
        options.body = JSON.stringify(body);
    }

    // 5. Send the request to your FastAPI backend
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        
        // If the backend still rejects it, throw an error so we can see it in the console
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("Backend rejected request:", errorData);
            const apiError = new Error(`API Error: ${response.status}`);
            apiError.status = response.status;
            throw apiError;
        }
        
        return await response.json();
    } catch (err) {
        console.error(`Failed to fetch ${endpoint}:`, err);
        throw err;
    }
}

function showToast(msg, duration = 2200) {
  const t = document.getElementById('toast');
  if(t) {
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), duration);
  }
}

function padDate(year, month, day) {
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// HABIT GRID
// ═════════════════════════════════════════════════════════════════════════════

async function loadMatrix(maxRetries = 12) {
  // Guard clause to prevent execution if no token exists
  const token = localStorage.getItem('flowboard_auth_token');
  if (!token) return;

  const loading   = document.getElementById('grid-loading');
  const container = document.getElementById('habit-grid-container');
  const empty     = document.getElementById('grid-empty');

  if(loading) loading.classList.remove('hidden');
  if(container) container.classList.add('hidden');
  if(empty) empty.classList.add('hidden');

  // THE SMART RETRY LOOP
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Update the loading screen to show progress
        if (loading) {
            loading.innerHTML = `
                <div class="spinner" style="margin: 0 auto 12px;"></div>
                <div style="display:flex; flex-direction:column; align-items:center; gap:6px;">
                    <span style="font-weight:600; color:#f8fafc; font-size: 15px;">Waking up the cloud...</span>
                    <span style="font-size:12.5px; color:#94a3b8;">Attempt ${attempt} of ${maxRetries} (Takes ~50s)</span>
                </div>
            `;
        }

        // Try to fetch the data
        const data = await api('GET', `/analytics/matrix?year=${currentYear}&month=${currentMonth}`);
        
        // IF IT SUCCEEDS: Draw the grid and exit the loop!
        renderGrid(data);
        renderRings(data);
        updateMonthLabel();
        updateTopStreak(data);
        
        if(loading) loading.classList.add('hidden');
        return; 

      } catch (e) {
        // Redirect immediately on Auth Errors
        if (e.status === 401 || e.status === 403) {
            console.error("Authentication failed. Redirecting to login.");
            const authOverlay = document.getElementById('auth-overlay') || document.querySelector('.auth-overlay');
            if (authOverlay) {
                authOverlay.style.display = 'flex';
                authOverlay.classList.remove('hidden');
            } else {
                window.location.href = '/login.html';
            }
            if(loading) loading.classList.add('hidden');
            return;
        }

        // Only retry on network errors or a 502/503 server waking up error
        if (e.status === 502 || e.status === 503 || e.message.includes("Failed to fetch")) {
            console.log(`[Attempt ${attempt}] Server is asleep, retrying in 5 seconds...`);
            await delay(5000); // Wait 5 seconds before trying again
        } else {
            // Other errors, abort
            if(loading) {
                loading.innerHTML = `
                    <div style="color: #ef4444; text-align:center;">
                        <span style="font-size: 24px;">❌</span>
                        <p style="margin-top: 8px; font-size: 14px;">Error Loading Data.</p>
                    </div>
                `;
            }
            return;
        }
      }
  }

  // IF IT FAILS AFTER 60 SECONDS
  if(loading) {
      loading.innerHTML = `
        <div style="color: #ef4444; text-align:center;">
            <span style="font-size: 24px;">❌</span>
            <p style="margin-top: 8px; font-size: 14px;">Connection Failed. Please refresh.</p>
        </div>
      `;
  }
}

function updateMonthLabel() {
  const label = document.getElementById('month-label');
  if(label) label.textContent = `${MONTH_NAMES[currentMonth - 1]} ${currentYear}`;
}

function updateTopStreak(data) {
  const max = data.habits.reduce((m, h) => Math.max(m, h.streak), 0);
  const streakEl = document.getElementById('top-streak');
  if(streakEl) streakEl.textContent = max;
}

function renderGrid(data) {
  const container = document.getElementById('habit-grid-container');
  const empty     = document.getElementById('grid-empty');

  if (!data.habits.length) {
    if(empty) empty.classList.remove('hidden');
    if(container) container.classList.add('hidden');
    return;
  }

  if(empty) empty.classList.add('hidden');
  if(container) container.classList.remove('hidden');

  const today = data.today;

  const table = document.createElement('table');
  table.className = 'habit-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.className = 'day-header-row';

  // STICKY CSS FIX 1: Hardcoded into the corner header
  const corner = document.createElement('th');
  corner.style.minWidth = '150px';
  corner.style.position = 'sticky';
  corner.style.left = '0';
  corner.style.zIndex = '12';
  corner.style.backgroundColor = '#111827';
  headerRow.appendChild(corner);

  data.days.forEach(d => {
    const th = document.createElement('th');
    th.textContent = d;
    if (d === today) th.classList.add('today-header');
    headerRow.appendChild(th);
  });

  const streakTh = document.createElement('th');
  streakTh.textContent = '🔥';
  streakTh.title = 'Current streak';
  streakTh.style.paddingLeft = '8px';
  headerRow.appendChild(streakTh);

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  data.habits.forEach(habit => {
    const tr = document.createElement('tr');
    tr.className = 'habit-row';
    tr.dataset.habitId = habit.id;

    // STICKY CSS FIX 2: Hardcoded into the names column
    const labelTd = document.createElement('td');
    labelTd.className = 'habit-label-cell';
    labelTd.style.position = 'sticky';
    labelTd.style.left = '0';
    labelTd.style.zIndex = '11';
    labelTd.style.backgroundColor = '#111827';
    labelTd.style.boxShadow = '2px 0 5px rgba(0,0,0,0.3)';
    labelTd.innerHTML = `
      <div class="habit-label-inner">
        <span class="habit-dot" style="background:${habit.color_theme}"></span>
        <span class="habit-name" title="${habit.title}">${habit.title}</span>
        <button class="habit-delete-btn" data-habit-id="${habit.id}" title="Delete habit">✕</button>
      </div>`;
    tr.appendChild(labelTd);

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

  const wasDone = btn.classList.contains('done');
  applyDoneState(btn, !wasDone, color);

  try {
    const result = await api('POST', `/track/?habit_id=${habitId}&log_date=${dateStr}`);
    applyDoneState(btn, result.status, color);
    refreshRingsQuiet();
  } catch (err) {
    applyDoneState(btn, wasDone, color);
    showToast('⚠️ Toggle failed');
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
  } catch (_) { }
}

async function onDeleteHabit(habitId) {
  if (!confirm('Permanently delete this habit?')) return;
  try {
    await api('DELETE', `/habits/${habitId}`);
    showToast('Habit deleted');
    loadMatrix();
  } catch (e) {
    showToast('⚠️ Could not delete habit');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PROGRESS RINGS
// ═════════════════════════════════════════════════════════════════════════════

function renderRings(data) {
  const container = document.getElementById('rings-container');
  if(!container) return;

  if (!data.habits.length) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:.82rem;text-align:center;padding:1rem">Add habits to see rings</p>';
    return;
  }

  data.habits.forEach(habit => {
    const cardId   = `ring-card-${habit.id}`;
    const canvasId = `ring-canvas-${habit.id}`;
    const pct      = habit.completion_pct;

    let card = document.getElementById(cardId);

    if (!card) {
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
      const chart = chartInstances[habit.id];
      if (chart) {
        chart.data.datasets[0].data = [pct, 100 - pct];
        chart.update('active');
      }
    }

    document.getElementById(`ring-pct-${habit.id}`).textContent = `${Math.round(pct)}%`;
    document.getElementById(`ring-streak-${habit.id}`).textContent = `🔥 ${habit.streak}`;
  });

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
  // Guard clause to prevent execution if no token exists
  const token = localStorage.getItem('flowboard_auth_token');
  if (!token) return;

  try {
    const todos = await api('GET', '/todos/');
    renderTodos(todos);
  } catch (e) {
    if (e.status === 401 || e.status === 403) {
       console.error("Authentication failed. Redirecting to login.");
       const authOverlay = document.getElementById('auth-overlay') || document.querySelector('.auth-overlay');
       if (authOverlay) {
           authOverlay.style.display = 'flex';
           authOverlay.classList.remove('hidden');
       } else {
           window.location.href = '/login.html';
       }
       return;
    }
    console.error(e);
  }
}

function renderTodos(todos) {
  const list  = document.getElementById('todo-list');
  const empty = document.getElementById('todo-empty');
  const badge = document.getElementById('todo-count');
  
  if(!list) return;

  const pending = todos.filter(t => !t.is_completed);
  if(badge) badge.textContent = pending.length || '';

  if (!todos.length) {
    if(empty) empty.classList.remove('hidden');
    list.innerHTML = '';
    return;
  }
  if(empty) empty.classList.add('hidden');

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
  li.classList.toggle('completed');
  try {
    await api('PUT', `/todos/${id}/toggle`);
    loadTodos();
  } catch (e) {
    li.classList.toggle('completed'); 
    showToast('⚠️ Could not update todo');
  }
}

async function onDeleteTodo(id, li) {
  li.style.opacity = '0.4';
  li.style.pointerEvents = 'none';
  try {
    await api('DELETE', `/todos/${id}`);
    li.remove();
    await loadTodos(); 
  } catch (e) {
    li.style.opacity = '';
    li.style.pointerEvents = '';
    showToast('⚠️ Could not delete todo');
  }
}

function escHtml(str) {
  return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// ═════════════════════════════════════════════════════════════════════════════
// EVENT LISTENERS & WIDGETS
// ═════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    // Basic UI Setup
    const btnAddHabit = document.getElementById('btn-add-habit');
    const modalClose = document.getElementById('modal-close');
    const habitModal = document.getElementById('habit-modal');
    
    if(btnAddHabit) btnAddHabit.addEventListener('click', () => {
        habitModal.classList.remove('hidden');
        document.getElementById('habit-title-input').focus();
    });
    if(modalClose) modalClose.addEventListener('click', () => {
        habitModal.classList.add('hidden');
        document.getElementById('habit-form').reset();
    });
    
    document.getElementById('btn-prev-month')?.addEventListener('click', () => {
        currentMonth--;
        if (currentMonth < 1) { currentMonth = 12; currentYear--; }
        loadMatrix();
    });
    
    document.getElementById('btn-next-month')?.addEventListener('click', () => {
        currentMonth++;
        if (currentMonth > 12) { currentMonth = 1; currentYear++; }
        loadMatrix();
    });

    // Todo Widget Toggle
    const todoToggleBtn = document.getElementById('todo-toggle-btn');
    const todoCloseBtn = document.getElementById('todo-close-btn');
    const todoWindow = document.getElementById('todo-window');

    if (todoToggleBtn && todoCloseBtn && todoWindow) {
        todoToggleBtn.addEventListener('click', () => todoWindow.classList.add('open'));
        todoCloseBtn.addEventListener('click', () => todoWindow.classList.remove('open'));
    }

    // Toggle Chat Window
    const chatToggleBtn = document.getElementById('chat-toggle-btn');
    const chatCloseBtn = document.getElementById('chat-close-btn');
    const chatWindow = document.getElementById('chat-window');

    // 1. UI State Controller (Click Outside & Toggle)
    let isChatOpen = false;

    function toggleChatState() {
        isChatOpen = !isChatOpen;
        if (isChatOpen) {
            chatWindow.style.display = 'flex';
            // Tiny timeout allows the browser to render 'flex' before animating opacity
            setTimeout(() => { chatWindow.classList.add('open'); }, 10);
        } else {
            chatWindow.classList.remove('open');
            setTimeout(() => { chatWindow.style.display = 'none'; }, 300); // Wait for animation to finish
        }
    }

    if (chatToggleBtn && chatCloseBtn && chatWindow) {
        // Toggle when clicking the robot logo
        chatToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevents document click from immediately firing
            toggleChatState();
        });

        // Close when clicking the X button
        chatCloseBtn.addEventListener('click', () => {
            if (isChatOpen) toggleChatState();
        });

        // MAGIC: Close when clicking OUTSIDE the chat window
        document.addEventListener('click', (e) => {
            if (isChatOpen && !chatWindow.contains(e.target) && e.target !== chatToggleBtn) {
                toggleChatState();
            }
        });
        
        // Prevent clicks inside the window from closing it
        chatWindow.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

// ═════════════════════════════════════════════════════════════════════════════
// CREATE HABIT FORM SUBMISSION
// ═════════════════════════════════════════════════════════════════════════════

const habitForm = document.getElementById('habit-form');
if (habitForm) {
    habitForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Stop the page from refreshing

        // 1. Get values from the inputs
        const title = document.getElementById('habit-title-input').value;
        const color = document.querySelector('input[name="color"]:checked')?.value || '#6366f1';

        if (!title) return;

        try {
            // 2. Send data to your Render backend
            await api('POST', '/habits/', { 
                title: title, 
                color_theme: color 
            });

            // 3. Success! Cleanup UI
            showToast('✅ Habit created!');
            document.getElementById('habit-modal').classList.add('hidden');
            habitForm.reset();

            // 4. Refresh the grid so the new habit appears
            loadMatrix(); 
        } catch (err) {
            console.error(err);
            showToast('⚠️ Failed to create habit');
        }
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// CREATE TODO LOGIC
// ═════════════════════════════════════════════════════════════════════════════

const todoInput = document.getElementById('todo-input');
const btnAddTodo = document.getElementById('btn-add-todo');

if (btnAddTodo && todoInput) {
    const handleAddTodo = async () => {
        const title = todoInput.value.trim();
        if (!title) return;

        try {
            // Send the new todo to the backend
            await api('POST', '/todos/', { title: title });
            
            // Clear input and refresh the list
            todoInput.value = '';
            showToast('✅ Task added');
            loadTodos(); 
        } catch (err) {
            console.error(err);
            showToast('⚠️ Failed to add task');
        }
    };

    // Trigger on button click
    btnAddTodo.addEventListener('click', handleAddTodo);

    // Trigger when pressing "Enter" key
    todoInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAddTodo();
    });
}
});

// ═════════════════════════════════════════════════════════════════════════════
// SUPABASE AUTHENTICATION (REFRESH FIX)
// ═════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {

    // 1. REFRESH LOGIC: Check for token immediately
    let authToken = localStorage.getItem('flowboard_auth_token');

    if (authToken) {
        // Hide the auth screen securely whether it uses an ID or a Class in HTML
        const authOverlay = document.getElementById('auth-overlay') || document.querySelector('.auth-overlay');
        if (authOverlay) {
            authOverlay.style.display = 'none';
            authOverlay.classList.add('hidden');
        }
        
        // Load the data!
        updateMonthLabel();
        Promise.all([loadMatrix(), loadTodos()]);
        
        document.getElementById('profile-badge')?.classList.remove('hidden');
        loadProfile();
    }

    // 2. Login Logic
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', async (e) => {
            e.preventDefault(); 
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            if (!email || !password) {
                alert("Please enter both email and password.");
                return;
            }
            
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            
            if (error) {
                alert(error.message);
            } else {
                // SAVE THE TOKEN
                authToken = data.session.access_token;
                localStorage.setItem('flowboard_auth_token', authToken);
                
                const authOverlay = document.getElementById('auth-overlay') || document.querySelector('.auth-overlay');
                if (authOverlay) {
                    authOverlay.style.display = 'none';
                    authOverlay.classList.add('hidden');
                }
                
                updateMonthLabel();
                Promise.all([loadMatrix(), loadTodos()]);
                
                document.getElementById('profile-badge')?.classList.remove('hidden');
                loadProfile();
            }
        });
    }

    // 3. Signup Logic
    const signupBtn = document.getElementById('signup-btn');
    if (signupBtn) {
        signupBtn.addEventListener('click', async (e) => {
            e.preventDefault(); 
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            if (!email || !password) return; 

            const { data, error } = await supabase.auth.signUp({ email, password });
            if (error) {
                alert("Error: " + error.message);
            } else {
                alert("Success! Check your email for the confirmation link!");
            }
        });
    }

    // ═════════════════════════════════════════════════════════════════════════════
    // NEW PASSWORD & PROFILE & LOGOUT
    // ═════════════════════════════════════════════════════════════════════════════

    document.getElementById('forgot-password-link')?.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        if (!email) return showToast('⚠️ Enter your email first');
        
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) showToast('⚠️ ' + error.message);
        else showToast('✅ Password reset email sent!');
    });

    const handleLogout = async () => {
        await supabase.auth.signOut();
        localStorage.removeItem('flowboard_auth_token');
        window.location.reload(); 
    };
    
    document.getElementById('btn-logout')?.addEventListener('click', handleLogout);

    const profileBadge = document.getElementById('profile-badge');
    const profileModal = document.getElementById('profile-modal');
    if (profileBadge && profileModal) {
        profileBadge.addEventListener('click', () => profileModal.classList.remove('hidden'));
        document.getElementById('profile-close')?.addEventListener('click', () => profileModal.classList.add('hidden'));
    }

    async function loadProfile() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
        if (profile) {
            document.getElementById('prof-name').value = profile.full_name || '';
            document.getElementById('prof-age').value = profile.age || '';
            document.getElementById('prof-bio').value = profile.bio || '';
            document.getElementById('prof-goal').value = profile.target_goal || '';
            document.getElementById('prof-about').value = profile.about || '';
            
            if (profile.full_name) {
                document.getElementById('profile-initial').innerText = profile.full_name.charAt(0).toUpperCase();
            }
        }
    }

    document.getElementById('profile-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const { data: { user } } = await supabase.auth.getUser();
        
        const profileData = {
            id: user.id,
            full_name: document.getElementById('prof-name').value,
            age: parseInt(document.getElementById('prof-age').value) || null,
            bio: document.getElementById('prof-bio').value,
            target_goal: document.getElementById('prof-goal').value,
            about: document.getElementById('prof-about').value,
            updated_at: new Date().toISOString()
        };
        
        const { error } = await supabase.from('profiles').upsert(profileData);
        if (!error) {
            showToast('✅ Profile updated');
            profileModal.classList.add('hidden');
            loadProfile(); 
        } else {
            showToast('⚠️ Could not update profile: ' + error.message);
        }
    });

});

// ═════════════════════════════════════════════════════════════════════════════
// AI CO-PILOT CHAT LOGIC
// ═════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    
    const chatMessages = document.getElementById('chat-messages');

    // 2. The Dynamic Bubble Painter
    function appendMessage(sender, text, id = null) {
        if (!chatMessages) return;
        
        // Remove empty state view if it's there
        const homeView = document.getElementById('chat-home-view');
        if (homeView && homeView.style.display !== 'none') {
            homeView.style.display = 'none';
        }

        const msgDiv = document.createElement('div');
        msgDiv.className = sender === 'user' ? 'msg-user' : 'msg-ai';
        if (id) msgDiv.id = id;
        
        // Use Markdown if available, otherwise fallback to normal text
        if (sender === 'ai' && typeof marked !== 'undefined') {
            msgDiv.innerHTML = marked.parse(text);
        } else {
            msgDiv.textContent = text;
        }

        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll
    }

    async function sendChatMessage() {
        const text = chatInput.value.trim();
        if (!text) return;
        
        // Add user message to UI
        appendMessage('user', text);
        chatInput.value = '';
        
        // Add a temporary loading message for the AI
        const loadingId = 'loading-' + Date.now();
        appendMessage('ai', '...', loadingId);

        // Call your Render backend!
        try {
            const data = await api('POST', '/api/chat', { message: text });
            
            const loadingEl = document.getElementById(loadingId);
            if (loadingEl) loadingEl.remove();
            
            // Show AI response
            appendMessage('ai', data.response);

            // AUTOMATIC UI UPDATE!
            if (data.action_taken === "refresh_habits") {
                if (typeof loadHabits === 'function') loadHabits(); 
                if (typeof loadMatrix === 'function') loadMatrix(); // Whichever function draws your matrix
            } 
            else if (data.action_taken === "refresh_todos") {
                // Trigger whatever function loads your To-Dos!
                if (typeof loadTodos === 'function') loadTodos(); 
            }

        } catch (error) {
            const loadingEl = document.getElementById(loadingId);
            if (loadingEl) loadingEl.remove();
            appendMessage('ai', '❌ Error connecting to AI. Is the server awake?');
            console.error("AI Fetch Error:", error);
        }
    }

    // Event Listeners for sending
    sendBtn?.addEventListener('click', sendChatMessage);
    chatInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });

    // Make the suggestion chips clickable
    const suggestionChips = document.querySelectorAll('.chip');
    const homeView = document.getElementById('chat-home-view');

    suggestionChips.forEach(chip => {
        chip.addEventListener('click', () => {
            // 1. Put the text of the chip into the input box
            if (chatInput) chatInput.value = chip.textContent;
            
            // 2. Hide the suggestion menu so the chat is clean
            if (homeView) homeView.style.display = 'none';
            
            // 3. Automatically click the send button!
            sendChatMessage();
        });
    });

    // Also hide the home view when the user types their first normal message
    sendBtn?.addEventListener('click', () => {
        if (homeView && chatInput && chatInput.value.trim() !== '') {
            homeView.style.display = 'none';
        }
    });
    chatInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && homeView && chatInput && chatInput.value.trim() !== '') {
            homeView.style.display = 'none';
        }
    });
});