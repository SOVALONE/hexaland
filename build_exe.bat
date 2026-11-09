@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Hexaland - build exe

set PY=python
where py >nul 2>nul && set PY=py

echo.
echo [1/3] Встановлюю PyInstaller...
%PY% -m pip install --upgrade pyinstaller
if errorlevel 1 goto fail

echo.
echo [2/3] Збираю Hexaland.exe (це займе хвилину)...
%PY% -m PyInstaller --noconfirm --clean --onefile --console ^
  --name Hexaland ^
  --icon assets\hexaland.ico ^
  --add-data "web;web" ^
  --add-data "assets;assets" ^
  server.py
if errorlevel 1 goto fail

copy /y dist\Hexaland.exe Hexaland.exe >nul
echo.
echo [3/3] Готово!  %cd%\Hexaland.exe
echo Цей один файл можна копіювати куди завгодно і запускати подвійним кліком.
echo.
pause
exit /b 0

:fail
echo.
echo Помилка збирання. Перевір, що встановлено Python 3.8+ і є інтернет для pip.
pause
exit /b 1
