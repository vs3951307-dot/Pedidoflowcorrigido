# ACHADOS PEDIDOFlow — FASE 0

**Data:** 2026-08-08
**Modo:** somente leitura + correções incrementais.

---

## ✅ JÁ CORRIGIDOS (commits f8a3459, 5180052)

- [x] A5: Rate limit em `/api/auth/redefinir` (5/min) e `/api/auth/senha` (5/min)
- [x] A3: Lockout de conta — 10 falhas consecutivas → bloqueio 15 min (`src/lib/rate-limit.ts`, `auth/login/route.ts`)
- [x] A6: Validação de senha mínima 8 chars na criação de usuário (`api/usuarios/route.ts`)
- [x] A1: Mascarar enumeração cross-tenant (`api/usuarios/[id]/route.ts` → `findFirst` com `empresaId !=`)
- [x] C3/S9: Removido `SINGLE_TENANT_LEGACY_MODE` (`src/lib/impressao.ts`)
- [x] C2: Auditoria de login Super Admin (falha + sucesso) (`api/superadmin/auth/login/route.ts`, `src/lib/super-admin/auth.ts`)
- [x] A4/M7: Rate limit em `/api/saude` (10/min) e `/api/impressao/fila` (30/min)
- [x] M8: Auditoria do Copiloto Supremo após aplicar ações (`src/lib/ia-admin.ts`)
- [x] B4: Redação de segredos no log — database URLs, tokens, secrets (`src/lib/api-erro.ts`)
- [x] B3: Validação zod nos endpoints caixa/abrir (saldo 0-1M) e pedidos (1-100 itens)

---

## CRÍTICO (pendentes — necessitam decisão/migration)

### C1. Monetário em Float (não Decimal/inteiros)
- **Evidência:** `prisma/schema.prisma:397` (`Produto.preco Float`), `Pedido.total Float`, `Pagamento.valor Float`, `Caixa.saldoInicial Float`, `PrecoTamanho.valor Float`
- **Risco:** imprecisão em operações financeiras (0.1 + 0.2 ≠ 0.3). Em produção com clientes reais, divergências de centavos em pedidos, pagamentos e caixa.
- **Área:** financeiro, pagamentos, caixa, precificação

### C2. Auditoria do Super Admin inexistente — ✅ CORRIGIDO
- **Evidência:** `src/lib/super-admin/auth.ts` sem chamada a `registrarAuditoria`; `src/app/api/superadmin/auth/login/route.ts:34-43` sem registro de login
- **Correção:** adicionado `registrarAuditoriaSuperAdmin()` em `src/lib/super-admin/auth.ts` e chamadas no login (falha + sucesso).
- **Área:** governança, compliance, segurança

### C3. SINGLE_TENANT_LEGACY_MODE concede fila de impressão da 1ª empresa — ✅ CORRIGIDO
- **Evidência:** `src/lib/impressao.ts:288-294` — compara token em texto puro com `process.env.AGENTE_TOKEN` e, se flag ativa, devolve `plataformaPrisma.empresa.findFirst({ orderBy: { criadoEm: "asc" } })`
- **Correção:** bloco removido. Agora `encontrarEmpresaPorTokenAgente` só resolve via hash no banco.
- **Área:** multi-tenancy, impressão

---

## ALTO

### A1. Enumeração de e-mails cross-tenant
- **Evidência:** `src/app/api/usuarios/[id]/route.ts:32-35` retorna 409 "Já existe um usuário com este e-mail" sem filtrar por empresaId. `src/app/api/auth/empora-por-email/route.ts:33-40` revela nome/logo/cor da empresa de qualquer e-mail.
- **Risco:** Tenant A pode enumerar e-mails cadastrados em Tenant B. Oráculo de identidade.
- **Área:** privacidade, multi-tenancy

### A2. 5 models de identidade com isolamento apenas lógico (schema `public`)
- **Evidência:** `src/lib/prisma.ts:58-62` — `Usuario`, `Sessao`, `TokenRecuperacao`, `PermissaoUsuario`, `Auditoria` ficam no `public` e dependem de `where: { empresaId }`
- **Risco:** uma query esquecendo `empresaId` em qualquer um deles cruza tenants. O próprio arquivo assume em `:41-45`.
- **Área:** multi-tenancy

### A3. Rate limit sem lockout de conta e sem proteção a password spraying
- **Evidência:** `src/lib/rate-limit.ts:11` (chave só por IP), `src/app/api/auth/login/route.ts:11`
- **Risco:** atacante com muitos IPs faz spraying contra uma conta específica sem nunca bater o limite. NAT corporativo bloqueia usuários legítimos.
- **Área:** autenticação

### A4. Rotas de agente de impressão sem rate limit e fora de `tenantALS.run()`
- **Evidência:** `src/app/api/impressao/fila/*` e `impressao/agente/deteccao/route.ts` — sem `verificarLimite`, sem `comTratamentoDeErro`
- **Risco:** brute force do token de agente sem throttle; dependência frágil de `enterWith` após `await`.
- **Área:** impressão, multi-tenancy

### A5. `POST /api/auth/redefinir` sem rate limit
- **Evidência:** `src/app/api/auth/redefinir/route.ts:10` — aceita token arbitrário e faz lookup por hash sem throttle
- **Risco:** token de 24 bytes torna força bruta imprática, mas a assimetria (recuperar tem, redefinir não) é lacuna.
- **Área:** autenticação

