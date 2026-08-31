# PENDING_TASKS — PedidoFlow

Lista de pendências e decisões adiadas do ciclo de venda comercial.
Mantenha este arquivo atualizado ao resolver cada item.

---

## 1. [E-MAIL MULTI-EMPRESA] — Mudança estrutural prioritária (DECIDIDO: adiar)

**Requisito (futuro):** permitir que o mesmo e-mail exista em várias
empresas sem colisão de login.

**Situação atual:** `Usuario.email` é `@unique` global no
`prisma/schema.prisma`. Isso impede o mesmo e-mail em duas empresas.

**Como ficaria:** trocar `email @unique` por `@@unique([empresaId, email])`.

**Impacto (≈10 arquivos do fluxo de auth):**
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/empresa-por-email/route.ts`
- `src/app/api/auth/recuperar/route.ts`
- `src/lib/auth.ts`
- `src/app/api/superadmin/empresas/[id]/usuarios/route.ts`
- `src/app/api/.../usuarios/route.ts` e `[id]/route.ts`
- `src/app/api/superadmin/empresas/route.ts`
- rotas de emergência (`emergencia/*`)
- `src/lib/ia-admin.ts` (localiza usuário por e-mail)

**DECISÃO (registrada):** NÃO alterar agora. O requisito é explicitamente
"futuramente" e tocar o login antes da venda arrisca desestabilizar o
fluxo crítico. Registrar como candidato a PR pós-lançamento.

**Ao implementar:** criar migration `DROP INDEX "Usuario_email_key"` +
`ADD CONSTRAINT "Usuario_empresaId_email_key"`, revisar cada rota acima
para buscar por `{ empresaId, email }` e ajustar a UI que pede "e-mail já
cadastrado".

---

## 2. [IA / WHATSAPP] — Revisão de conversa ✅ (concluída)
- Isolamento por `phone_number_id` ✅
- Idempotência em 3 camadas (wamid + chave de carrinho + `criarPedido`) ✅
- **Timeout de sessão** ✅ — `TEMPO_MAXIMO_INATIVIDADE_MS` (45 min) em
  `src/lib/atendente/motor.ts`: conversa ociosa é resetada (carrinho/
  endereço/pagamento zerados) antes de processar; conversa "nova"/"criado"/
  humana não são resetadas. Antes, um "sim" antigo confirmava carrinho velho.
- Restante: validar integração Meta real (número/telefone/template) — externo.

---

## 3. [ERRO RETIRADA] — Causa raiz do "erro interno ao finalizar retirada"
- O deploy de diagnóstico (`05f0722`) com `src/lib/api-erro.ts` mostrando a
  mensagem real permanece **no ar**.
- **Próximo passo:** o usuário tenta finalizar uma retirada no PDV e
  reporta a mensagem de erro real que aparecer.
- **Ao identificar:** corrigir no código e reverter o `api-erro.ts` para o
  comportamento original (não expor detalhes).

---

## 4. [BASE DE TESTES] — Suítes que exigem Postgres
- As suítes `src/lib/pedidos/*`, `pagamentos/*`, `tenant-provisionamento`,
  `isolamento-*`, `copiloto` exigem um PostgreSQL real com `DATABASE_URL`
  (muitas via `src/lib/__tests__/ajuda-banco-de-teste.ts`).
- **Ação:** rodar em homologação/CI com Postgres antes do BETA/GA.

---

## 5. [VALIDAÇÕES EXTERNAS] — Dependências fora do código
- Credenciais de produção: Render/Railway/VPS, Meta/WhatsApp, Postgres.
- Verificação manual do fluxo de assinatura (UI do Super Admin) em um
  ambiente com banco real.
- Teste "teste-para-venda" completo (ver `TESTE-FINAL-PEDIDOFLOW.md`).

---

## 6. [UI] — Banner de carência no layout do entregador
- `entregador/layout.tsx` ficou de fora da injeção do
  `aviso-carencia.tsx`. Avaliar se o entregador merece o aviso.

---

## Concluído neste ciclo (referência)
- FASE 0 segurança: webhook WhatsApp + fila de impressão respeitam status.
- FASE 1 assinatura: carência de 7 dias + registrar pagamento + UI.
- FASE 3 auditoria estruturada: antes/depois no PATCH do Super Admin.
- FASE 4 IA/WhatsApp: timeout de sessão (45 min) + revalidação de
  idempotência/isolamento/completude.
- FASE 5 testes: 13 testes em `src/lib/__tests__/assinatura.test.ts` +
  guarda de timeout do motor (`motor-usa-motor-de-pedidos.test.ts`).
- FASE 6 IA/WhatsApp — saudação única e linguagem natural: saudação exibida
  uma única vez com o nome real da loja (`persona.ts` + `nomeFantasia`),
  sem repetir o cumprimento nas respostas; busca direta de produtos com
  `limparBusca` ("me vê uma coca 2 litros"); intenção de entrega responde
  com taxa/bairro reais; 1ª mensagem com intenção clara pula o nome do
  cliente.
- Documentação: `PRODUCTION_READINESS.md` (relatório final), `SECURITY_AUDIT.md`, este arquivo.
