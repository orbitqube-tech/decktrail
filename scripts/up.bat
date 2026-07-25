@echo off
rem Bring DeckTrail up from a fresh clone, on Windows, from cmd.exe or a double-click.
rem
rem This is a doorway, not a second implementation: the work is in up.ps1, so there is one place
rem where the install logic lives and Windows cannot drift from it. Arguments pass straight through,
rem so `scripts\up.bat -Port 3900 -Gateway` behaves exactly like the PowerShell call.
rem
rem -ExecutionPolicy Bypass applies to this one process only. It does not change any machine or
rem user policy, which matters because asking somebody to loosen a security setting to install
rem software is not a reasonable thing to ask.

setlocal
cd /d "%~dp0.."

where pwsh >nul 2>&1
if %ERRORLEVEL%==0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "scripts\up.ps1" %*
) else (
  where powershell >nul 2>&1
  if %ERRORLEVEL%==0 (
    powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\up.ps1" %*
  ) else (
    echo.
    echo PowerShell was not found on this machine, which is unusual on Windows.
    echo Install PowerShell 7 from https://aka.ms/powershell and run this again.
    exit /b 1
  )
)

exit /b %ERRORLEVEL%
