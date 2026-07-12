@echo off
setlocal
cd /d "%~dp0"
set "PYTHON=C:\Users\patsl\AppData\Local\Python\pythoncore-3.14-64\pythonw.exe"
if not exist "%PYTHON%" set "PYTHON=pythonw.exe"
start "DeutschZ Settings Sync" "%PYTHON%" "%~dp0deutschz_sync.py"
