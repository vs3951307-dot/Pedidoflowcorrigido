# Correções aplicadas — auditoria PedidoFlow

Data: 30/08/2026

## Limitação honesta deste trabalho

`prisma generate` **não roda** no ambiente onde esta auditoria foi feita
(`binaries.prisma.sh` retorna 403). Consequências:

- O Prisma Client é um stub de 4 KB, então `tsc --noEmit` produz ~30 erros
  que são **falsos positivos do stub**, não bugs do projeto. Nenhum deles
  foi "corrigido" — corrigir aquilo estragaria o código.
- **Não há resultado válido de typecheck, lint ou build de produção.**
  Você precisa rodar `npm run test:all` e `npm run build` na sua máquina.
- As suítes que exigem PostgreSQL real (`preco-pizza.test.ts`,
  `criar-pedido.test.ts`, `isolamento-*.test.ts`, `pagamentos-*.test.ts`)
  não foram executadas.

O que **foi** executado, e passou:

```
Test Files  4 passed (4)
     Tests  45 passed (45)
```

(`preco-pizza.puro.test.ts`, `precificacao.test.ts`, `analisar-texto.test.ts`,
`motor-usa-motor-de-pedidos.test.ts`)

---

## P0 — Tomada total da plataforma sem login

**Arquivos:** `src/app/emergencia/` (removido),
`src/app/api/emergencia/*/route.ts`, `src/lib/emergencia-guard.ts` (novo)

Existia uma página **pública, sem autenticação**, em `/emergencia`, com um
botão que enviava o token `"rozeno-emergencia-2026"` — escrito no
JavaScript do cliente. Esse mesmo valor era o **default no servidor**
quando `EMERGENCIA_TOKEN` não estava definida.

O endpoint fazia:

```ts
prisma.usuario.updateMany({ data: { senhaHash } });      // SEM where
prisma.superAdmin.updateMany({ data: { senhaHash } });   // SEM where
prisma.sessao.deleteMany();                              // SEM where
```

`updateMany` sem `where`: senha de **todos os usuários de todas as
empresas + todos os Super Admins** trocada para um valor escolhido por
quem chamasse. O `criar-usuarios` tinha fallback "pega qualquer empresa
ativa" e criava ADMINISTRADOR com a senha fixa `Rozeno@2026`.

Correções:

- Página `/emergencia` **removida**.
- Novo `emergencia-guard.ts`: sem `EMERGENCIA_HABILITADA=1` **e** um
  `EMERGENCIA_TOKEN` de 32+ caracteres, as rotas respondem **404**
  (não 403 — 403 confirmaria a existência da rota). Sem valor padrão:
  falha fechada. Comparação `timingSafeEqual`.
- `resetar-senhas`: exige e-mail, afeta **um** usuário, não alcança mais
  SuperAdmin, encerra só as sessões daquele usuário.
- `criar-usuarios`: exige `empresaId` explícito (sem fallback), senha no
  corpo (12+), papel em lista branca, e **nunca move usuário existente de
  empresa** — era assim que dava para sequestrar conta de outro tenant.
- Rate limit 5/hora + log de auditoria em ambos.

> **Se isso esteve no ar: trate todas as credenciais como comprometidas.**

## P0 — Cobrança errada no WhatsApp

**Arquivos:** `src/lib/atendente/motor.ts`, `src/lib/pedidos/criar-pedido.ts`

Existem duas funções chamadas `calcularPrecoItem`:

| Arquivo | Comportamento |
|---|---|
| `lib/preco-pizza.ts` | maior preço entre sabores + R$10 por sabor premium adicional + valida `maxSabores` e doce/salgado |
| `lib/precificacao.ts` | só `base + adicionais` — **ignora sabores** |

O PDV (`criar-pedido.ts`) importa as duas e escolhe certo.
O `motor.ts` (WhatsApp) importava **só a de `precificacao`**.

Pior: `criarPedidoReal` era uma **segunda implementação inteira** de
criação de pedido, escrevendo direto no Prisma.

Impacto no cardápio da Rozeno:

- Família com 3 especiais: PDV R$ 92, WhatsApp **R$ 72** — R$ 20 por pizza.
- Meio tradicional / meio especial: cobrava o preço do produto citado
  primeiro, não o maior.
- `maxSabores` não validado (dava para fechar 3 sabores numa Média).
- Sem `idempotencyKey` — o índice único criado na migration
  `20260815120000` **não era usado** nesse caminho.

Correção: `criarPedidoReal` agora delega ao `criarPedido()` do PDV.
Uma fonte de verdade. O total exibido ao cliente vem do **banco**.
Erro de regra vira transferência para humano com log, não pedido errado.
Adicionado suporte a `origem` (lista branca) em `criarPedido`.

## P0 — Idempotência do WhatsApp só em memória

**Arquivo:** `src/lib/atendente/motor.ts`

`deduplicador.ts` é um `Map` em memória. Todo deploy zera o mapa, e a Meta
reenvia por até 24 h — retry após deploy criava pedido duplicado real.

