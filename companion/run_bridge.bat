@echo off
title Chrome Live Caption Bridge - Video Notes
cd /d "%~dp0\.."
echo ==========================================================
echo Starting Chrome Live Caption Bridge on ws://127.0.0.1:8765
echo ==========================================================
echo.
echo Make sure Chrome Live Caption is enabled in:
echo chrome://settings/accessibility
echo.
python companion\caption_bridge.py
pause

