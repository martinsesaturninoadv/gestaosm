@echo off
chcp 65001 >nul
REM ============================================================
REM  Organizador de arquivos de clientes - Martins & Saturnino
REM  Ajuste as duas pastas abaixo e de dois cliques neste arquivo.
REM ============================================================
set ENTRADA=%USERPROFILE%\Downloads\Clientes
set DESTINO=%USERPROFILE%\Documents\Clientes

echo Simulacao (nada sera movido ainda):
echo.
python "%~dp0organizar_clientes.py" --entrada "%ENTRADA%" --destino "%DESTINO%" --simular
if errorlevel 1 goto fim
echo.
set /p OK=Confirmar e mover os arquivos? (S/N) 
if /I "%OK%"=="S" python "%~dp0organizar_clientes.py" --entrada "%ENTRADA%" --destino "%DESTINO%"
:fim
echo.
pause
