@echo off
setlocal EnableExtensions

set "PROJECT_DIR=%~dp0"
set "PORT=3000"
set "INTERACTIVE=0"

if "%~1"=="" (
  set "INTERACTIVE=1"
  goto menu
)

if /I "%~1"=="start" goto start_server
if /I "%~1"=="stop" goto stop_server
if /I "%~1"=="restart" goto restart_server
if /I "%~1"=="status" goto status_server
goto usage

:menu
cls
echo ========================================
echo       TaminLibrary Development Server
echo ========================================
echo.
echo   1. Start
echo   2. Stop
echo   3. Restart
echo   4. Status
echo   5. Exit
echo.
choice /C 12345 /N /M "Select an option [1-5]: "
if errorlevel 5 goto end
if errorlevel 4 goto status_server
if errorlevel 3 goto restart_server
if errorlevel 2 goto stop_server
if errorlevel 1 goto start_server

:start_server
call :get_server_pid
if defined SERVER_PIDS (
  echo Server is already running on http://localhost:%PORT%/markdown
  goto finish
)

where pnpm.cmd >nul 2>&1
if errorlevel 1 (
  echo ERROR: pnpm was not found in PATH.
  goto failure
)

echo Starting server...
start "TaminLibrary Server" /D "%PROJECT_DIR%" cmd /k "pnpm --filter web dev"

for /L %%I in (1,1,30) do (
  call :get_server_pid
  if defined SERVER_PIDS goto started
  >nul ping.exe -n 2 127.0.0.1
)

echo ERROR: Server did not become ready within 30 seconds.
goto failure

:started
echo Server is running on http://localhost:%PORT%/markdown
goto finish

:stop_server
call :get_server_pid
if not defined SERVER_PIDS (
  echo Server is already stopped.
  goto finish
)

echo Stopping server...
call :kill_server
call :get_server_pid
if defined SERVER_PIDS (
  echo ERROR: Could not stop process: %SERVER_PIDS%
  goto failure
)
echo Server stopped.
goto finish

:restart_server
call :get_server_pid
if defined SERVER_PIDS (
  echo Stopping server...
  call :kill_server
)
goto start_server

:status_server
call :get_server_pid
if defined SERVER_PIDS (
  echo Server is running on http://localhost:%PORT%/markdown
  echo Process ID: %SERVER_PIDS%
) else (
  echo Server is stopped.
)
goto finish

:get_server_pid
set "SERVER_PIDS="
for /F "usebackq delims=" %%P in (`powershell.exe -NoProfile -Command "$item = @(Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue)[0]; if ($null -ne $item) { $item.OwningProcess }"`) do set "SERVER_PIDS=%%P"
exit /B 0

:kill_server
for %%P in (%SERVER_PIDS%) do taskkill.exe /PID %%P /T /F >nul 2>&1
>nul ping.exe -n 2 127.0.0.1
exit /B 0

:usage
echo Usage: %~nx0 [start^|stop^|restart^|status]
goto failure

:failure
if "%INTERACTIVE%"=="1" pause
exit /B 1

:finish
if "%INTERACTIVE%"=="1" pause
exit /B 0

:end
endlocal
exit /B 0
