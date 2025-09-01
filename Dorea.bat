@echo off
setlocal enabledelayedexpansion

:: Set UTF-8 encoding
chcp 65001 >nul

:: Log file
set LOGFILE=install_log.txt
echo [Start Time] %DATE% %TIME% > %LOGFILE%

echo.
echo ==================================================
echo    Dorea PDF AI System Installer
echo    KISTI Large-scale AI Research Center
echo ==================================================
echo.

:: STEP 1: Check Docker
echo [1/5] Checking Docker installation...
where docker >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not installed.
    echo Please install Docker Desktop from: https://docs.docker.com/get-docker/
    pause
    exit /b
)

docker compose version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Compose is not available.
    echo Please ensure Docker Desktop is running.
    pause
    exit /b
)
echo [OK] Docker environment ready

:: STEP 2: Check project files
echo.
echo [2/5] Checking project files...
if not exist "Dorea-backend" (
    echo [ERROR] Dorea-backend directory not found.
    echo Please ensure you are in the correct project directory.
    pause
    exit /b
)
if not exist "docker-compose.yml" (
    echo [ERROR] docker-compose.yml file not found.
    pause
    exit /b
)
echo [OK] Project files verified

:: STEP 3: Check ports
echo.
echo [3/5] Checking port availability...
set PORT_CONFLICT=0
for %%P in (8000 8001 11434) do (
    netstat -ano | findstr :%%P >nul 2>&1
    if !errorlevel! == 0 (
        echo [WARNING] Port %%P is in use - existing containers may be running
        set PORT_CONFLICT=1
    )
)
if !PORT_CONFLICT! == 1 (
    echo [INFO] To stop existing containers: docker compose down
    echo.
)

:: STEP 4: Select execution mode
echo [4/5] Select execution mode:
echo   1. Basic execution (Quick start - external network required)
echo   2. GPU acceleration support (external network required)
echo   3. Local Ollama integration (internal network / air-gapped required)
echo   4. GPU + Local Ollama integration (internal network / air-gapped required)
echo.
set /p MODE="Enter your choice [1-4]: "

if "%MODE%"=="" set MODE=1

:: STEP 5: Start services
echo.
echo [5/5] Starting Dorea services...

if "%MODE%"=="1" (
    echo Starting with pre-built image...
    docker compose -f docker-compose.hub.yml up -d
) else if "%MODE%"=="2" (
    echo Starting with pre-built image + GPU...
    docker compose -f docker-compose.hub.yml -f docker-compose.gpu.yml up -d
    if errorlevel 1 (
        echo [ERROR] Failed to start in GPU mode. Trying CPU mode...
        docker compose -f docker-compose.hub.yml up -d
    )
) else if "%MODE%"=="3" (
    echo Starting with pre-built image + Local Ollama...
    echo [WARNING] Please ensure local Ollama is running on port 11434!
    docker compose -f docker-compose.hub.yml -f docker-compose.local-ollama.yml up -d
) else if "%MODE%"=="4" (
    echo Starting with pre-built image + GPU + Local Ollama...
    echo [WARNING] Please ensure local Ollama is running on port 11434!
    docker compose -f docker-compose.hub.yml -f docker-compose.gpu.yml -f docker-compose.local-ollama.yml up -d
    if errorlevel 1 (
        echo [ERROR] Failed to start in GPU mode. Trying CPU mode with Local Ollama...
        docker compose -f docker-compose.hub.yml -f docker-compose.local-ollama.yml up -d
    )
) else (
    echo [ERROR] Invalid choice. Using default mode...
    docker compose -f docker-compose.hub.yml up -d
)

if errorlevel 1 (
    echo [ERROR] Failed to start services.
    echo Check the logs above for details.
    pause
    exit /b
)

:: STEP 6: Completion message
echo.
echo ==================================================
echo    Installation Complete!
echo ==================================================
echo.
echo Web Interface:     http://localhost:8000
echo API Documentation: http://localhost:8000/docs
echo HURIDOCS API:      http://localhost:8001
echo Ollama API:        http://localhost:11434
echo.
echo ==================================================
echo    Development Tips:
echo ==================================================
echo - Restart backend:  docker compose restart pdf-ai
echo - Restart all:      docker compose restart  
echo - View logs:        docker compose logs -f
echo - Stop services:    docker compose down
echo.

:: Log container status
docker compose ps >> %LOGFILE%

echo Installation log saved to: %LOGFILE%
echo.
echo Press any key to exit...
pause >nul