A chave de idempotência agora é gerada quando o **primeiro item entra no
carrinho** e persiste em `ConversaWhatsApp.estado` (Postgres). Sobrevive a
restart, redeploy e múltiplas instâncias. Um "sim" reenviado devolve o
mesmo pedido, sem reimprimir.

## P0 — `npm install` quebrava em Linux

**Arquivo:** `package.json`

`@next/swc-win32-x64-msvc` estava em `dependencies`. Verificado:

```
npm error code EBADPLATFORM
npm error notsup Unsupported platform for @next/swc-win32-x64-msvc@14.2.33
```

Deploy em Render/Docker **nunca instalaria**. Movido para
`optionalDependencies`.

## P1 — Retry infinito da Meta

**Arquivo:** `src/app/api/whatsapp/webhook/route.ts`

O webhook devolvia **501** quando o payload não tinha `value.messages`.
Mas a Meta manda `statuses` (enviada/entregue/lida), `errors` e mudanças
de template no mesmo webhook — nenhum tem `messages`. Quase todo callback
recebia 501, e a Meta reenfileira tudo que não é 2xx: log entupido e risco
de ter a assinatura desabilitada. Agora responde 200.

## P1 — Mensagem de WhatsApp podia sumir sem log

**Arquivo:** `src/app/api/whatsapp/webhook/route.ts`

O deduplicador marca a mensagem **antes** de processar. Se o processamento
lançava, o POST inteiro caía; no reenvio da Meta a mensagem já estava
marcada e era descartada. Resultado: o cliente mandava mensagem e **nunca
era respondido**, sem nada no log. Agora cada mensagem é isolada em
try/catch com `logErro` estruturado (empresaId, wamid, tipo) e aviso ao
cliente.

## P1 — Reset de senha do Super Admin atingia todos os clientes

**Arquivos:** `src/app/api/superadmin/resetar-senhas/route.ts`,
`src/app/superadmin/resetar-senhas/page.tsx`

Mesmo padrão `updateMany` sem `where`, agora atrás de autenticação — mas
um clique (ou uma sessão de Super Admin roubada) colocava a mesma senha em
todos os usuários de todas as empresas clientes e em todos os Super
Admins. A tela ainda vinha com `Rozeno@2026` preenchido.

Agora: `empresaId` obrigatório, uma empresa por vez, Super Admin não é
alcançável por aqui, senha 12+, campo vazio por padrão, confirmação
explícita e registro em auditoria.

## P2 — Rotas de debug removidas

`src/app/api/catalogo-teste/` (devolvia `error.stack` na resposta),
`src/app/api/debug-db/` e `src/app/api/debug-catalogo/` (vazias).

## Testes criados

- **`src/lib/preco-pizza.puro.test.ts`** (20 testes, sem banco) — a
  fórmula de preço não tinha nenhum teste que rodasse sem Postgres:
  `preco-pizza.test.ts` abre conexão no `beforeAll`, então num ambiente
  sem banco as 25 asserções não rodam e dá para quebrar o preço sem que
  nada acuse. Este arquivo **complementa**, não substitui, o teste com
  banco (que prova que o cadastro casa com o cardápio).
- **`src/lib/atendente/__tests__/motor-usa-motor-de-pedidos.test.ts`**
  (6 testes, sem banco) — guarda de arquitetura contra a volta do caminho
  paralelo de criação de pedido. **Verificado que falha** ao reintroduzir
  `tx.pedido.create(` no `motor.ts` e volta a passar ao reverter.

---

## O que NÃO foi auditado

Sendo explícito: **caixa, estoque, impressão, PDV, dashboard, RBAC,
fiscal**, e o isolamento multi-tenant nas ~80 rotas de API uma a uma.

O que foi verificado do isolamento:

- `src/lib/prisma.ts` — proxy que falha fechado (lança se um model de
  tenant for usado sem tenant ativo). Arquitetura sólida.
- `src/lib/api-erro.ts` — redação de segredos, sem vazamento de stack.
  Bem feito.
- Todas as chamadas a `prisma.usuario` / `sessao` / `permissaoUsuario` /
  `auditoria` (models que ficam no schema da plataforma e dependem só de
  `empresaId`). **Todas corretamente escopadas.** As de `ia-admin.ts` que
  cruzam tenant são chamadas só por rotas de Super Admin — é por design,
  não é falha.
- Nenhum `catch {}` silencioso no backend (os existentes são de
  `localStorage` no frontend, legítimos).

## Ponto cego maior: a "IA atendente" não é uma IA

`passoAtendimento` é um `switch` escrito à mão de ~580 linhas. A IA só
"normaliza" o texto antes de entrar no switch.

Por isso ela é ruim, e nenhum ajuste de prompt conserta:
`"troca o frango por bacon"` e `"manda uma coca também"` no meio da
escolha de tamanho **não têm estado** nessa arquitetura. Os exemplos do seu
pedido são impossíveis ali, não mal implementados.

