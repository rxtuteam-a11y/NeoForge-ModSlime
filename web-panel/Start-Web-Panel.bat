@echo off
chcp 65001 >nul
title ModSlime Server - Web Control Panel (Radmin VPN)
cd /d "%~dp0\.."

echo ============================================================
echo   KHOI DONG WEB CONTROL PANEL - NEOFORGE MODSLIME SERVER
echo ============================================================
echo.
echo [1/2] Dang mo trinh duyet tai http://localhost:8080 ...
start "" http://localhost:8080

echo [2/2] Dang chay Web Panel (Nhan Ctrl+C hoac nut Tat Web Panel tren web de dung)...
echo.
where python >nul 2>&1
if %errorlevel%==0 (
    python web-panel\app.py
) else (
    py -3 web-panel\app.py
)

echo.
echo Web Panel da dung.
pause
