@echo off
REM Double-click entry point for Windows. It is a doorway to scripts\up.ps1, not a second copy
REM of the install: every decision about ports, secrets and containers is made there, so this
REM file stays thin enough that it cannot disagree with the other platforms.
REM
REM No port is passed. The port's one authoritative home is .env, and up.ps1 already defaults
REM to 3000 and defers to .env when it exists. Naming it again here would pin a value that is
REM meant to be a setting.

REM Explorer starts a double-clicked file in whatever directory it feels like, so anchor to the
REM one this file lives in before using any relative path.
cd /d "%~dp0"

TITLE DeckTrail Local Studio
echo ===================================================
echo Starting DeckTrail Local Environment...
echo ===================================================
echo.
echo Please wait while the application boots up.
echo Do not close this window while you are using DeckTrail.
echo.

powershell -ExecutionPolicy Bypass -File "scripts\up.ps1"

echo.
echo DeckTrail has stopped.
pause
