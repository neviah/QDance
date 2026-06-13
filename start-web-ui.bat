@echo off
setlocal

cd /d "%~dp0"

where opencode >nul 2>nul
if errorlevel 1 (
  echo OpenCode CLI was not found on PATH.
  echo Install OpenCode first, or start your backend manually with: opencode serve
  pause
  exit /b 1
)

start "OpenCode Backend" cmd /k "opencode serve"
start "OpenCode Web UI" cmd /k "npm run dev"

timeout /t 5 /nobreak >nul
start "" "http://localhost:5173"

endlocal