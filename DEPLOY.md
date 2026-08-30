# PedidoFlow — Implantação em produção (SaaS multiempresa)

Guia passo a passo para colocar a plataforma PedidoFlow no ar. Leia o
[README](./README.md) para a visão geral do produto; aqui o foco é
**subir, proteger e operar** a plataforma multiempresa.

---

## 1. Requisitos

- Node.js **18.17+** (recomendado 20 LTS) e npm.
- Banco **PostgreSQL** (obrigatório — a plataforma não roda mais em
  SQLite; múltiplas empresas dividem o mesmo banco, isoladas por
  `empresaId`). Qualquer Postgres gerenciado serve (Neon, Supabase, RDS,
  Cloud SQL, etc.) ou uma instância própria (Docker, VM).
- Uma máquina Linux/Windows com acesso à internet para hospedar a
  aplicação Next.js.

## 2. Variáveis de ambiente (`.env`)

Copie `.env.example` para `.env` e preencha. Obrigatórias:

| Variável | O que é | Produção |
|---|---|---|
| `DATABASE_URL` | Conexão com o Postgres | string de conexão real, com SSL se o provedor exigir (`?sslmode=require`) |
| `SECRETS_MASTER_KEY` | Criptografa credenciais por empresa (WhatsApp, fiscal, banco dedicado) | **obrigatória** — `openssl rand -hex 32`. Sem ela, salvar essas credenciais falha (nunca grava em texto puro) |

Opcionais e integrações — ver `.env.example` para o detalhe de cada uma
(a maioria hoje é **por empresa**, configurada pelo próprio painel Admin
de cada cliente; as variáveis de ambiente servem só de fallback legado
para a primeira empresa/instalação de empresa única):

| Variável | Papel | Sem ela |
|---|---|---|
| `DEMO_MODE=false` | Desliga o retorno do token de recuperação de senha na API | token aparece na resposta (modo demonstração) |
| `AGENTE_TOKEN` | Fallback do token do agente de impressão (uma empresa) | cada empresa configura o próprio token pelo painel |
| `WHATSAPP_*` | Fallback de credenciais Meta (uma empresa) | cada empresa conecta seu próprio número pelo painel; sem nenhuma config, roda em simulação |
| `IA_ATENDENTE_*` | LLM opcional para interpretar mensagens | interpretador determinístico (regras) |
| `NFCe_*` | Credenciais do provedor fiscal — **ainda globais por instância** (uma empresa emissora real por servidor; ver nota de segurança no relatório de auditoria) | venda normal, documento fiscal `nao_configurado` |

> **Importante**: nenhuma chave (CSC, tokens, certificado) é gravada no
> banco em texto claro pelas variáveis de ambiente. Tudo vem do
> ambiente. Nunca commite o `.env`.

## 3. Banco de dados (PostgreSQL)

```bash
npm install

# Aplica o schema multiempresa num Postgres VAZIO. Se esta é a primeira
# vez (não existe ainda uma pasta prisma/migrations com conteúdo), gere
# a migration inicial:
npx prisma migrate dev --name init_multiempresa   # ambiente de desenvolvimento
# ou, em produção, com a migration já versionada no repositório:
npm run db:deploy                                  # prisma migrate deploy

# Seed de demonstração (Disk Pizza Rozeno como 1ª empresa + Super Admin
# de demonstração — troque a senha do Super Admin antes de ir ao ar):
npm run db:seed
```

Se você já tinha uma instalação SQLite anterior com dados reais, veja
`prisma/migrations/README.md` e `scripts/migrar-sqlite-para-postgres.ts`
— o script transforma a Disk Pizza Rozeno na primeira empresa da
plataforma sem apagar o `dev.db` original.

## 4. Build e execução — ORDEM SEGURA DE DEPLOY

> **Regra que o build respeita: `npm run build` NÃO TOCA NO BANCO.**
> Ele só gera o Prisma Client e compila o Next (`prisma generate && next
> build`). Nenhuma migration, nenhum seed, nenhuma escrita — o build roda
> com o banco fora do ar, com credenciais inválidas ou numa máquina de CI
> sem acesso à rede do banco, e mesmo assim termina com sucesso.
>
> Isso é deliberado (item 5 da auditoria). Antes, o script de build era
> `prisma generate && prisma migrate deploy && tsx
> scripts/sincronizar-schemas-tenants.ts && tsx
> scripts/setup-config-pizza.ts && next build` — ou seja, QUALQUER build
> aplicava DDL e escrevia dados no banco de produção. Consequências reais
> disso: um build de teste/CI mexia na produção; um build que falhasse no
> meio deixava o banco meio migrado; e um rollback da aplicação não tinha
> como desfazer a migration que o build já tinha aplicado.

