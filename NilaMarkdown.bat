@echo off
setlocal EnableExtensions

cd /d "%~dp0"
set "PORT=3000"
set "APP_URL=http://localhost:%PORT%/markdown"
set "SKIP_BUILD=0"

if /I "%~1"=="--no-build" set "SKIP_BUILD=1"
if /I "%~1"=="--help" goto help

where node.exe >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js 20 or newer is required.
  echo Download it from https://nodejs.org/
  pause
  exit /b 1
)

where pnpm.cmd >nul 2>&1
if errorlevel 1 (
  echo ERROR: pnpm is not installed.
  echo Run: corepack enable
  echo Then run this file again.
  pause
  exit /b 1
)

powershell.exe -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing -Uri '%APP_URL%' -TimeoutSec 2; if ($response.StatusCode -ge 200) { exit 0 } } catch {}; exit 1" >nul 2>&1
if not errorlevel 1 (
  echo NilaMarkdown Editor is already running.
  start "" "%APP_URL%"
  exit /b 0
)

if not exist "node_modules\.modules.yaml" (
  echo Installing dependencies...
  call pnpm install --frozen-lockfile
  if errorlevel 1 goto failure
)

if "%SKIP_BUILD%"=="0" (
  echo Building the production version...
  call pnpm build
  if errorlevel 1 goto failure
) else if not exist "apps\web\.next\BUILD_ID" (
  echo Production build was not found. Building it now...
  call pnpm build
  if errorlevel 1 goto failure
)

echo Starting NilaMarkdown Editor...
start "NilaMarkdown Editor" /D "%~dp0" cmd.exe /k "pnpm --filter web start -- -p %PORT%"

for /L %%I in (1,1,60) do (
  powershell.exe -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing -Uri '%APP_URL%' -TimeoutSec 2; if ($response.StatusCode -ge 200) { exit 0 } } catch {}; exit 1" >nul 2>&1
  if not errorlevel 1 goto ready
  >nul ping.exe -n 2 127.0.0.1
)

echo ERROR: The application did not start within 60 seconds.
pause
exit /b 1

:ready
echo NilaMarkdown Editor is ready at %APP_URL%
start "" "%APP_URL%"
exit /b 0

:failure
echo.
echo ERROR: NilaMarkdown Editor could not be prepared.
pause
exit /b 1

:help
echo Usage:
echo   NilaMarkdown.bat             Build and run the production version
echo   NilaMarkdown.bat --no-build  Run the existing production build
exit /b 0
