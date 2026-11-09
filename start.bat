@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul && (py server.py) || (python server.py)
pause
