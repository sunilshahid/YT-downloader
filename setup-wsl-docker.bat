@echo off
title YTDLnis Web - Lightweight WSL2 & Docker Setup

:: Check for administrative rights
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo =====================================================================
echo  YTDLnis Web - Lightweight WSL2 and Docker Virtualization Setup
echo =====================================================================
echo.
echo [1/5] Enabling Windows Virtual Machine Platform...
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

echo.
echo [2/5] Enabling Windows Subsystem for Linux (WSL)...
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart

echo.
echo [3/5] Updating WSL kernel...
wsl.exe --update

echo.
echo [4/5] Setting WSL default version to 2...
wsl.exe --set-default-version 2

echo.
echo [5/5] Installing lightweight Debian Linux distribution...
wsl.exe --install -d Debian --no-launch

echo.
echo =====================================================================
echo [SUCCESS] Windows Virtualization & Lightweight WSL Debian Configured!
echo.
echo IMPORTANT: If this is the first time enabling Virtual Machine Platform,
echo please restart your computer once so Windows can boot with the hypervisor.
echo.
echo After restart:
echo 1. Launch Docker Desktop
echo 2. Run: docker build -t ytdl-downloader .
echo 3. Run: docker run -d -p 8000:8000 --name ytdl-app ytdl-downloader
echo =====================================================================
echo.
pause
