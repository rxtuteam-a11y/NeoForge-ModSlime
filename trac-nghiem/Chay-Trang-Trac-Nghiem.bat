@echo off
cd /d "%~dp0"
if not exist node_modules call npm install
start "" http://localhost:3000
node --no-warnings server\index.js
pause
