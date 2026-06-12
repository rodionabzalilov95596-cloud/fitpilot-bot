@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   Загрузка проекта на GitHub
echo ========================================
echo.

if not exist ".env" (
    echo Создайте токен: https://github.com/settings/tokens
    echo Права: repo
    echo Добавьте в .env строку: GITHUB_TOKEN=ghp_...
    pause
    exit /b 1
)

findstr /B /C:"GITHUB_TOKEN=" .env >nul 2>&1
if errorlevel 1 (
    echo В .env нет GITHUB_TOKEN=
    echo 1. Откройте https://github.com/settings/tokens
    echo 2. Generate new token ^(classic^), галочка repo
    echo 3. Добавьте в .env: GITHUB_TOKEN=ghp_ваш_токен
    pause
    exit /b 1
)

echo Загружаю файлы в rodionabzalilov95596-cloud/fitpilot-bot ...
node scripts/push-to-github.mjs
if errorlevel 1 (
    echo.
    echo Ошибка загрузки.
    pause
    exit /b 1
)

echo.
echo Готово! Запускаю деплой на Render...
start https://render.com/deploy?repo=https://github.com/rodionabzalilov95596-cloud/fitpilot-bot
pause
