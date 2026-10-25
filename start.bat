@echo off
rem Pasco Flood Screening Tool - Windows launcher
cd /d "%~dp0"
if not exist ".venv" (
  echo First run: setting up the environment. This takes a few minutes...
  python setup_env.py || goto :err
)
".venv\Scripts\python.exe" run.py
goto :eof
:err
echo Setup failed. Make sure Python 3.11+ is installed and on PATH.
pause
