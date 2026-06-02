import os
import re

def safe_replace(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    replacements = {
        '/todos/': '/tasks/',
        'TodoWindow': 'TaskWindow',
        'loadTodos': 'loadTasks',
        'todos, setTodos': 'tasks, setTasks',
        'todos.filter': 'tasks.filter',
        '[todos]': '[tasks]',
        '[...todos]': '[...tasks]',
        'todos.map': 'tasks.map',
        'todos.length': 'tasks.length',
        'setTodos': 'setTasks',
        '__loadTodos': '__loadTasks',
        'isTodoOpen': 'isTaskOpen',
        'setIsTodoOpen': 'setIsTaskOpen',
        'todo-window': 'task-window',
        'todo-count': 'task-count',
        'todo-input': 'task-input',
        'todo-list': 'task-list',
        'todo-item': 'task-item',
        'todo-text': 'task-text',
        'todo-del-btn': 'task-del-btn',
        'todo-checkbox': 'task-checkbox',
        'btn-add-todo': 'btn-add-task',
        'todo-widget-container': 'task-widget-container',
        'todo-toggle-btn': 'task-toggle-btn',
        'todo-empty': 'task-empty',
        'panel-todos': 'panel-tasks',
        'refresh_todos': 'refresh_tasks',
        'todo.is_completed': 'task.is_completed',
        'todo.id': 'task.id',
        'todo.title': 'task.title',
        '(todo)': '(task)',
        '(todo.id)': '(task.id)',
        'todo_id': 'task_id',
        'Todos': 'Tasks',
        'TODO ': 'TASK ',
        'todo ': 'task ',
        'todo"': 'task"',
        'todos"': 'tasks"',
    }

    for old, new in replacements.items():
        content = content.replace(old, new)
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

safe_replace(r'd:\Projects\Tracker\docs\CogniPlan.jsx')
safe_replace(r'd:\Projects\Tracker\docs\style.css')
safe_replace(r'd:\Projects\Tracker\docs\index-react.html')
print("Renaming complete.")
