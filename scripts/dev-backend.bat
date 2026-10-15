@echo off
cd /d "%~dp0..\backend"
call venv\Scripts\activate.bat
pip install -q -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 18321 --reload
