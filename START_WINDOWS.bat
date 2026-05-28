@echo off
title Tekora V15 Real Price Engine
python -m venv .venv
call .venv\Scripts\activate
pip install -r requirements.txt
set FLASK_APP=app.py
python app.py
pause
