@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo [dev.bat] Перед запуском: venv + pip (scripts\ensure-backend-venv.bat), затем backend и Tauri.
echo [dev.bat] Ollama не открываем отдельным окном — запустите её один раз из меню Пуск
echo           ^(иконка в трее^), если локальные модели не отвечают.
echo.

call "%~dp0scripts\ensure-backend-venv.bat"
if errorlevel 1 (
  pause
  exit /b 1
)

start "SmartOverlay — backend" cmd /k "%~dp0scripts\dev-backend.bat"

timeout /t 2 /nobreak >nul

if not exist "node_modules\" (
  echo [dev.bat] Нет node_modules. Один раз: npm install
  pause
  exit /b 1
)

start "SmartOverlay — Tauri dev" cmd /k "%~dp0scripts\dev-tauri.bat"

echo Открыты 2 окна: backend и Tauri dev. Закройте их отдельно или Ctrl+C в каждом.
exit /b 0
