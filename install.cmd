@echo off
REM Install the edu-pack skills into DeepSeek Harness.
REM
REM Windows counterpart of install.command. Runs install.mjs with the harness's
REM own runtime, so Node.js is not required.
REM
REM Usage: double-click, or:  install.cmd --dsh-home "%USERPROFILE%\.dsh"

setlocal EnableExtensions
set "HERE=%~dp0"
set "APP="

if exist "%LOCALAPPDATA%\Programs\DeepSeek Harness\DeepSeek Harness.exe" set "APP=%LOCALAPPDATA%\Programs\DeepSeek Harness\DeepSeek Harness.exe"
if not defined APP if exist "%ProgramFiles%\DeepSeek Harness\DeepSeek Harness.exe" set "APP=%ProgramFiles%\DeepSeek Harness\DeepSeek Harness.exe"
if not defined APP if exist "%ProgramFiles(x86)%\DeepSeek Harness\DeepSeek Harness.exe" set "APP=%ProgramFiles(x86)%\DeepSeek Harness\DeepSeek Harness.exe"

if defined APP (
  set "ELECTRON_RUN_AS_NODE=1"
  "%APP%" "%HERE%install.mjs" %*
  set "CODE=%ERRORLEVEL%"
) else (
  where node >nul 2>nul
  if %ERRORLEVEL% neq 0 (
    echo DeepSeek Harness was not found, and Node.js is not installed. 1>&2
    echo Install DeepSeek Harness from https://www.deepseek.com/en/harness/ and run this again. 1>&2
    pause
    exit /b 1
  )
  node "%HERE%install.mjs" %*
  set "CODE=%ERRORLEVEL%"
)

echo.
pause
exit /b %CODE%