### A ordem correta: **migration → aplicação**

```bash
# 1) BUILD — só compila. Pode rodar em CI, sem acesso ao banco.
npm run build

# 2) MIGRATION — passo EXPLÍCITO, com a aplicação ANTIGA ainda no ar.
#    Faça backup do banco antes. Este é o único passo que escreve.
npm run deploy:migrar

# 3) APLICAÇÃO — só depois que a migration terminou sem pendência.
npm run start   # ou PM2, systemd, Docker, etc.
```

**Por que migration ANTES de subir a aplicação nova:** as migrations
deste projeto são aditivas (colunas e índices novos, nada removido), então
a aplicação ANTIGA continua funcionando com o schema NOVO durante a
janela entre os passos 2 e 3. O contrário não vale: subir a aplicação
nova contra o schema antigo quebra na hora (coluna inexistente).

### O que `npm run deploy:migrar` faz, em ordem

| Passo | Comando | O que faz |
|---|---|---|
| 1 | `prisma migrate deploy` | Aplica as migrations pendentes no schema `public` (plataforma + template). |
| 2 | `tsx scripts/sincronizar-schemas-tenants.ts` | Leva as mesmas mudanças para o schema de CADA empresa. Migrations do Prisma só atingem `public` — sem este passo, os tenants ficam para trás. |
| 3 | `tsx scripts/backfill-etapa1.ts` | Preenche dados que o DDL não deriva sozinho (`Tamanho.maxSabores` = Média 2 / Grande 2 / Família 3, `ItemPedido.enviadoCozinhaEm`, `Categoria.grupoSabores`). |
| 4 | `tsx scripts/setup-config-pizza.ts` | Cria a regra de preço de pizza padrão nas empresas que ainda não têm (nunca sobrescreve a que já existe). |

Todos os quatro são **idempotentes**: rodar de novo não duplica nem
apaga nada. Nenhum deles remove tabela, coluna ou linha.

### Pendências da sincronização — leia sempre

O passo 2 aplica só o que é **comprovadamente seguro**. Quando uma
mudança poderia corromper ou perder dado, ela NÃO é aplicada: vira uma
**pendência**, impressa no fim e gravada em `pendencias-tenants.json`,
com o SQL de diagnóstico e o de reparo prontos. Os casos:

- **coluna obrigatória sem default numa tabela com linhas** — a coluna
  entra NULLABLE e ninguém inventa valor (nada de `''`, que seria
  indistinguível de um dado real preenchido errado);
- **`DEFAULT ''` herdado** de versões antigas do sincronizador, sem
  respaldo no `schema.prisma`;
- **UNIQUE que os dados atuais já violam** — o índice não é criado e
  nenhuma linha duplicada é apagada;
- **FK com linhas órfãs**.

Trate a pendência, rode `npm run db:sync-tenants` de novo e siga para o
passo 3. Em pipeline automatizado, use `npm run db:sync-tenants --
--strict` para o comando sair com código 2 quando houver pendência.

### Rollback

Como o build não toca no banco e as migrations são aditivas, voltar a
aplicação para a versão anterior é só reimplantar o artefato antigo — o
schema novo continua compatível. **Não** desfaça migrations para fazer
rollback de aplicação.

**⚠️ Rode como UM ÚNICO processo Node — nunca modo cluster/múltiplas
réplicas.** O tempo real (atualizações de cozinha, mesas, entregas,
impressão) usa memória de um processo só (`src/lib/eventos-tempo-real.ts`).
Em PM2, isso significa `instances: 1` (nunca `"max"` ou `> 1`); atrás de
um load balancer, isso significa uma única instância da aplicação. Rodar
com mais de um processo não quebra o sistema, mas atualizações em tempo
real podem não chegar a todo mundo — o servidor avisa isso no log
(`instrumentation.ts`) se detectar sinais de modo cluster.

## 5. Primeiro acesso — Super Admin

**Para testar com uma pizzaria de verdade (recomendado):** `npm run
db:seed` cria uma empresa de DEMONSTRAÇÃO fake ("Disk Pizza Rozeno")
com produtos fictícios — não é o que você quer se vai cadastrar sua
própria empresa de verdade depois. Use o script dedicado, que só cria
o Super Admin e não toca em mais nada:

```bash
npm run db:criar-super-admin
```

Idempotente: se rodar de novo, não recria nem reseta senha — só avisa
que já existe. A senha aparece em texto puro UMA VEZ, no terminal, e
não fica salva em texto puro em lugar nenhum. Depois, entre em
`/superadmin/login` e crie sua empresa real pelo próprio painel.

