@echo off
cd /d "%~dp0\.."
start http://localhost:8080
python web-panel\app.py
pause
