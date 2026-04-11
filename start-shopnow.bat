@echo off
setlocal
title ShopNow Server

set "PROJECT_DIR=C:\Users\stefa\Desktop\sito"
set "SYSTEM_NODE=C:\Program Files\nodejs\node.exe"
if not exist "%SYSTEM_NODE%" (
    echo Node.js non trovato in "%SYSTEM_NODE%".
    echo Installa Node.js oppure aggiorna questo file con il percorso corretto.
    pause
    exit /b 1
)

cd /d "%PROJECT_DIR%"

for /f "tokens=5" %%P in ('C:\Windows\System32\netstat.exe -ano ^| C:\Windows\System32\findstr.exe LISTENING ^| C:\Windows\System32\findstr.exe :3000') do (
    echo Server gia attivo su http://localhost:3000
    start "" http://localhost:3000
    exit /b 0
)

echo Avvio server ShopNow su http://localhost:3000 ...
start "" http://localhost:3000
"%SYSTEM_NODE%" server.js
