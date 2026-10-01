@echo off
setlocal
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
if not exist "%~dp0AgentWorlds.exe" (
  echo [!] AgentWorlds.exe not found next to this script
  pause
  exit /b 1
)
start "" "%~dp0AgentWorlds.exe"
endlocal
