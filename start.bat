@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   ФитПилот — запуск VK-бота
echo ========================================
echo.

where npm >nul 2>&1
if errorlevel 1 (
    echo [ОШИБКА] Node.js не найден.
    echo.
    echo Установите Node.js с сайта: https://nodejs.org
    echo Выберите версию LTS, установите, перезапустите терминал.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo Устанавливаю зависимости (первый раз, 1-2 минуты)...
    call npm install
    if errorlevel 1 (
        echo [ОШИБКА] npm install не удался.
        pause
        exit /b 1
    )
    echo.
)

if not exist ".env" (
    echo [ВНИМАНИЕ] Создайте файл .env и укажите VK_GROUP_ID=число
    echo ID из адреса группы: vk.com/club123456789 -^> VK_GROUP_ID=123456789
    echo.
)

echo Бот запускается. Окно НЕ закрывайте — бот работает пока оно открыто.
echo Напишите сообщение вашему сообществу ВК в личные сообщения.
echo Для остановки нажмите Ctrl+C
echo.

call npm run dev

pause
