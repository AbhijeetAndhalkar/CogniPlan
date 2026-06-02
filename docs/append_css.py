import os

css = """
/* ── SPA Tabs & Calendar View ── */
.spa-tabs {
  margin-right: auto;
}
.tab-btn:hover {
  background: rgba(99,102,241,0.1) !important;
}
.tab-btn.active {
  background: rgba(99,102,241,0.2) !important;
  color: #a5b4fc !important;
}
.task-calendar-view::-webkit-scrollbar {
  width: 6px;
}
.task-calendar-view::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.3);
  border-radius: 4px;
}
.calendar-tasks-sidebar::-webkit-scrollbar {
  width: 6px;
}
.calendar-tasks-sidebar::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.3);
  border-radius: 4px;
}
.task-date-picker::-webkit-calendar-picker-indicator {
  filter: invert(1);
  opacity: 0.6;
  cursor: pointer;
}
.task-date-picker:focus {
  outline: 1px solid #6366f1;
}
"""

with open(r'd:\Projects\Tracker\docs\style.css', 'a', encoding='utf-8') as f:
    f.write(css)
print("CSS appended.")
