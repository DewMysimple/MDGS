@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 (
  echo [MDGS] Cannot open the project directory.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [MDGS] Node.js is required. Install a supported Node.js LTS release, then try again.
  goto failed
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [MDGS] npm is missing from PATH. Repair the Node.js installation, then try again.
  goto failed
)
node -e "const major=Number(process.versions.node.split('.')[0]); process.exit(major===18 || major===20 || major>=22 ? 0 : 1)"
if errorlevel 1 (
  echo [MDGS] This project requires Node.js 18, 20, or 22 and later.
  goto failed
)
if not exist "node_modules\.bin\vite.cmd" (
  echo [MDGS] Installing the locked project dependencies...
  call npm.cmd ci
  if errorlevel 1 goto failed
)

echo [MDGS] Starting the project. The browser will open the actual available address printed below.
call npm.cmd run dev -- --open %*
set "taskExitCode=%ERRORLEVEL%"
if not "%taskExitCode%"=="0" echo [MDGS] Startup failed. Review the error above.
goto finished

:failed
set "taskExitCode=1"

:finished
popd
pause
exit /b %taskExitCode%
