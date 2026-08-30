# PedidoFlow — Continuação do Projeto em Outra Máquina

Este projeto foi copiado para continuar em outro lugar. Contém o **código-fonte completo**
(incluindo o histórico `.git`) e as **instruções e credenciais** para rodar e publicar.

---

## 1) O que tem nesta pasta

- Código-fonte completo (Next.js + Prisma) em `src/`, `prisma/`, `public/`, `scripts/`
- Histórico completo de Git (`.git`) com todos os commits, apontando para o repositório GitHub
- Documentação em markdown (README, DEPLOY, ARQUITETURA, etc.)

**NÃO foi copiado** (por serem grandes e recriáveis): `node_modules/` e `.next/`.
Para rodar, reinstale as dependências (`npm install`).

---

## 2) Repositório Git / Deploy

- GitHub (origem): `https://github.com/vs3951307-dot/pedidoflow-saas-v2.git` — branch `main`
- Publicação (produção): **Render** — o deploy é automático quando você dá `git push` na `main`
- Site em produção: `https://pedidoflow-saas-v2.onrender.com`

> Ao trabalhar nesta pasta em outra máquina, o Git pode pedir permissão de "safe.directory".
> Rode uma vez:
> `git config --global --add safe.directory D:/Victor`

Para enviar mudanças ao GitHub/Render:
```
git add .
git commit -m "descrição"
git push origin main
```

---

## 3) Configuração local (.env)

Crie um arquivo `.env` na raiz copiando o exemplo e preenchendo:

```
cp .env.example .env
```

As variáveis obrigatórias (banco de dados, etc.) estão no `.env.example`. Consulte também
`COMO-RODAR-LOCALMENTE.md`.

---

## 4) Credenciais e Chaves (PRODUÇÃO)

Estas chaves estão **no painel do Render** (não no repositório, por segurança). Se precisar
recriar em outro lugar, use os valores abaixo (confira se ainda estão válidos no painel):

### Banco de dados (Render / Supabase ou Postgres)
- A string `DATABASE_URL` está definida no painel do Render.
- Se houver problema com conexões/Pool, adicione:
  - `DIRECT_URL` — usado em migrations (a migração `sabor_fotoUrl` ainda NÃO foi aplicada por falta dessa var).

### Variáveis da IA do atendente (já configuradas no Render)
- `IA_ATENDENTE_API_KEY` = `sk-...` (valor REAL somente no painel do Render — NUNCA em arquivo versionado. A chave anterior vazou neste arquivo e foi removida/revogada. Regenerar no painel da OpenAI.)
- `IA_ATENDENTE_PROVIDER` = `openai`
- `IA_ATENDENTE_MODEL` = `gpt-4o-mini`

> ⚠️ Esta chave OpenAI é SENSÍVEL. Não coloque em arquivos versionados nem compartilhe publicamente.

### Autenticação / Segurança
- `EMERGENCIA_TOKEN` — sem valor padrao. As rotas /api/emergencia/* so existem com EMERGENCIA_HABILITADA=1 e um token de 32+ caracteres. Mantenha desligado em producao.
  - Endpoint de emergência que cria usuários e reseta senhas.

---

## 5) Acessos do Sistema (produção)

### Super Admin
- URL: `https://pedidoflow-saas-v2.onrender.com/superadmin`
- Login: `superadmin@pedidoflow.com.br`
- Senha: `Rozeno@2026`

### Empresa (Disk Pizza Rozeno)
- Usuários do domínio `@rozeno.com.br` — todos com senha `Rozeno@2026`:
  - `rozeno@rozeno.com.br` (ADMINISTRADOR)
  - `admin@rozeno.com.br` (ADMINISTRADOR)
  - `caixa@rozeno.com.br`, `garcom@rozeno.com.br`, `cozinha@rozeno.com.br`
  - `samuel@rozeno.com.br`, `ari@rozeno.com.br`, `marlon@rozeno.com.br` (ENTREGADOR)
- Página de emergência: `https://pedidoflow-saas-v2.onrender.com/emergencia`
  - O botão da página cria usuários extras + corrige o papel para ADMINISTRADOR + reseta senhas.
  - Use para corrigir usuários limitados (que só veem PDV/Garçom).

---

## 6) Passos para rodar localmente (resumo)

```
npm install
# configure .env (banco de desenvolvimento)
npm run db:push   # ou as migrations
npm run dev
```

Veja `COMO-RODAR-LOCALMENTE.md` e `DEPLOY.md` para detalhes.

---

## 7) Estado atual / pendências conhecidas

- IA do atendente: responde como atendente humano, com suporte a múltiplos itens e apelidos
  (fix "torre e coca") e saudação sem transferir para humano.
- Migração `prisma/migrations/.../sabor_fotoUrl` **pendente de aplicação** (precisa `DIRECT_URL` no Render).
- WhatsApp real (Meta) ainda NÃO configurado — precisa de conta de negócio e número cadastrado.
