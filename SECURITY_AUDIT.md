# SECURITY_AUDIT — PedidoFlow (ciclo de venda comercial)

Auditoria de segurança focado nas **novas descobertas** deste ciclo e nas
defesas já ativas. Para a visão ampla de produção, ver
`CHECKLIST_SEGURANCA_PRODUCAO.md` e `AUDITORIA.md`.

---

## 1. Isolationamento multi-tenant (backend) — sólido

- Cada requisição roda em um `AsyncLocalStorage`; o proxy de Prisma
  (`src/lib/prisma.ts`) resolve o schema do tenant e **falha alto** se não
  há tenant ativo (nunca cai para um schema padrão/plataforma).
- Nenhuma rota alterada neste ciclo aceita `empresaId` vindo do cliente
  como fonte de autoridade — o tenant vem **sempre** do
  `autorizar()`/`ativarTenant()`.
- **Defesa em profundidade:** não confiar apenas no `autorizar()`; revisar
  rotas novas (como `pagamento-assinatura`) para confirmar que só o
  SUPER_ADMIN acessa.

## 2. Gaps corrigidos NESTE ciclo

### 2.1 WhatsApp webhook processava empresa inativa (Corrigido)
- **Antes:** `whatsapp/webhook/route.ts` dava seguimento à conversa mesmo
  com a empresa `bloqueada`/`suspensa`/com carência de assinatura
  esgotada → empresa inadimplente podia gerar pedidos via WhatsApp.
- **Agora:** checa `status` e `situacaoAssinatura()`; se não está em uso
  normal, responde `200` confirmando a entrega à Meta (evita retry) mas
  **não processa** a mensagem. Acesso `select` já traz `status`,
  `vencimentoEm`, `carenciaAte`.

### 2.2 Agente de impressão servia empresa inativa (Corrigido)
- **Antes:** `impressao/fila/route.ts` devolvia trabalhos à empresa
  bloqueada.
- **Agora:** empresa inativa recebe fila vazia (`{ itens: [],
  bloqueado: true }`) — o agente não trava, mas nenhum trabalho novo é
  servido. As rotas de progresso de impressão (concluir/erro/heartbeat/
  processando) continuam operacionais de propósito, para não travar uma
  impressão já em andamento.

## 3. Sustentação de conta / assinatura

- Suspensão/rejeição/vencimento **nunca apagam dados** — apenas bloqueiam
  o acesso normal.
- `podeUsarNormalmente()` considera `status` (ativa) + situação de
  assinatura (não vencida além da carência).
- Reativação via "registrar pagamento" recalcula prazos e volta a
  `status = "ativa"` mantendo todos os dados.

## 4. Auditoria (Super Admin)

- `Auditoria` ganhou `estadoAnterior`/`estadoNovo`; o PATCH de empresa no
  Super Admin registra antes/depois dos campos sensíveis (status, plano,
  módulos, vencimento, carência, trial, limite de mensagens de IA).
- Rastreabilidade completa de quem alterou o quê (com `registrarAuditoriaSuperAdmin`).

## 5. Credenciais / segredos

- Nenhuma credencial nova adicionada ao repo. Acesso a produção (Render/
  Railway/VPS, Meta, Postgres) é via variáveis de ambiente, fora do
  versionamento.

---

## Revisar antes do GA (parcialmente externo)
- Rodar o checklist completo de `CHECKLIST_SEGURANCA_PRODUCAO.md` num
  ambiente com banco real.
- Confirmar com o provedor de hospedagem o isolamento de `DATABASE_URL` e
  os certificados TLS.
- Teste de força bruta de login (rate limit) já existente — validar com
  carga.
