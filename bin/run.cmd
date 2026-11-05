@echo off
REM Run a script using the harness's own JavaScript runtime.
REM
REM Windows counterpart of bin/run. A teacher has DeepSeek Harness; they do not
REM have Node.js. The application ships an Electron runtime that runs
REM Node-compatible scripts when ELECTRON_RUN_AS_NODE is set.
REM
REM Usage:  bin\run.cmd skills\spec-to-scheme\scripts\run.mjs --dir . --quiet ...

setlocal EnableExtensions

set "HERE=%~dp0"
set "APP="

REM Standard per-user installation, then machine-wide, then a portable copy.
if exist "%LOCALAPPDATA%\Programs\DeepSeek Harness\DeepSeek Harness.exe" set "APP=%LOCALAPPDATA%\Programs\DeepSeek Harness\DeepSeek Harness.exe"
if not defined APP if exist "%ProgramFiles%\DeepSeek Harness\DeepSeek Harness.exe" set "APP=%ProgramFiles%\DeepSeek Harness\DeepSeek Harness.exe"
if not defined APP if exist "%ProgramFiles(x86)%\DeepSeek Harness\DeepSeek Harness.exe" set "APP=%ProgramFiles(x86)%\DeepSeek Harness\DeepSeek Harness.exe"

if defined APP (
  set "ELECTRON_RUN_AS_NODE=1"
  "%APP%" %*
  exit /b %ERRORLEVEL%
)

where node >nul 2>nul
if %ERRORLEVEL% equ 0 (
  node %*
  exit /b %ERRORLEVEL%
)

echo Could not find DeepSeek Harness, so there is no JavaScript runtime to use. 1>&2
echo Install it from https://www.deepseek.com/en/harness/ and try again. 1>&2
exit /b 1