**Para demonstração/desenvolvimento** (cria também uma empresa fake com
dados de exemplo):

```bash
npm run db:seed
```

| Papel | Onde acessar | E-mail | Senha |
|---|---|---|---|
| Super Admin (dono da plataforma) | `/superadmin/login` | `superadmin@pedidoflow.com.br` (ou o que você definir em `SUPERADMIN_EMAIL`) | gerada aleatoriamente — impressa no console |
| Administrador de demonstração (só via `db:seed`) | `/login` | (ver `prisma/seed.ts`, lista `USUARIOS`) | idem — impressa no console (mesma senha pra todos os usuários demo) |

**Troque as senhas antes de expor a plataforma publicamente.**

## 6. Cadastrando uma nova empresa

Ver [`NOVA_EMPRESA.md`](./NOVA_EMPRESA.md) — feito inteiramente pelo
painel Super Admin (`/superadmin`), sem precisar mexer em código ou
banco manualmente.

## 7. Painel Super Admin

Ver [`SUPERADMIN.md`](./SUPERADMIN.md) — como bloquear/suspender/ativar
empresas, trocar plano, habilitar/desabilitar módulos e diagnosticar
problemas (WhatsApp desconectado, impressão travada, fiscal não
configurado, etc.).

## 8. Agente de impressão térmica

Sem mudanças de instalação — continua em `scripts/agente-impressao/`
(ver README próprio nessa pasta). A única diferença multiempresa é que
**cada empresa cadastra seu próprio token** em Admin → Configurações →
Impressão; o agente de uma empresa nunca recebe trabalho de outra.

## 9. Storage — fotos e backups (Render/Supabase)

**No Render (ou qualquer container), o disco é EFÊMERO — some a cada
deploy ou restart.** Fotos de produto/estoque e backups usam
[Supabase Storage](https://supabase.com/docs/guides/storage) para
persistir de verdade; disco local só é usado como fallback em
desenvolvimento (`NODE_ENV !== "production"`), nunca em produção.

**Antes de configurar, crie 3 buckets no painel do Supabase Storage:**

| Bucket | Visibilidade | Conteúdo |
|---|---|---|
| `produtos` | Público | Fotos do cardápio |
| `estoque` | Público | Fotos de itens de estoque |
| `backups` | **Privado** | Exportações JSON — contém dados sensíveis, nunca público |

Depois, configure no `.env`:
```bash
SUPABASE_URL="https://SEU-PROJETO.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="sua-chave-service-role-aqui"
```

**Sem essas duas variáveis, em produção:** upload de foto e geração de
backup respondem com um erro claro explicando o que falta configurar —
nunca tentam gravar no disco local do Render, e nunca derrubam o resto
do sistema (PDV, pedidos, pagamentos continuam funcionando
normalmente; só upload/backup ficam indisponíveis até configurar).

## 10. Backup e restauração

- Cada empresa pode gerar seu próprio backup (export JSON completo dos
  dados) pelo painel Admin → Configurações → Backups — salvo no bucket
  `backups` do Supabase Storage (ou `prisma/backups/` local, só em
  desenvolvimento — ver seção 9 acima).
- Restauração: painel Super Admin → Empresas → Arquivar (gera backup
  automático antes) ou `POST /api/superadmin/backups/[id]/restaurar`
  (dry-run por padrão, exige confirmação do nome da empresa).
- Backup completo da plataforma (todas as empresas): use as ferramentas
  nativas do seu Postgres (`pg_dump`), fora do escopo do painel de
  qualquer empresa individual:
  ```bash
  pg_dump "$DATABASE_URL" -F c -f pedidoflow-completo.dump
  # restaurar:
  pg_restore --clean --if-exists -d "$DATABASE_URL" pedidoflow-completo.dump
  ```

## 11. Segurança — checklist antes de ir ao ar

- [ ] `SECRETS_MASTER_KEY` configurada (obrigatória para salvar credenciais de WhatsApp/fiscal por empresa).
- [ ] Senha do Super Admin e do administrador de demonstração trocadas.
- [ ] `DATABASE_URL` usa SSL (a maioria dos Postgres gerenciados exige).
- [ ] `DEMO_MODE=false` em produção (token de recuperação de senha nunca
      volta na resposta).
- [ ] Rodar `npm run test` (isolamento entre empresas) contra um banco
      de teste antes do primeiro deploy — ver `src/lib/__tests__/`.
- [ ] Rodar `npx tsc --noEmit` e `npm run lint` sem erros.
- [ ] HTTPS obrigatório (cookies de sessão são `secure` em produção).
