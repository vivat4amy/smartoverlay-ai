@echo off
setlocal
chcp 65001 >nul

rem ============================================================
rem  SmartOverlay AI — единая точка входа (двойной клик)
rem  1) Если есть release .exe — запускает приложение целиком
rem     (Python-backend идёт встроенным sidecar, отдельно uvicorn не нужен).
rem  2) Иначе — режим разработки: dev.bat (venv + tauri dev).
rem ============================================================

cd /d "%~dp0"

set "REL=%~dp0src-tauri\target\release\smartoverlay-v2.exe"
if exist "%REL%" (
    echo [SmartOverlay] Запуск собранного приложения ^(backend внутри^)...
    start "" "%REL%"
    goto :eof
)

echo [SmartOverlay] Не найден релиз: %REL%
echo           Соберите один раз: build.bat
echo           Либо сейчас будет режим разработки.
echo.
call "%~dp0dev.bat"

endlocal
