# PedidoFlow — Guia de Deploy no Servidor

## Pré-requisitos

1. **Servidor:** Oracle Cloud (Oracle Linux), IP: `137.131.169.178`
2. **SSH:** `opc@137.131.169.178`, porta 22
3. **Chave SSH:** `ssh-key-2026-08-05.key`
4. **Software no servidor:** Node.js 18+, npm, PostgreSQL, PM2 (instalado no script abaixo)

## Passo 1: Verifique se o servidor está ativo

No Oracle Cloud Console:
1. Acesse **Compute → Instances**
2. Verifique se a instância `pedidoflow` (ou similar) está **RUNNING**
3. Se estiver **STOPPED**, clique em **Start**
4. Aguarde 1-2 minutos até o servidor ficar pronto

## Passo 2: Configure as regras de segurança (Security List)

No Oracle Cloud Console:
1. Acesse **Networking → Virtual Cloud Network** → sua VCN
2. Clique em **Security Lists**
3. Adicione regras de entrada para:
   - **Porta 22 (TCP)** — origem: seu IP atual (`0.0.0.0/0` para teste)
   - **Porta 3000 (TCP)** — origem: seu IP ou `0.0.0.0/0`
   - **Porta 5432 (TCP)** — origem: `0.0.0.0/0` (PostgreSQL local)

Obtenha seu IP atual: https://whatismyipaddress.com/

## Passo 3: Instale dependências no servidor

```bash
ssh -i ssh-key-2026-08-05.key opc@137.131.169.178 -p 22

# No servidor:
sudo yum update -y
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
sudo npm install -g pm2
sudo yum install -y postgresql-server
sudo postgresql-setup initdb
sudo systemctl enable --now postgresql
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'pedidoflow';"
```

## Passo 4: Transfira e instale o PedidoFlow

```bash
# No seu computador, transfira o ZIP:
scp -i ssh-key-2026-08-05.key pedidoflow-plataforma-saas.zip opc@137.131.169.178:/tmp/pedidoflow.zip

# No servidor:
chmod +x /tmp/deploy.sh
mkdir -p /opt/pedidoflow
unzip -o /tmp/pedidoflow.zip -d /opt/pedidoflow
cd /opt/pedidoflow
npm ci --prefer-offline
```

## Passo 5: Configure o ambiente (.env)

Edite o arquivo `.env` com as credenciais corretas:

```bash
cd /opt/pedidoflow
cat > .env << 'EOF'
DATABASE_URL="postgresql://postgres:pedidoflow@localhost:5432/pedidoflow?schema=public"
DIRECT_URL="postgresql://postgres:pedidoflow@localhost:5432/pedidoflow?schema=public"
SECRETS_MASTER_KEY="$(openssl rand -hex 32)"
DEMO_MODE="false"
EOF
```

## Passo 6: Build e migrations (nesta ordem)

`npm run build` NÃO toca no banco — só gera o Prisma Client e compila o
Next. A migration é um passo **explícito e separado**, e precisa rodar
ANTES de subir a aplicação nova. Detalhes e rollback em `DEPLOY.md`.

```bash
cd /opt/pedidoflow

# 1) Compila (seguro: nenhuma escrita no banco).
npm run build

# 2) Migration explícita: migrate deploy -> sincroniza o schema de cada
#    empresa -> backfill -> config de pizza. Faça backup do banco antes.
#    Leia as PENDÊNCIAS impressas no fim antes de seguir.
npm run deploy:migrar
```

## Passo 7: Inicie a aplicação

```bash
pm2 start "npm run start" --name "pedidoflow" -- -p 3000
pm2 save
pm2 startup systemd
```

## Passo 8: Configure o firewall (se aplicável)

```bash
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

## Verificação

```bash
curl http://localhost:3000/api/saude
# Resposta esperada: {"status":"ok","banco":"conectado",...}
```

## Administração

```bash
# Ver logs em tempo real
pm2 logs pedidoflow

# Reiniciar
pm2 restart pedidoflow

# Parar
pm2 stop pedidoflow

# Ver status
pm2 status
```

## Solução de problemas

| Problema | Solução |
|---|---|
| SSH connection timeout | Verifique Security List e status da instância |
| Port 3000 não responde | Verifique firewall e `pm2 logs pedidoflow` |
| Erro de conexão DB | Verifique `.env` e se o PostgreSQL está rodando |
| Migration falha | Verifique se o schema está atualizado com `npx prisma migrate status`