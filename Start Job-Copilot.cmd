@echo off
rem Double-click to start Job-Copilot (same as `npm start` in this folder).
rem Close this window, or press Ctrl+C, to stop it.
title Job-Copilot
cd /d "%~dp0"
call npm start
rem Keep the window open after an error, so the message can be read.
if errorlevel 1 pause
