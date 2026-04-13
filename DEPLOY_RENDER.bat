@echo off
setlocal enabledelayedexpansion

echo.
echo ============================================
echo     ShopNow - Deploy su Render.com
echo ============================================
echo.

echo Passaggi per il deploy:
echo.
echo 1. Vai su https://render.com
echo 2. Clicca "New +"  e seleziona "Web Service"
echo 3. Scegli "Deploy from a Git repository"
echo 4. Connetti il repository GitHub: stefano-1990/shopnow
echo 5. Compila i campi:
echo    - Name: shopnow
echo    - Environment: Node
echo    - Build Command: npm install
echo    - Start Command: npm start
echo 6. Clicca "Deploy"
echo.
echo Il deploy iniziera automaticamente e il sito sarà online!
echo.

start https://render.com

echo.
pause