A boa notícia: agora que o WhatsApp usa o `criarPedido()` do PDV, o motor
de cálculo que o tool calling precisaria **já existe e já é a fonte da
verdade**. As ferramentas (`add_item`, `calculate_order`, `confirm_order`)
viram wrappers finos. Mas é um projeto próprio, não um patch.

## Rodada 2 — prontidão para VPS

### HTTPS obrigatório (o `nginx.conf` quebrava o login)

**Arquivo:** `nginx.conf` (reescrito)

O config anterior servia **só HTTP na porta 80**. Com
`NODE_ENV=production`, o cookie de sessão sai com a flag `Secure`
(`src/app/api/auth/login/route.ts`) e o navegador se recusa a guardá-lo
numa página HTTP. O login responde 200 e devolve o usuário à tela de
login **sem erro nenhum**. Um dia inteiro caçando bug de autenticação
inexistente.

Outros quatro problemas no mesmo arquivo:

- **Sem `proxy_buffering off`** — o KDS, mesas e entregas usam SSE
  (`/api/kds/eventos`, `/api/eventos`). O nginx bufferiza por padrão, os
  eventos ficam presos e a cozinha nunca atualiza sozinha.
- **Sem `client_max_body_size`** — padrão de 1 MB; foto de produto e PDF
  de nota fiscal retornam 413.
- **`proxy_read_timeout` padrão (60s)** derrubava a conexão SSE a cada
  minuto.
- **`X-Forwarded-For` com `$proxy_add_x_forwarded_for`**, que concatena o
  valor mandado pelo cliente. `ipDaRequisicao()` lê o **primeiro** IP da
  lista — bastava mandar `X-Forwarded-For: 1.2.3.4` e variar o valor para
  escapar do rate limit de login e do lockout de conta. **Força bruta
  livre.** Agora usa `$remote_addr`, que descarta o header forjado.

### Falha rápida na subida

**Arquivo:** `instrumentation.ts`

Sem `SECRETS_MASTER_KEY`, o sistema subia normal e só quebrava no primeiro
WhatsApp ou na primeira nota fiscal — no meio de um atendimento real.
Agora o processo **se recusa a subir** em produção sem `DATABASE_URL` e
`SECRETS_MASTER_KEY` (32+ chars), e avisa se `EMERGENCIA_HABILITADA=1`
ficou ligada.

### PM2 sem `NODE_ENV`

**Arquivo:** `ecosystem.config.cjs` (novo)

O comando antigo era
`pm2 start "npm run start" --name pedidoflow -- -- -p 3000`: passava
argumentos por duas camadas de `--` e **não definia `NODE_ENV`**. Sem
`NODE_ENV=production` o Next roda em modo dev e — de novo — o cookie
perde a flag `Secure`.

Fixa `exec_mode: fork` e `instances: 1`: o tempo real, o rate limit e o
deduplicador de webhook são em memória. Em modo cluster a cozinha para de
receber pedidos de forma intermitente.

### `deploy.sh` reescrito

- `set -euo pipefail` (antes só `set -e`: falha dentro de pipe passava
  batido).
- **Dump do banco antes das migrations.** `migrate deploy` aplica DDL em
  banco de produção; sem dump prévio, um erro no meio não tem volta.
- Confere `.env` (`DATABASE_URL`, `SECRETS_MASTER_KEY`) antes de tudo.
- `unzip` preserva `.env` e `public/uploads/` — o `-o` anterior
  sobrescrevia.
- Verifica `/api/saude` no fim, em vez de imprimir "sucesso" sem checar
  nada. A sondagem respeita o rate limit de 10/min do endpoint.

### `db:reset` e `db:seed` bloqueados

**Arquivo:** `scripts/guarda-destrutiva.cjs` (novo)

`prisma migrate reset --force` apaga tudo sem perguntar, e `db:reset`
ficava a um Tab de distância de `db:deploy` no autocomplete. Agora exigem
`PEDIDOFLOW_CONFIRMO_APAGAR=SIM-EU-QUERO-APAGAR` e são recusados de
qualquer jeito com `NODE_ENV=production`. **Testado: bloqueia nos dois
casos.**

### Verificações desta rodada

- `npm ci --omit=dev` roda limpo com o lockfile corrigido (225 pacotes) —
  o `deploy.sh` depende disso.
- Sintaxe conferida em todos os arquivos alterados.
- 45 testes passando (4 suítes sem banco).

## Próximos passos

1. Revise este diff antes de qualquer coisa.
2. Se `/emergencia` esteve no ar, rotacione credenciais.
3. Rode `npm run test:all` e `npm run build` na sua máquina — eu não pude.
   Se `preco-pizza.test.ts` passar, a correção do WhatsApp está sólida.
4. Escreva um teste com banco que crie o mesmo pedido pelo PDV e pelo
   WhatsApp e afirme que os totais batem. É a ausência desse teste que
   deixou o bug de preço viver.
5. Só depois pense em tool calling.

## Variáveis novas

```
EMERGENCIA_HABILITADA=     # vazio = rotas /api/emergencia/* não existem
EMERGENCIA_TOKEN=          # 32+ chars: openssl rand -hex 32
```
