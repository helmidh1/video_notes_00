@echo off
title Video Notes - Chrome Live Caption Bridge
echo ========================================================
echo  Video Notes - Chrome Live Caption Bridge
echo ========================================================
echo Starting local WebSocket bridge on ws://127.0.0.1:8765...
echo Make sure Chrome Live Caption is enabled in:
echo chrome://settings/accessibility
echo.
python "%~dp0caption_bridge.py"
pause
