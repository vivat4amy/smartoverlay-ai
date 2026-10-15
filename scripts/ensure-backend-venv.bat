@echo off
setlocal EnableExtensions
rem Создаёт backend\venv при отсутствии и ставит зависимости только если
rem requirements.txt изменился (сравниваем хэш файла).
set "ROOT=%~dp0.."
cd /d "%ROOT%\backend"
if errorlevel 1 exit /b 1

if exist "venv\Scripts\activate.bat" goto check_hash
echo [SmartOverlay] Создаю Python venv в backend\venv ...
where python >nul 2>&1
if errorlevel 1 (
  echo [SmartOverlay] Ошибка: в PATH нет python. Установите Python 3.11+ с python.org
  exit /b 1
)
python -m venv venv
if errorlevel 1 (
  echo [SmartOverlay] Не удалось создать venv.
  exit /b 1
)
goto install

:check_hash
rem Считаем хэш через Python — надёжнее чем certutil с кодировками
for /f "delims=" %%H in ('python -c "import hashlib,sys; print(hashlib.md5(open(\"requirements.txt\",\"rb\").read()).hexdigest())"') do set "REQ_HASH=%%H"
set "HASH_FILE=venv\.req_hash"
set "SAVED_HASH="
if exist "%HASH_FILE%" set /p SAVED_HASH=<"%HASH_FILE%"

if "%REQ_HASH%"=="%SAVED_HASH%" (
  echo [SmartOverlay] Зависимости актуальны, пропускаем pip install.
  call "venv\Scripts\activate.bat"
  exit /b 0
)
echo [SmartOverlay] requirements.txt изменился, обновляю зависимости...

:install
call "venv\Scripts\activate.bat"
if errorlevel 1 exit /b 1
python -m pip install -q --upgrade pip

pip show torch >nul 2>&1
if errorlevel 1 (
  echo [SmartOverlay] Устанавливаю PyTorch CPU ...
  pip install -q torch --index-url https://download.pytorch.org/whl/cpu
)

pip install -q -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu
if errorlevel 1 (
  echo [SmartOverlay] Ошибка pip install.
  exit /b 1
)

for /f "delims=" %%H in ('python -c "import hashlib; print(hashlib.md5(open(\"requirements.txt\",\"rb\").read()).hexdigest())"') do set "REQ_HASH=%%H"
echo %REQ_HASH%>"venv\.req_hash"

echo [SmartOverlay] Зависимости backend готовы.
exit /b 0
