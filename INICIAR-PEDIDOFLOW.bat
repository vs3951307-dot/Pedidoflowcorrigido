@echo off
setlocal EnableDelayedExpansion
title PedidoFlow - iniciando...
cd /d "%~dp0"

echo ============================================================
echo   PedidoFlow - preparando o ambiente de teste local
echo ============================================================
echo.

if not exist "package.json" (
  echo [ERRO] Este arquivo precisa estar na pasta do projeto ^(chatflow^),
  echo junto com o package.json. Mova-o para la e rode de novo.
  pause
  exit /b 1
)

rem ------------------------------------------------------------------
rem 1) Node.js
rem ------------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado.
  echo Instale o Node.js 18 ou mais novo em https://nodejs.org e rode este arquivo de novo.
  pause
  exit /b 1
)
echo [OK] Node.js encontrado:
node -v
echo.

rem ------------------------------------------------------------------
rem 2) Docker (usado so para o banco PostgreSQL - nao mexe em mais nada)
rem ------------------------------------------------------------------
where docker >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Docker nao encontrado.
  echo.
  echo Este script usa o Docker so para rodar o PostgreSQL automaticamente,
  echo sem voce precisar instalar/configurar um banco na mao.
  echo.
  echo Instale o Docker Desktop em https://www.docker.com/products/docker-desktop
  echo abra o Docker Desktop uma vez para ele iniciar, e rode este arquivo de novo.
  echo.
  echo Se voce ja tem um PostgreSQL proprio rodando, edite o arquivo .env
  echo manualmente ^(DATABASE_URL^) e rode este script de novo - ele vai pular
  echo esta etapa sozinho quando o .env ja existir.
  pause
  exit /b 1
)

docker info >nul 2>nul
if errorlevel 1 (
  echo [ERRO] O Docker Desktop nao esta rodando.
  echo Abra o Docker Desktop, espere ele ficar pronto, e rode este arquivo de novo.
  pause
  exit /b 1
)
echo [OK] Docker encontrado e rodando.
echo.

rem ------------------------------------------------------------------
rem 3) Banco PostgreSQL (container Docker) - idempotente
rem ------------------------------------------------------------------
echo Preparando o banco PostgreSQL local (container "pedidoflow-db")...
docker inspect pedidoflow-db >nul 2>nul
if errorlevel 1 (
  echo Criando o container do banco pela primeira vez...
  docker run --name pedidoflow-db -e POSTGRES_PASSWORD=pedidoflow -e POSTGRES_DB=pedidoflow -p 5432:5432 -d postgres:16 >"%TEMP%\pedidoflow-docker-run.log" 2>&1
  if errorlevel 1 (
    findstr /c:"already in use" "%TEMP%\pedidoflow-docker-run.log" >nul 2>nul
    if not errorlevel 1 (
      rem O container ja existe de verdade (corrida/estado inesperado) -
      rem so reaproveita em vez de falhar.
      echo Container ja existia - reaproveitando em vez de criar outro...
      docker start pedidoflow-db >nul 2>nul
    ) else (
      echo [ERRO] Falha ao criar o container do banco. Detalhes:
      type "%TEMP%\pedidoflow-docker-run.log"
      pause
      exit /b 1
    )
  )
) else (
  echo Container do banco ja existe - so garantindo que esta ligado...
  docker start pedidoflow-db >nul 2>nul
)

echo Aguardando o PostgreSQL ficar pronto para aceitar conexoes...
set /a TENTATIVAS=0
:esperar_banco
docker exec pedidoflow-db pg_isready -U postgres >nul 2>nul
if not errorlevel 1 goto banco_pronto
set /a TENTATIVAS+=1
if !TENTATIVAS! GEQ 30 (
  echo [ERRO] O banco nao ficou pronto a tempo. Rode "docker logs pedidoflow-db" para ver o que houve.
  pause
  exit /b 1
)
timeout /t 2 >nul
goto esperar_banco
:banco_pronto
echo [OK] PostgreSQL pronto.
echo.

rem ------------------------------------------------------------------
rem 4) Arquivo .env (so cria se ainda nao existir - nunca sobrescreve)
rem ------------------------------------------------------------------
if exist ".env" (
  echo [OK] Arquivo .env ja existe - mantendo como esta.
) else (
  echo Criando .env de teste local...
  call :gerar_env
  echo [OK] .env criado com um banco local e chaves de teste.
  echo      ^(Isto e so para teste local - gere chaves novas antes de ir para producao.^)
)
echo.
goto depois_env

:gerar_env
set "SECRET1=%RANDOM%"
set "SECRET2=%RANDOM%"
set "SECRET3=%RANDOM%"
set "SECRET4=%RANDOM%"
(
  echo DATABASE_URL="postgresql://postgres:pedidoflow@localhost:5432/pedidoflow"
  echo DIRECT_URL="postgresql://postgres:pedidoflow@localhost:5432/pedidoflow"
  echo AUTH_SECRET="local-%SECRET1%%SECRET2%-dev-secret"
  echo SECRETS_MASTER_KEY="local-%SECRET3%%SECRET4%-0123456789abcdef"
  echo DEMO_MODE="true"
) > ".env"
exit /b 0
:depois_env


