@echo off
rem Start frontend (runs npm install then npm run dev)
set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
if not exist "%NPM_CMD%" (
  echo npm.cmd not found at %NPM_CMD%. Trying npm from PATH...
  set "NPM_CMD=npm"
)
cd /d "%~dp0"
echo Installing frontend dependencies (if needed)...
"%NPM_CMD%" install
echo Starting Vite dev server...
"%NPM_CMD%" run dev