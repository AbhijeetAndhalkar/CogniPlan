@echo off
echo ==========================================
echo Starting FlowBoard / CogniPlan...
echo ==========================================

cd /d "d:\Projects\Tracker"

echo.
echo Activating Virtual Environment...
call .venv\Scripts\activate.bat

echo.
echo Starting FastAPI Server in the background...
cd backend
start "FlowBoard Server" cmd /k "python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000"

echo.
echo Waiting 3 seconds for server to start...
timeout /t 3 /nobreak >nul

echo.
echo Opening FlowBoard in your default browser...
start http://127.0.0.1:8000

echo.
echo All done! You can close this window now.
pause
