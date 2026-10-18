@echo off
echo Stopping background Chrome Live Caption Bridge processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8765 ^| findstr LISTENING') do (
    echo Terminating PID %%a on port 8765...
    taskkill /F /PID %%a >nul 2>&1
)
echo Caption bridge stopped.