rem ------------------------------------------------------------------
rem 5) Instalar dependencias
rem ------------------------------------------------------------------
echo Instalando dependencias ^(npm install^) - isso pode demorar alguns minutos na primeira vez...
call npm install
if errorlevel 1 (
  echo [ERRO] npm install falhou. Veja a mensagem acima.
  pause
  exit /b 1
)
echo [OK] Dependencias instaladas.
echo.

rem ------------------------------------------------------------------
rem 6) Prisma: gerar client + aplicar migrations
rem ------------------------------------------------------------------
echo Gerando o Prisma Client...
call npx prisma generate
if errorlevel 1 (
  echo [ERRO] "npx prisma generate" falhou. Veja a mensagem acima.
  pause
  exit /b 1
)

set "TEM_MIGRATION="
for /d %%D in ("prisma\migrations\*") do set "TEM_MIGRATION=1"

if defined TEM_MIGRATION (
  echo Aplicando migrations existentes...
  call npx prisma migrate deploy
) else (
  echo Criando a primeira migration do banco ^(init^)...
  call npx prisma migrate dev --name init --skip-seed
)
if errorlevel 1 (
  echo [ERRO] As migrations do Prisma falharam. Veja a mensagem acima.
  pause
  exit /b 1
)
echo [OK] Banco com as tabelas criadas/atualizadas.
echo.

rem ------------------------------------------------------------------
rem 6b) Sincroniza os schemas das empresas JA existentes com o schema
rem     atual (adiciona tabelas/colunas novas, NUNCA apaga nada).
rem     Importante quando voce ja rodou o sistema antes e o codigo
rem     evoluiu desde entao.
rem ------------------------------------------------------------------
echo Sincronizando schemas das empresas existentes ^(sem apagar dados^)...
call npm run db:sync-tenants
if errorlevel 1 (
  echo [AVISO] A sincronizacao de tenants falhou. Se este e o primeiro uso,
  echo isso e normal ^(ainda nao existe nenhuma empresa^) e pode ser ignorado.
)
echo.

rem ------------------------------------------------------------------
rem 7) Seed (dados de teste - empresa, usuarios, cardapio, etc.)
rem ------------------------------------------------------------------
echo Populando dados de teste ^(Disk Pizza Rozeno, usuarios, cardapio...^)...
call npm run db:seed
if errorlevel 1 (
  echo [AVISO] O seed deu erro - se o banco ja tinha dados de uma execucao anterior,
  echo isso normalmente e seguro de ignorar ^(o seed limpa e recria sozinho^).
  echo Se a tela de login nao aparecer com os logins de teste, rode "npm run db:seed" de novo.
)
echo.

rem ------------------------------------------------------------------
rem 8) Iniciar o PedidoFlow (janela separada, fica rodando)
rem ------------------------------------------------------------------
echo Iniciando o PedidoFlow...
start "PedidoFlow - servidor (deixe esta janela aberta)" cmd /k "npm run dev"

echo Aguardando o servidor ficar pronto em http://localhost:3000 ...
set /a TENTATIVAS2=0
:esperar_servidor
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing -TimeoutSec 2) | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 goto servidor_pronto
set /a TENTATIVAS2+=1
if !TENTATIVAS2! GEQ 60 (
  echo [AVISO] O servidor esta demorando mais que o esperado.
  echo Olhe a janela "PedidoFlow - servidor" para ver se apareceu algum erro.
  echo Quando aparecer "Ready" nela, abra http://localhost:3000/login manualmente.
  pause
  exit /b 0
)
timeout /t 2 >nul
goto esperar_servidor
:servidor_pronto

echo [OK] Servidor no ar! Abrindo a tela de login no navegador...
start "" "http://localhost:3000/login"

echo.
echo ============================================================
echo   Tudo pronto! A tela de login deve abrir no navegador.
echo   Deixe a janela "PedidoFlow - servidor" aberta enquanto usar o sistema.
echo ============================================================
echo.
echo Logins de teste (senha "pizza123" para todos, exceto Super Admin):
echo   Super Admin:        http://localhost:3000/superadmin/login
echo                        superadmin@pedidoflow.com.br / superadmin123
echo   Administrador:       admin@rozeno.com.br
echo   Caixa/PDV:           caixa@rozeno.com.br
echo   Garcom:              garcom@rozeno.com.br
echo   Entregador:          samuel@rozeno.com.br
echo   Cozinha:             cozinha@rozeno.com.br
echo.
echo Segunda empresa (para testar isolamento multiempresa):
echo   Empresa Teste B:     admin@testeb.com.br / pizza123
echo.
pause
