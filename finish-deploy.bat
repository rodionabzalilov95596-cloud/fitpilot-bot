@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   ФитПилот — финиш деплоя на Render
echo ========================================
echo.

node scripts/finish-render-deploy.mjs
if %errorlevel%==0 goto ok
if %errorlevel%==2 goto need_workflow

echo.
echo Ошибка. Открою Blueprint Render в браузере.
goto blueprint

:need_workflow
echo.
echo Нужен workflow на GitHub (1 раз):
echo 1. Откройте файл render-deploy-workflow.yml в репозитории
echo 2. Скопируйте содержимое в .github/workflows/render-deploy.yml
echo 3. Снова запустите finish-deploy.bat
echo.
start https://github.com/rodionabzalilov95596-cloud/fitpilot-bot/blob/main/render-deploy-workflow.yml
start https://github.com/rodionabzalilov95596-cloud/fitpilot-bot/new/main?filename=.github/workflows/render-deploy.yml
goto end

:blueprint
start https://render.com/deploy?repo=https://github.com/rodionabzalilov95596-cloud/fitpilot-bot

:ok
echo.
echo Секреты уже в GitHub Actions. После workflow — деплой автоматический.
echo URL бота: https://fitpilot-bot.onrender.com
echo Miniapp MAX: https://fitpilot-bot.onrender.com/miniapp/schedule/

:end
pause
