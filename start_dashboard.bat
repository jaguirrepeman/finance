@echo off
echo ==========================================================
echo INICIANDO PORTFOLIO TRACKER DASHBOARD
echo ==========================================================
echo.

echo [1/4] Verificando dependencias del backend...
cd backend
call poetry install --only main
cd ..

echo.
echo [2/4] Instalando dependencias del frontend...
cd frontend
call npm.cmd install --silent
echo.

echo [3/4] Construyendo el frontend (Vite)...
call npm.cmd run build
cd ..

echo.
echo [4/4] Levantando el Motor de Datos (FastAPI)...
cd backend
start cmd /k "poetry run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"
cd ..

echo.
echo Esperando a que el servidor despierte...
timeout /t 3 /nobreak >nul

echo Abriendo el navegador...
start http://127.0.0.1:8000

echo.
echo Todo listo! Se ha abierto una terminal con el servidor.
echo Para apagar el dashboard, cierra la terminal.
timeout /t 5 >nul
exit
