@echo off
chcp 65001 >nul
title Mo Cong Firewall cho ModSlime Server (Radmin VPN)

:: Tu dong yeu cau quyen Administrator neu chua co
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Dang yeu cau quyen Administrator de mo cong Windows Firewall...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo ============================================================
echo   MO CONG WINDOWS FIREWALL CHO MODSLIME + RADMIN VPN
echo ============================================================
echo.
echo Dang cau hinh cho phep ban be ket noi qua Radmin VPN:
echo   - Cong 25565 (TCP + UDP): Minecraft NeoForge Server
echo   - Cong 8080  (TCP)      : Web Control Panel (Bat/Tat Server)
echo.

netsh advfirewall firewall delete rule name="ModSlime Minecraft Server TCP (25565)" >nul 2>&1
netsh advfirewall firewall delete rule name="ModSlime Minecraft Server UDP (25565)" >nul 2>&1
netsh advfirewall firewall delete rule name="ModSlime Web Control Panel TCP (8080)" >nul 2>&1

netsh advfirewall firewall add rule name="ModSlime Minecraft Server TCP (25565)" dir=in action=allow protocol=TCP localport=25565 profile=any
netsh advfirewall firewall add rule name="ModSlime Minecraft Server UDP (25565)" dir=in action=allow protocol=UDP localport=25565 profile=any
netsh advfirewall firewall add rule name="ModSlime Web Control Panel TCP (8080)" dir=in action=allow protocol=TCP localport=8080 profile=any

echo.
echo ============================================================
echo   HOAN TAT! DA MO CONG 25565 VA 8080 THANH CONG!
echo   Ban be trong cung mang Radmin VPN da co the truy cap:
echo     - Web dieu khien : http://^<IP-Radmin^>:8080
echo     - Game Minecraft : ^<IP-Radmin^>:25565
echo ============================================================
echo.
pause
