# Deploy do PedidoFlow numa VPS

Checklist na ordem. Não pule o passo 3 — é o que mais derruba deploy.

## 1. Preparar a VPS (Ubuntu 22.04+)

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx \
     postgresql-client unzip curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2
sudo mkdir -p /opt/pedidoflow /var/log/pedidoflow /var/backups/pedidoflow
```

Firewall: libere só 22, 80 e 443. **Não** exponha a 3000 — o Node deve
escutar só em `127.0.0.1` e ser alcançado pelo nginx.

## 2. Domínio

Aponte um registro A do seu domínio para o IP da VPS **antes** de rodar o
certbot. Sem DNS propagado, a emissão do certificado falha.

## 3. HTTPS — obrigatório, não é "melhoria"

```bash
sudo cp /opt/pedidoflow/nginx.conf /etc/nginx/sites-available/pedidoflow
sudo sed -i 's/SEU_DOMINIO.com.br/seudominio.com.br/g' \
     /etc/nginx/sites-available/pedidoflow
sudo ln -sf /etc/nginx/sites-available/pedidoflow /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo certbot --nginx -d seudominio.com.br
sudo nginx -t && sudo systemctl reload nginx
```

**Por que isto não é opcional:** com `NODE_ENV=production`, o cookie de
sessão sai com a flag `Secure`. O navegador se recusa a guardar cookie
`Secure` numa página HTTP. O login responde 200 e devolve o usuário para a
tela de login **sem mensagem de erro nenhuma**. Se você tentar rodar em
HTTP puro, vai passar o dia caçando um bug de autenticação que não existe.

## 4. Configurar o `.env`

```bash
sudo cp /opt/pedidoflow/.env.example /opt/pedidoflow/.env
sudo nano /opt/pedidoflow/.env
sudo chmod 600 /opt/pedidoflow/.env
```

Obrigatórias (o processo se recusa a subir sem elas):

| Variável | Como obter |
|---|---|
| `DATABASE_URL` | Postgres. No Supabase use a porta **6543** (pooler). |
| `SECRETS_MASTER_KEY` | `openssl rand -hex 32` |

> **`SECRETS_MASTER_KEY` é para a vida toda.** É a chave AES que decifra
> token do WhatsApp, credenciais fiscais e `DATABASE_URL` de tenant
> dedicado. Se você trocar depois de ter segredos gravados, **todos viram
> lixo indecifrável e não há como recuperar**. Gere uma vez, guarde num
> gerenciador de senhas, nunca mude.

Deixe `EMERGENCIA_HABILITADA` **vazia**. Com ela ligada, as rotas
`/api/emergencia/*` existem para quem tiver o token. Ligue só quando
precisar destravar um acesso, e desligue logo em seguida.

## 5. Deploy

Na sua máquina:

```bash
npm run test:all          # precisa passar antes de empacotar
npm run build             # confirma que compila
zip -r pedidoflow.zip . -x 'node_modules/*' '.next/*' '.git/*' '.env'
scp pedidoflow.zip usuario@IP:/tmp/pedidoflow.zip
```

Na VPS:

```bash
cd /opt/pedidoflow && ./deploy.sh
```

O `deploy.sh` faz, nesta ordem: confere o `.env` → **dump do banco** →
para a app → descompacta preservando `.env` e uploads → `npm ci` → build →
migrations + sincronização dos schemas de tenant → sobe no PM2 → confirma
que `/api/saude` respondeu. Se qualquer passo falhar, ele para.

## 6. Depois de subir

```bash
pm2 logs pedidoflow --lines 50
curl -s https://seudominio.com.br/api/saude
```

Confira manualmente:

- [ ] Login funciona e **permanece** logado ao navegar (se cair, é o
      passo 3).
- [ ] Um pedido no PDV: criar → imprimir → pagar → fechar.
- [ ] KDS atualiza sozinho ao criar um pedido (sem F5). Se só atualizar
      recarregando, o SSE não está passando pelo nginx.
- [ ] Uma pizza **Família com 3 sabores especiais** custa **R$ 92** — no
      PDV **e** pelo WhatsApp. Se der R$ 72 em algum canal, a correção de
      preço não foi aplicada.
- [ ] Foto de produto sobe sem erro 413.

## 7. WhatsApp (Meta)

No painel da Meta, configure o webhook para
`https://seudominio.com.br/api/whatsapp/webhook` e preencha, em
Configurações → WhatsApp de cada empresa: access token, phone number ID,
verify token e **App Secret**.

Sem o App Secret a assinatura não valida e o webhook responde 403 a tudo —
por segurança, é assim mesmo. Não existe modo "sem assinatura".

## 8. Backup automático

O `deploy.sh` faz dump a cada deploy. Isso não é rotina de backup. Adicione:

```bash
sudo crontab -e
# 3h da manhã, todo dia, mantendo 14 dias
0 3 * * * pg_dump "$DATABASE_URL" | gzip > /var/backups/pedidoflow/auto-$(date +\%F).sql.gz && find /var/backups/pedidoflow -name 'auto-*' -mtime +14 -delete
```

E **copie os dumps para fora da VPS**. Backup no mesmo disco que o banco
não é backup.

## Regras que não mudam

- **Um único processo.** `ecosystem.config.cjs` fixa `exec_mode: fork` e
  `instances: 1`. O tempo real (cozinha, mesas, entregas), o rate limit e
  o deduplicador de webhook são em memória. Em modo cluster, a cozinha
  para de receber pedidos de forma intermitente. Só mude depois de trocar
  o `EventEmitter` por Redis ou Postgres LISTEN/NOTIFY.
- **Nunca** `db:reset` nem `db:seed` no servidor. Os dois estão bloqueados
  por `scripts/guarda-destrutiva.cjs`, mas o hábito importa mais que o
  bloqueio.
- **Nunca** `db push` em produção. Use `prisma migrate deploy` (é o que o
  `deploy:migrar` faz).
