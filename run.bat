@echo off
setlocal
cd /d "%~dp0"
set "JAVA21=D:\Legacy\Minecraft\jre\java-runtime-delta\windows-x64\java-runtime-delta\bin\java.exe"
if not exist "%JAVA21%" set "JAVA21=java"
"%JAVA21%" @user_jvm_args.txt @libraries/net/neoforged/neoforge/21.1.267/win_args.txt nogui %*
if errorlevel 1 pause

