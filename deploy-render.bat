@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   ФитПилот — деплой на Render
echo ========================================
echo.
echo 1. Сейчас откроется сайт Render в браузере.
echo 2. Войдите через GitHub (та же учётка, куда залили проект).
echo 3. New -^> Blueprint -^> выберите репозиторий fitpilot-bot.
echo 4. Render прочитает render.yaml и сам настроит build/start.
echo 5. Введите секреты: MAX_BOT_TOKEN, YANDEX_API_KEY и т.д.
echo 6. Нажмите Apply / Deploy.
echo.
echo После деплоя скопируйте URL сервиса и вставьте в MAX:
echo   https://ВАШ-СЕРВИС.onrender.com/miniapp/schedule/
echo.

start https://dashboard.render.com/blueprints/new

pause
