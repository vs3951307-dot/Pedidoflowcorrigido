#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Deploy do PedidoFlow numa VPS Linux
#
# Uso:  chmod +x deploy.sh && ./deploy.sh
#
# O QUE MUDOU EM RELAÇÃO À VERSÃO ANTERIOR (e por quê):
#
#  - `set -euo pipefail` em vez de só `set -e`: variável não definida e
#    falha no meio de um pipe agora param o deploy. Com `set -e` sozinho,
#    um `npm ci | tee log` falhando passava batido (o status do pipe é o
#    do `tee`).
#  - Confere o .env ANTES de qualquer coisa. Subir sem SECRETS_MASTER_KEY
#    faz o sistema funcionar até o primeiro WhatsApp/nota fiscal e só
#    então quebrar.
#  - BACKUP do banco antes das migrations. `prisma migrate deploy` aplica
#    DDL em banco de produção; sem dump prévio, um erro no meio não tem
#    volta.
#  - Preserva o .env e a pasta de uploads ao descompactar (o `unzip -o`
#    anterior sobrescrevia tudo que estivesse no caminho).
#  - Usa `ecosystem.config.cjs` (fork mode + NODE_ENV=production). O
#    comando antigo não definia NODE_ENV — o Next subia em modo dev e o
#    cookie de sessão perdia a flag Secure.
#  - Confere se a aplicação respondeu depois de subir, em vez de imprimir
#    "Deploy concluído com sucesso" sem ter verificado nada.
# =============================================================================
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/pedidoflow}"
ZIP_FILE="${ZIP_FILE:-/tmp/pedidoflow.zip}"
LOG_DIR="/var/log/pedidoflow"
LOG_FILE="$LOG_DIR/deploy.log"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/pedidoflow}"
PORTA="${PORTA:-3000}"

mkdir -p "$LOG_DIR" "$BACKUP_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=================================="
echo "  PedidoFlow — Deploy $(date '+%F %T')"
echo "=================================="

# --- 1. Pré-condições -------------------------------------------------------
echo "[1/8] Conferindo pré-condições..."
for cmd in node npm pm2 unzip; do
  command -v "$cmd" >/dev/null || { echo "ERRO: '$cmd' não está instalado."; exit 1; }
done

[ -f "$ZIP_FILE" ] || {
  echo "ERRO: $ZIP_FILE não encontrado."
  echo "  scp pedidoflow.zip usuario@IP:/tmp/pedidoflow.zip"
  exit 1
}

if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo "ERRO: $PROJECT_DIR/.env não existe."
  echo "Crie a partir do .env.example. Obrigatórias: DATABASE_URL e SECRETS_MASTER_KEY."
  exit 1
fi

# SECRETS_MASTER_KEY é a chave AES que decifra token do WhatsApp,
# credenciais fiscais e DATABASE_URL de tenant dedicado. Se ela mudar
# entre deploys, TODOS esses segredos viram lixo indecifrável.
if ! grep -qE '^SECRETS_MASTER_KEY=.{32,}' "$PROJECT_DIR/.env"; then
  echo "ERRO: SECRETS_MASTER_KEY ausente ou com menos de 32 caracteres no .env."
  echo "  Gere UMA VEZ com: openssl rand -hex 32"
  echo "  ATENÇÃO: se já existem segredos gravados, NÃO troque esta chave."
  exit 1
fi
if ! grep -qE '^DATABASE_URL=.+' "$PROJECT_DIR/.env"; then
  echo "ERRO: DATABASE_URL ausente no .env."
  exit 1
fi
echo "  ok"

# --- 2. Backup do banco -----------------------------------------------------
echo "[2/8] Backup do banco antes das migrations..."
DUMP="$BACKUP_DIR/pedidoflow-$(date +%Y%m%d-%H%M%S).sql.gz"
if command -v pg_dump >/dev/null; then
  # shellcheck disable=SC2046
  export $(grep -E '^DATABASE_URL=' "$PROJECT_DIR/.env" | xargs -d '\n')
  if pg_dump "${DATABASE_URL}" | gzip > "$DUMP"; then
    echo "  backup em $DUMP ($(du -h "$DUMP" | cut -f1))"
  else
    echo "ERRO: pg_dump falhou. Abortando — não aplico migration sem backup."
    rm -f "$DUMP"
    exit 1
  fi
