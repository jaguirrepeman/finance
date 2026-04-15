@echo off
echo ==========================================================
echo INICIANDO PORTFOLIO TRACKER DASHBOARD (Modo Premium)
echo ==========================================================
echo.
echo Verificando dependencias del servidor...
cd backend
call poetry install

echo.
echo Levantando el Motor de Datos (FastAPI)...
start cmd /k "poetry run uvicorn app.main:app --host 127.0.0.1 --port 8000"

echo.
echo Esperando a que el servidor despierte...
timeout /t 3 /nobreak >nul

echo Abriendo el navegador...
start http://127.0.0.1:8000

echo.
echo Todo listo! Se ha abierto otra ventana negra con el servidor.
echo Para apagar el dashboard, simplemente cierra ESA ventana negra.
timeout /t 5 >nul
exit
