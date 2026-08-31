# PRODUCTION_READINESS — PedidoFlow (SaaS multiempresa)

Relatório final consolidado do ciclo de auditoria e correção voltado à
**venda comercial**. Este arquivo é a fonte de verdade do estado de
produção do sistema.

> Ciclo: auditoria massiva → correções no código → segunda auditoria.
> **Nesta fase NÃO foi feito deploy** — o código foi corrigido e validado
> localmente (typecheck + lint + testes de unidade), e as migrações de
> banco foram escritas para serem aplicadas no deploy seguinte.

---

## 1. Estado resumido

| Área | Status | Observação |
|---|---|---|
| Isolamento multi-tenant (backend) | ✅ Sólido | `AsyncLocalStorage` por requisição; proxy `prisma.ts` falha alto se não há tenant ativo. Nunca vaza para outro tenant. |
| WhatsApp webhook (status/vencimento) | ✅ Corrigido | Antes processava mensagens de empresa bloqueada/suspensa. |
| Agente de impressão (fila) | ✅ Corrigido | Antes servia trabalhos a empresa bloqueada/suspensa. |
| Assinatura com carência de 7 dias | ✅ Implementado | `carenciaAte` + lógica em `src/lib/assinatura.ts`; bloqueio só após carência. |
| Registrar pagamento de assinatura | ✅ Implementado | Nova rota + tela do Super Admin; reativa sem apagar dados. |
| Auditoria do Super Admin (antes/depois) | ✅ Implementado | `Auditoria.estadoAnterior/estadoNovo` + log no PATCH de empresa. |
| Login / RBAC / SUPER_ADMIN isolado | ✅ Ok | Auth do SuperAdmin totalmente separada; rate limit de login. |
| E-mail em múltiplas empresas | ⚠️ **NÃO implementado** | Decisão deliberada — ver `PENDING_TASKS.md` (requisito futuro, alto risco no login antes da venda). |
| IA / WhatsApp (conversa) | ✅ Revisado | Isolamento por `phone_number_id`, idempotência (wamid + carrinho + `criarPedido`), FSM completo, timeout de sessão (45 min), saudação única com nome da loja e linguagem natural curta (pizza/tamanho, entrega, preços reais). |
| Erro interno ao finalizar retirada | 🔶 Ainda por diagnosticar | Diagnóstico temporário ativo no ar; aguardando mensagem real do usuário. |
| Testes | ✅ (parciais) | 13 testes novos da assinatura; suíte de banco exige Postgres local. |
| Typecheck / Lint | ✅ Zerados | `npm run typecheck` e `npm run lint` passam. |

---

## 2. Correções deste ciclo (arquivos alterados)

### 2.1 Segurança — bloqueio de empresa inativa
- **`src/app/api/whatsapp/webhook/route.ts`**: o webhook agora checa
  `empresa.status` e a situação de assinatura (carência esgotada) antes de
  processar QUALQUER mensagem. Empresa bloqueada/suspensa/vencida tem a
  mensagem **confirmada (200)** mas **NÃO processada** (evita retry infinito
  da Meta sem permitir que a empresa inadimplente continue criando pedidos
  via WhatsApp).
- **`src/app/api/impressao/fila/route.ts`**: idem para a fila do agente de
  impressão — empresa inativa recebe fila vazia (sem quebra do agente),
  mas nenhum trabalho novo é servido.

### 2.2 Assinatura — carência de 7 dias (regra comercial)
- **`prisma/schema.prisma`**: `Empresa.carenciaAte` (fim da tolerância),
  model `AssinaturaPagamento` (histórico de pagamentos da assinatura),
  `Auditoria.estadoAnterior/estadoNovo` (diff de auditoria).
- **`src/lib/assinatura.ts`** (novo): funções puras `situacaoAssinatura`,
  `calcularCarenciaAte`, `podeUsarNormalmente`, `mensagemBloqueioAssinatura`.
  Regra: vencimento passado **não** bloqueia na hora — entra em carência
  por 7 dias corridos (`carenciaAte = vencimento + 7`); apenas quando a
  carência também passar a empresa fica **vencida** (bloqueada ao uso
  normal, dados intactos). Horário sempre do servidor.
- **`src/lib/acesso.ts`** (`autorizar()`/`exigirRota()`): substitui o
  bloqueio binário por vencimento pela lógica de carência; expõe
  `assinaturaWarning` + `diasRestantesCarencia` para o banner do usuário.
- **`src/app/api/superadmin/empresas/[id]/pagamento-assinatura/route.ts`**
  (novo) + **`src/lib/super-admin/assinatura.ts`**: registrar pagamento
  recalcula `planoInicioEm`, `vencimentoEm = hoje + ciclo`, `carenciaAte =
  vencimento + 7`, volta `status = "ativa"` — idempotente por
  `idempotencyKey`, nunca apaga dados.
- **`src/app/api/superadmin/empresas/[id]/route.ts`**: ao editar vencimento
  via painel, recalcula `carenciaAte` automaticamente; registra auditoria
  com antes/depois; GET devolve `carenciaAte`.
- **`src/app/api/superadmin/empresas/route.ts`**: lista devolve
  `carenciaAte`, `situacaoAssinatura` e `diasRestantesCarencia`.
- **`src/lib/super-admin/auth.ts`**: audit logger agora aceita
  antes/depois + empresaId.
