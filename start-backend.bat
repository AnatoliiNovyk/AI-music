@echo off
rem Start backend with explicit node path to avoid PowerShell shim issues
set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if not exist "%NODE_EXE%" (
  echo Node executable not found at %NODE_EXE%. Trying node from PATH...
  set "NODE_EXE=node"
)
cd /d "%~dp0server"
rem Provide a default API_KEY for development so server doesn't exit
set "API_KEY=dev-placeholder"
echo Starting backend on port 3001 (with API_KEY=%API_KEY%)...
"%NODE_EXE%" index.js