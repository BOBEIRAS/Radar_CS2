@echo off
chcp 65001 >nul
title CS2 Web Radar - Launcher
color 0A

:: 1. Garantir Privilegios de Administrador
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [i] A solicitar privilegios de Administrador...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList '/c call `\"\"%~f0\"\"' -Verb RunAs" 2>nul
    if %errorlevel% neq 0 (
        echo.
        echo  [AVISO] Nao foi possivel solicitar elevacao automatica.
        echo  Clica com o botao direito em 'StartRadar.bat' e escolhe 'Executar como Administrador'.
        echo.
        pause
    )
    exit /b
)

:: Fixar diretorio de trabalho na pasta do script
cd /d "%~dp0"
set "ROOT_DIR=%~dp0"

cls
echo ===================================================================
echo     CS2 WEB RADAR - LAUNCHER
echo ===================================================================
echo.

:: 2. Verificar se o Node.js esta instalado
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao esta instalado ou nao esta no PATH!
    echo.
    echo Por favor instala o Node.js em: https://nodejs.org/
    echo Depois reinicia o computador e executa este script novamente.
    echo.
    pause
    exit /b
)

:: 3. Verificar se o usermode.exe esta presente
if not exist "%ROOT_DIR%usermode\release\usermode.exe" (
    echo [ERRO] usermode.exe nao encontrado em usermode\release\
    echo.
    echo O binario do leitor de memoria nao esta presente.
    echo Tens duas opcoes:
    echo   1. Compila o projeto em Visual Studio ^(Release x64^)
    echo   2. Faz git pull para obter o binario pre-compilado mais recente
    echo.
    pause
    exit /b
)

:: 4. Limpar processos anteriores para libertar portas e ficheiros
echo [1/5] A limpar processos anteriores...
taskkill /F /IM node.exe /IM usermode.exe /IM cloudflared.exe >nul 2>&1

:: 5. Instalar dependencias se node_modules nao existir
if not exist "%ROOT_DIR%webapp\node_modules" (
    echo [2/5] A instalar dependencias do Node.js ^(primeiro uso^)...
    echo       Isto so acontece uma vez. Por favor aguarda...
    echo.
    cd /d "%ROOT_DIR%webapp"
    npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERRO] Falha ao instalar dependencias. Verifica a tua ligacao a internet.
        pause
        exit /b
    )
    cd /d "%ROOT_DIR%"
    echo.
    echo [OK] Dependencias instaladas com sucesso!
    echo.
) else (
    echo [2/5] Dependencias ja instaladas. A continuar...
)

:: 6. Iniciar Servicos Web (Node WS, Vite e Tunel Cloudflare)
echo [3/5] A iniciar servidor WebSocket e interface Web...
if exist "%temp%\cloudflared.log" del /f /q "%temp%\cloudflared.log" >nul 2>&1

start /b cmd /c "cd /d "%ROOT_DIR%webapp" && npm run dev" >nul 2>&1
start /b cmd /c "cloudflared tunnel --url http://localhost:5173" > "%temp%\cloudflared.log" 2>&1

echo.
echo ===================================================================
echo     LINK DO RADAR (CLOUDFLARE TUNNEL)
echo ===================================================================
echo.
echo [4/5] A gerar ligacao publica para partilhar com amigos...

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT_DIR%scripts\tunnel.ps1"

echo.
echo ===================================================================
echo     VALIDACAO DO CS2 E LEITOR DE MEMORIA
echo ===================================================================
echo.

:: 7. Verificar se o CS2 esta em execucao antes de abrir o usermode
echo [5/5] A verificar se o Counter-Strike 2 (cs2.exe) esta aberto...

:check_cs2
tasklist /FI "IMAGENAME eq cs2.exe" 2>nul | find /I "cs2.exe" >nul
if %errorlevel% neq 0 (
    echo [!] CS2 nao detetado. Abre o Counter-Strike 2 para continuar...
    timeout /t 3 /nobreak >nul
    goto check_cs2
)

echo [OK] Counter-Strike 2 detetado com sucesso!
echo.
echo [+] A iniciar leitor de memoria (usermode.exe)...

start "CS2 Radar Memory Reader" cmd /k "cd /d "%ROOT_DIR%usermode\release" && usermode.exe"

echo.
echo ===================================================================
echo     RADAR ATIVO E A FUNCIONAR
echo ===================================================================
echo.
echo [OK] Todos os servicos estao operacionais.
echo.
echo Acesso local:  http://localhost:5173
echo Para amigos:   usa o link Cloudflare copiado acima ^(Ctrl+V^)
echo.
echo Podes minimizar esta janela durante a tua sessao de jogo.
echo Para fechar o radar, basta fechar esta janela.
echo.
pause