- **Frontend**: banner de carência (`src/components/assinatura/aviso-carencia.tsx`)
  nos layouts do PDV/Admin/Atendimento/Cozinha/Garçom; painel do Super Admin
  (`detalhe-empresa.tsx`) mostra o estado efetivo de assinatura e o botão
  "Registrar pagamento da assinatura".

### 2.3 Infra de plataforma
- **`src/lib/prisma.ts`** e **`src/lib/tenant-provisionamento.ts`**:
  `assinaturaPagamento`/`AssinaturaPagamento` adicionados às listas de
  model de PLATAFORMA (ficam no schema `public`, nunca nos tents) — a
  criação de empresa/sincronização de tenant não tenta criá-los por tenant.

### 2.4 IA / WhatsApp — timeout de sessão (FASE 4)
- **`src/lib/atendente/motor.ts`**: adicionado
  `TEMPO_MAXIMO_INATIVIDADE_MS` (45 min). Uma conversa que ficou ociosa
  além do limite é RESETADA antes de processar a próxima mensagem: zera-se
  carrinho/endereço/pagamento e o cliente recomeça limpo (com aviso). Antes,
  um "sim" mandado dias depois confirmava um carrinho velho como pedido
  novo. Regra: conversas "nova" (primeira mensagem) e "criado" e as em
  atendimento humano não são resetadas.
- Confirmação (já existia e foi reavaliada): isolamento por
  `phone_number_id`, idempotência em 3 camadas (wamid + chave de carrinho +
  `criarPedido`), FSM completa usando o `criarPedido()` compartilhado e
  timeouts de IA/API da Meta.

### 2.5 IA / WhatsApp — saudação única e linguagem natural (FASE 5)
- **`src/lib/atendente/persona.ts`**: fonte única da saudação —
  `montarSaudacao(persona, nomeCliente, loja)`. Com nome → "Olá, {cliente}! 😊
  Eu sou a {nome}, atendente da {loja}! 🍕💜 Como posso ajudar você hoje?";
  sem nome → "Olá! 😊 O que você deseja hoje?". `SUGESTAO_INICIAL` deixou de
  ser concatenada (não repete o cumprimento a cada resposta).
- **`src/lib/atendente/catalogo.ts`**: nova `nomeFantasia(empresaId)` lê o nome
  real da loja da config `empresa` (mesma fonte de `horarioFuncionamento`).
- **`src/lib/atendente/motor.ts`**:
  - `saudacaoComPersona` passou a ser **async** e monta a saudação com o nome
    da loja; a saudação é exibida **uma única vez** no início da conversa.
  - Entende linguagem natural curta: busca direta de produtos usa
    `limparBusca` (remove verbos/artigos) para "me vê uma coca 2 litros";
    `querPedir`/`querCardapio` ampliados ("manda", "pode ser", "qual o preço",
    "quanto custa", "quais sabores"); nova intenção `querEntrega` +
    `responderSobreEntrega` responde com taxa de entrega real
    (`lerConfigTaxaEntrega` + `calcularTaxaEntrega`) e bairro.
  - A 1ª mensagem reconhece intenção clara (pedir/cardápio/promoção/horário/
    **entrega**/regras) e pula direto para a `intencao`, sem perguntar o nome
    nem repetir a saudação no branch `querSaudacao`.

---

## 3. Migrações de banco (aplicar no deploy)

`prisma/migrations/20260831000000_carencia_e_pagamento_assinatura/migration.sql`
- `Empresa.carenciaAte TIMESTAMP(3)`
- `Auditoria.estadoAnterior TEXT` / `estadoNovo TEXT`
- `AssinaturaPagamento` (tabela + índices + FK para Empresa)

> Aplicar com `npm run db:deploy` (ou `prisma migrate deploy`) **no
> ambiente de produção/homologação**, junto com `npm run db:sync-tenants`
> para manter os schemas dos tenants em dia (a sincronização adiciona
> colunas faltantes de forma segura). **IMPORTANTE:** este passo é do
> deploy — não foi executado nesta fase (sem acesso ao banco).

---

## 4. Segunda auditoria (arquivos alterados)

- Isolamento preservado: as rotas alteradas continuam resolvendo o tenant
  apenas via `autorizar()`/`ativarTenant()` (nunca aceitam `empresaId` do
  cliente).
- O proxy `prisma.ts` continua falhando alto (sem tenant ativo → erro,
  nunca vazamento silencioso).
- Os novos models são de plataforma (não entram no schema dos tenants).
- A lógica de carência acumula apenas estado derivado (não persiste
  "estado de carência" des sincronizado): `carenciaAte` é a única fonte e
  é recalculado ao editar vencimento.
- Nenhum dado é apagado em suspensão/rejeição/reativação.

---

## 5. Como validar (rolo de produção)

1. `npm run typecheck` ✅
2. `npm run lint` ✅
3. `npx vitest run src/lib/__tests__/assinatura.test.ts src/lib/atendente/__tests__/motor-usa-motor-de-pedidos.test.ts` ✅ (20 testes)
4. Suítes de banco (`npm run test`) exigem um PostgreSQL local/homologação
   com `DATABASE_URL` → este ambiente offline não pôde executá-las.
5. Roteiro manual antes da venda: ver `TESTE-FINAL-PEDIDOFLOW.md`.

---

## 6. Pendências conhecidas → `PENDING_TASKS.md`

- E-mail em múltiplas empresas (requisito futuro, decisão deliberada).
- Causa raiz do "erro interno ao finalizar retirada" (diagnóstico
  temporário ativo).
- Executar migração de banco + sincronizar tenants no deploy.
- Validação externa da integração Meta/WhatsApp real (em homologação).