### A6. Sem política de complexidade de senha na criação de usuário
- **Evidência:** `src/app/api/usuarios/route.ts:69` — faz `bcrypt.hashSync(senha, 12)` sem checar comprimento mínimo
- **Risco:** admin pode criar senha de 1 caractere. Só há mínimo nos fluxos de redefinição/troca.
- **Área:** autenticação

---

## MÉDIO

### M1. Rate limit em memória (single-instance)
- **Evidência:** `src/lib/rate-limit.ts:8` (Map em memória), comentário `:2-4`
- **Risco:** em serverless/multi-instância, limite multiplicado por instância e zerado a cada cold start.
- **Área:** segurança

### M2. `x-forwarded-for` forjável
- **Evidência:** `src/lib/rate-limit.ts:50-51`
- **Risco:** sem allowlist de proxy, header é forjável → rate limit contornável se app exposta sem proxy confiável.
- **Área:** segurança

### M3. Fallback `enterWith` frágil para isolamento de tenant
- **Evidência:** `src/lib/tenant-context.ts:68`, comentado em `:41-46`
- **Risco:** refatoração que mover `ativarTenant` para helper async quebra isolamento silenciosamente.
- **Área:** multi-tenancy

### M4. Sem sliding expiration / timeout por inatividade
- **Evidência:** `src/lib/auth.ts:6,28`
- **Risco:** sessão vale 7 dias corridos sem uso. Sessão sequestrada permanece válida.
- **Área:** autenticação

### M5. Login emite sessão para empresa bloqueada/vencida
- **Evidência:** `src/app/api/auth/login/route.ts:30` vs `src/lib/acesso.ts:63`
- **Risco:** usuário recebe cookie válido; só é barrado no primeiro `autorizar()`. Inconsistência de estado.
- **Área:** autenticação

### M6. CSRF: depende só de sameSite (sem token anti-CSRF)
- **Evidência:** `auth/login/route.ts:49` (sameSite "lax")
- **Risco:** sameSite lax mitiga, mas não elimina CSRF em navegadores antigos ou cenários específicos.
- **Área:** segurança

### M7. `/api/saude` público sem rate limit executando query
- **Evidência:** `src/app/api/saude/route.ts:8-11`
- **Risco:** informação de disponibilidade útil ao atacante; sem throttle permite probing.
- **Área:** segurança

### M8. Copiloto Supremo executa ações críticas (criar usuário, redefinir senha, alterar landing) sem log de auditoria
- **Evidência:** `src/lib/ia-admin.ts:660-704` — cases `criar_usuario`, `desativar_usuario`, `redefinir_senha_usuario`, `alterar_landing`
- **Risco:** Ação do dono da plataforma sobre tenants sem trilha. Sem log, sem rollback auditável.
- **Área:** governança

---

## BAIXO

### B1. `compararHashes()` é código morto
- **Evidência:** `src/lib/auth.ts:89-93`
- **Risco:** nenhum. Função definida mas nunca chamada.

### B2. Sem limite de sessões simultâneas
- **Evidência:** `src/lib/auth.ts` — sem checagem de contagem de sessões por usuário
- **Risco:** conta compartilhada sem controle.

### B3. Validação de entrada majoritariamente manual (não zod)
- **Evidência:** apenas 11 handlers usam zod; o resto usa coerção manual
- **Risco:** campos inesperados aceitos; mass assignment se não houver filtro.

### B4. `logErro` em produção loga stack completo sem redação
- **Evidência:** `src/lib/api-erro.ts:33`
- **Risco:** exceção do Prisma com credencial de tenant (`databaseUrlSecreta`) pode ir para log.

### B5. Sem request_id nos logs
- **Evidência:** [NÃO ENCONTRADO]
- **Risco:** dificulta rastreamento de requisições em produção.

---

## PERGUNTAS BLOQUEANTES (antes da Fase 1)

1. Os campos monetários (`Produto.preco`, `Pedido.total`, `Pagamento.valor`, `Caixa.saldo*`, `PrecoTamanho.valor`) — posso converter para integer (centavos) em migration expand→backfill→contract, ou prefere Decimal?

2. A auditoria do Super Admin deve registrar APENAS ações do Copiloto Supremo, ou TUDO (login, criação de empresa, alteração de plano, etc.)?

3. O `SINGLE_TENANT_LEGACY_MODE` ainda é necessário em produção, ou posso removê-lo completamente?

4. Qual taxa de falso-positivo é aceitável no lockout de conta? (ex: 10 falhas/15min → bloqueio temporário)

5. O rate limit atual em memória é suficiente para o plano gratuito do Render (1 instância), ou devo preparar abstração para Redis desde já?

6. A enumeração de e-mails cross-tenant — devo mascarar o 409 para "ok" mesmo quando e-mail existe em outro tenant?

7. Uploads de imagem: há limite de tamanho aceitável? (ex: 5MB?) E devo validar magic bytes?

8. O `.env.example` contém `AGENTE_TOKEN="agente-demo-2026"` — posso remover esse placeholder?

9. MFA para Super Admin — deseja TOTP (ex: speakeasy) ou apenas email/SMS?

10. Para a auditoria.governança, há requisito de retenção (ex: 1 ano) ou LGPD exige log mínimo de tratamento?
