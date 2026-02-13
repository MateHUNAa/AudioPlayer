@echo off
setlocal

set "PATH=C:\nodejs;%PATH%"

cd /d "%~dp0android"

echo ========================================
echo  Cleaning previous build...
echo ========================================
call gradlew.bat clean
if errorlevel 1 (
    echo Clean failed!
    pause
    exit /b 1
)

echo ========================================
echo  Building release APK...
echo ========================================
call gradlew.bat assembleRelease
if errorlevel 1 (
    echo Build failed!
    pause
    exit /b 1
)

echo ========================================
echo  Build successful!
echo  APK: android\app\build\outputs\apk\release\app-release.apk
echo ========================================

pause
exit /b 0
