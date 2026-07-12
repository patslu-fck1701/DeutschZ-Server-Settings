@echo off
setlocal
cd /d "%~dp0"
set "PYTHON_CONSOLE=C:\Users\patsl\AppData\Local\Python\pythoncore-3.14-64\python.exe"
set "PYTHON=C:\Users\patsl\AppData\Local\Python\pythoncore-3.14-64\pythonw.exe"
if not exist "%PYTHON_CONSOLE%" set "PYTHON_CONSOLE=python.exe"
if not exist "%PYTHON%" set "PYTHON=pythonw.exe"
"%PYTHON_CONSOLE%" -c "import tkinterdnd2" >nul 2>&1 || "%PYTHON_CONSOLE%" -m pip install -r "%~dp0requirements.txt"
start "DeutschZ Settings Sync" "%PYTHON%" "%~dp0deutschz_sync.py"
