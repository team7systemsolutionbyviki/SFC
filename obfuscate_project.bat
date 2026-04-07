@echo off
echo ==========================================
echo    SFC FOOD - PROJECT OBFUSCATOR
echo ==========================================
echo Starting Full Source Code Encryption...

:: Create output directory
if not exist dist mkdir dist
if not exist dist\js mkdir dist\js
if not exist dist\admin mkdir dist\admin
if not exist dist\customer mkdir dist\customer
if not exist dist\css mkdir dist\css

:: Obfuscate JS Files
echo.
echo [1/3] Encrypting Javascript logic...
javascript-obfuscator js --output dist/js --compact true --self-defending true --string-array true --string-array-encoding ["base64"] --string-array-threshold 1
javascript-obfuscator admin --output dist/admin --compact true
javascript-obfuscator customer --output dist/customer --compact true
javascript-obfuscator service-worker.js --output dist/service-worker.js --compact true

:: Copy HTML and CSS (Optional: Can also be minified)
echo [2/3] Copying Assets...
copy index.html dist\index.html /Y
copy manifest.json dist\manifest.json /Y
xcopy css dist\css /E /I /Y
xcopy sfc-menu dist\sfc-menu /E /I /Y

echo.
echo [3/3] DONE! Your encrypted project is in the 'dist' folder.
echo ==========================================
pause