else
  echo "AVISO: pg_dump não instalado (apt install postgresql-client)."
  read -r -p "  Continuar SEM backup? Digite 'sim' para prosseguir: " resposta
  [ "$resposta" = "sim" ] || { echo "Abortado."; exit 1; }
fi

# --- 3. Parar aplicação -----------------------------------------------------
echo "[3/8] Parando a aplicação..."
pm2 stop pedidoflow 2>/dev/null || echo "  (nenhuma instância rodando)"

# --- 4. Descompactar --------------------------------------------------------
echo "[4/8] Descompactando (preservando .env e uploads)..."
mkdir -p "$PROJECT_DIR"
# -o sobrescreve, mas -x protege o que não pode ser perdido.
unzip -q -o "$ZIP_FILE" -d "$PROJECT_DIR" -x '.env' 'public/uploads/*' '.next/*'
rm -f "$ZIP_FILE"

# --- 5. Dependências --------------------------------------------------------
echo "[5/8] Instalando dependências..."
cd "$PROJECT_DIR"
# `npm ci` exige package-lock.json em sincronia com package.json e apaga
# node_modules antes — é o certo em deploy (reprodutível). Se falhar por
# lock desatualizado, rode `npm install` LOCALMENTE e recompacte.
npm ci --omit=dev --prefer-offline --no-audit --no-fund || {
  echo "ERRO: npm ci falhou. Confira se o package-lock.json foi gerado junto com o package.json."
  exit 1
}
# O build precisa das devDependencies (typescript, tailwind, postcss).
npm ci --prefer-offline --no-audit --no-fund

# --- 6. Build (não toca no banco) ------------------------------------------
echo "[6/8] Build de produção..."
# `npm run build` = prisma generate && next build. Roda ANTES da migration
# de propósito: se a compilação falhar, o banco continua intocado.
NODE_ENV=production npm run build

# --- 7. Migrations + sincronização dos tenants ------------------------------
echo "[7/8] Migrations e sincronização dos schemas de tenant..."
# Migrations do Prisma atingem só o schema `public`; sem a sincronização,
# o schema de cada empresa fica para trás. NUNCA use db:reset aqui.
NODE_ENV=production npm run deploy:migrar

# --- 8. Subir e verificar ---------------------------------------------------
echo "[8/8] Subindo com PM2..."
pm2 delete pedidoflow 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd >/dev/null 2>&1 || true

echo "  aguardando a aplicação responder..."
# /api/saude tem rate limit de 10 req/min por IP. Uma sondagem agressiva
# passaria a receber 429 e o loop nunca sucederia mesmo com a aplicação
# saudável — por isso o intervalo é de 6s (10 tentativas em 60s) e o 429
# conta como "está de pé" (só um processo vivo responde 429).
OK=0
CODIGO=""
for _ in $(seq 1 10); do
  CODIGO=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
    "http://127.0.0.1:${PORTA}/api/saude" 2>/dev/null || echo "000")
  case "$CODIGO" in
    200|429) OK=1; break ;;
    503)     echo "  aplicação de pé, mas o BANCO não respondeu (503)."; break ;;
  esac
  sleep 6
done

if [ "$OK" -ne 1 ]; then
  echo ""
  echo "❌ A aplicação não ficou saudável em /api/saude (último código HTTP: ${CODIGO:-nenhum})."
  echo "   Logs:    pm2 logs pedidoflow --lines 100"
  echo "   Rollback: restaure $DUMP e reimplante a versão anterior."
  exit 1
fi

echo ""
echo "=================================="
echo "  Deploy concluído e verificado"
echo "=================================="
echo "  Backup do banco: $DUMP"
echo "  Logs:            pm2 logs pedidoflow"
echo "  Health:          curl -s https://SEU_DOMINIO/api/saude"
echo "=================================="
