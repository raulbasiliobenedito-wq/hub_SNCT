@echo off
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Preparando o Hub Launcher pela primeira vez...
  call npm install
)
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
