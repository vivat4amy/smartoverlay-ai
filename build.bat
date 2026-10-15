@echo off
setlocal
chcp 65001 >nul

rem ============================================================
rem  SmartOverlay AI - build Windows installer (.msi and .exe)
rem ============================================================

cd /d "%~dp0"

rem ---- Kill running instance (it locks the sidecar exe during build) ----------
echo Closing any running SmartOverlay instance ...
taskkill /F /IM smartoverlay-v2.exe >nul 2>&1
taskkill /F /IM smartoverlay-backend.exe >nul 2>&1
timeout /t 1 /nobreak >nul

echo [1/5] Checking prerequisites ...
where node  >nul 2>&1 || ( echo [ERROR] Node.js not found & goto :fail )
where cargo >nul 2>&1 || ( echo [ERROR] Rust/cargo not found & goto :fail )
echo       node  OK
echo       cargo OK

rem ---- npm install ------------------------------------------------------------
if not exist node_modules (
    echo [2/5] npm install ...
    call npm install --no-audit --no-fund
    if errorlevel 1 ( echo [ERROR] npm install failed & goto :fail )
) else (
    echo [2/5] node_modules OK, skipping npm install
)

rem ---- Python backend ---------------------------------------------------------
echo [3/5] Building Python backend with PyInstaller ...

set "PY_EXE=%~dp0backend\venv\Scripts\python.exe"
if not exist "%PY_EXE%" (
    echo       venv not found, trying system python ...
    where python >nul 2>&1
    if errorlevel 1 ( echo [ERROR] Python not found. Install Python 3.10+ & goto :fail )
    set "PY_EXE=python"
)

echo       Python: %PY_EXE%

if not exist "src-tauri\binaries" mkdir "src-tauri\binaries"

"%PY_EXE%" -c "import PyInstaller" >nul 2>&1
if errorlevel 1 (
    echo       Installing PyInstaller ...
    "%PY_EXE%" -m pip install pyinstaller
    if errorlevel 1 ( echo [ERROR] Failed to install PyInstaller & goto :fail )
)

pushd backend
echo       Installing Python dependencies ...
"%PY_EXE%" -m pip install -r requirements.txt -q --no-warn-script-location
echo       Dependencies OK

echo       Running PyInstaller ...
"%PY_EXE%" -m PyInstaller smartoverlay-backend.spec --clean --noconfirm

rem Note: PyInstaller may return exit code 1 due to warnings (e.g. Pydantic on Python 3.14)
rem       even when the build succeeds. Check for the output file instead.
if not exist "dist\smartoverlay-backend.exe" (
    popd
    echo [ERROR] dist\smartoverlay-backend.exe not created - PyInstaller actually failed
    goto :fail
)
echo       PyInstaller OK
copy /Y "dist\smartoverlay-backend.exe" "..\src-tauri\binaries\smartoverlay-backend-x86_64-pc-windows-msvc.exe" >nul
echo       Sidecar copied OK
popd

rem ---- Tauri build ------------------------------------------------------------
echo [4/5] Running tauri build ...
call npm run tauri build 2> build-errors.log
if errorlevel 1 (
    echo [ERROR] tauri build failed. Last errors:
    echo ---
    type build-errors.log
    echo ---
    goto :fail
)

rem ---- Done -------------------------------------------------------------------
echo [5/5] Сборка завершена.
echo.
echo  Установщики:  src-tauri\target\release\bundle\
echo  Быстрый запуск без установки: двойной клик по SmartOverlay.bat
echo  Или напрямую:  src-tauri\target\release\smartoverlay-v2.exe
echo.
goto :end

:fail
echo.
echo ============================================================
echo  BUILD FAILED - scroll up to see the error
echo ============================================================
pause

:end
endlocal
