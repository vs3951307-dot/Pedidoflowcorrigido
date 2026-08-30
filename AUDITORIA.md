# AUDITORIA PEDIDOFlow — FASE 0 (Somente Leitura)

**Data:** 2026-08-08
**Escopo:** código-fonte em `C:\Users\conta\Desktop\projetoclaud\pedidoflow-plataforma-saas-corrigido (1)`
**Modo:** somente leitura — nenhum arquivo foi modificado.

---

## 1. RESUMO EXECUTIVO

1. Next.js 14 (App Router) + TypeScript + Prisma sobre PostgreSQL multi-tenant (schema por empresa).
2. 94 rotas de API, 132 handlers, 41 models Prisma, sem `middleware.ts` de borda.
3. Sessões stateful (cookie `sessao`, token 256 bits hasheado em SHA-256, bcrypt cost 12).
4. Multi-tenancy forte em dados operacionais (schema dedicado + proxy Prisma fail-closed), fraco em 5 models de identidade no `public` (isolamento apenas lógico).
5. Sem MFA, sem gateway de pagamento, sem Baileys (WhatsApp oficial via Cloud API).
6. 4 testes unitários, sem coverage, sem E2E.
7. Rate limiting em memória (single-instance), sem lockout de conta.
8. Segredos apenas em `.env` (não versionado), mas `.env.example` expõe placeholder `AGENTE_TOKEN="agente-demo-2026"`.
9. Copiloto Supremo pode executar ações críticas sobre tenants sem auditoria.
10. Float/double usado para monetário em vários models (risco de precisão).

---

## 2. STACK REAL

| Item | Valor | Evidência |
|------|-------|-----------|
| Linguagem | TypeScript 5.5 | `package.json:74`, `tsconfig.json` |
| Framework | Next.js 14.2.35 (App Router) | `package.json:47` |
| Frontend | React 18.3 + Tailwind 3.4 + shadcn/ui (Radix) | `package.json:52,72`, `components.json` |
| Backend | Next.js API Routes (94 rotas) | `src/app/api/**/route.ts` |
| ORM | Prisma 5.22 | `package.json:28`, `prisma/schema.prisma:8-10` |
| Banco | PostgreSQL (provider = postgresql) | `prisma/schema.prisma:13` |
| Aut | sessões stateful + bcrypt + cookies httpOnly | `src/lib/auth.ts:12-18` |
| Pacotes | npm (lockfile v3) | `package-lock.json:4` |
| Build | `next build` (cross-env NODE_OPTIONS=--max-old-space-size=2048) | `package.json:8` |
| Testes | Vitest 4.1 + happy-dom + Testing Library | `package.json:75-78`, `vitest.config.ts` |
| PWA | manual (manifest + sw.js hand-written) | `public/manifest.json`, `public/sw.js` |
| Docker | [NÃO ENCONTRADO] para a app (só doc p/ Postgres local) | `COMO-RODAR-LOCALMENTE.md:11` |
| Hospedagem | Render (free, 1 instância) + opção Oracle Cloud/PM2/Nginx | `render.yaml`, `deploy.sh` |
| IA | OpenAI + Gemini (fetch nativo, sem SDK) | `src/lib/ai-provider.ts:17` |
| WhatsApp | Meta Cloud API oficial (graph.facebook.com) | `src/lib/atendente/whatsapp-api.ts:5` |
| Storage | Supabase Storage (REST) ou disco local | `src/lib/storage.ts:27,42` |
| E-mail | Resend (REST) | `src/lib/email.ts:22` |
| Fiscal | Provedor NFC-e genérico (REST) | `src/lib/fiscal/provedor.ts:5-10` |
| Pagamento | [NÃO ENCONTRADO] gateway (só registro contábil interno) | — |

---

## 3. MAPA DE ROTAS E ENDPOINTS

### 3.1 Cobertura

- **94 arquivos** `route.ts` sob `src/app/api/`
- **132 handlers HTTP** no total
- **77 rotas de tenant** chamam `autorizar()` com recurso nomeado
- **13 rotas Super Admin** chamam `autorizarSuperAdmin()`
- **6 rotas de agente** usam token `x-agente-token`
- **7 rotas públicas** por desenho (login, logout, recuperar, redefinir, empresa-por-email, landing-config, planos-publicos)

### 3.2 Rotas públicas por desenho

| Método | Path | Arquivo | Observação |
|--------|------|---------|------------|
| POST | `/api/auth/login` | `auth/login/route.ts:9` | rate limit 5/min |
| POST | `/api/auth/recuperar` | `auth/recuperar/route.ts:33` | rate limit 3/10min |
| POST | `/api/auth/redefinir` | `auth/redefinir/route.ts:10` | **sem rate limit** |
| POST | `/api/auth/empresa-por-email` | `auth/empresa-por-email/route.ts:18` | rate limit 20/min |
| PATCH | `/api/auth/senha` | `auth/senha/route.ts:20` | **sem rate limit** |
| GET | `/api/landing-config` | `landing-config/route.ts:18` | conteúdo comercial |
| GET | `/api/planos-publicos` | `planos-publicos/route.ts:15` | planos ativos |
| GET | `/api/saude` | `saude/route.ts:8` | **sem auth, sem rate limit** |

### 3.3 Multi-tenancy: origem do empresaId

- **Única fonte:** sessão validada no banco (`src/lib/acesso.ts:141`, `src/lib/auth.ts:44-47`).
- **Nenhuma rota** lê `empresaId` de body/query/header (grep exaustivo = zero resultados).
- Exceções legítimas: token de agente (`src/lib/impressao.ts:279`), phone_number_id WhatsApp (`src/app/api/whatsapp/webhook/route.ts:27-30`).

### 3.4 Validação de entrada

- Apenas **11 handlers** usam zod (`validarCorpo` ou `safeParse`).
- Restante usa coerção manual `String(corpo.x ?? "")`.
- `src/lib/validar.ts` reporta só o primeiro erro, só valida corpo (não query/params).

### 3.5 Endpoints sem auth que merecem atenção

| Path | Arquivo | Risco |
|------|---------|-------|
| `/api/saude` | `saude/route.ts:8` | público, sem rate limit, faz `$queryRaw` |
| `/api/auth/redefinir` | `auth/redefinir/route.ts:10` | sem rate limit (token 24 bytes mitiga) |
| `/api/auth/senha` | `auth/senha/route.ts:20` | sem rate limit (brute force da senha atual) |

---

## 4. AUTENTICAÇÃO

| Item | Estado | Evidência |
|------|--------|-----------|
| Login em 2 etapas (email→empresa) | [VERIFICADO-OK] | `auth/empresa-por-email/route.ts:18`, `auth/login/route.ts:9` |
| Hash bcrypt cost 12 | [VERIFICADO-OK] | `src/lib/auth.ts:9`, `auth/redefinir/route.ts:40` |
| Token 256 bits (CSPRNG) + SHA-256 | [VERIFICADO-OK] | `src/lib/auth.ts:12-18` |
| Cookie httpOnly + sameSite=lax + secure em prod | [VERIFICADO-OK] | `auth/login/route.ts:47-53` |
| Sessão 7 dias, sem sliding expiration | [VERIFICADO-PARCIAL] | `src/lib/auth.ts:6,28` |
| Logout com revogação server-side | [VERIFICADO-OK] | `src/lib/auth.ts:34-36` |
| Revogação após troca de senha | [VERIFICADO-OK] | `auth/redefinir/route.ts:48` |
| Recuperação: token 30 min, resposta genérica | [VERIFICADO-OK] | `auth/recuperar/route.ts:9,52-57` |
| Rate limit login 5/min/IP | [VERIFICADO-PARCIAL] | `auth/login/route.ts:11` |
| Resposta genérica anti-enumeração | [VERIFICADO-OK] | `auth/login/route.ts:30-34` |
| MFA / 2FA | [NÃO ENCONTRADO] | — |
| Limite de sessões simultâneas | [NÃO ENCONTRADO] | — |
| Lockout de conta | [NÃO ENCONTRADO] | — |
| CSRF token explícito | [NÃO ENCONTRADO] | depende só de sameSite |

---

## 5. AUTORIZAÇÃO E PERMISSÕES

| Item | Estado | Evidência |
|------|--------|-----------|
| RBAC com 5 papéis | [VERIFICADO-OK] | `src/lib/permissao.ts:6-12` |
| 21 recursos definidos | [VERIFICADO-OK] | `src/lib/permissao.ts:24-46` |
| Validação server-side (`autorizar`) | [VERIFICADO-OK] | `src/lib/acesso.ts:51-142` |
| Semântica OR entre recursos | [VERIFICADO-PARCIAL] | `src/lib/acesso.ts:106` |
| Super Admin caminho separado | [VERIFICADO-OK] | `src/lib/super-admin/auth.ts:89-99` |
| Todas 94 rotas com guarda ou pública por desenho | [VERIFICADO-OK] | varredura completa |
| Auditoria de ações do Super Admin | [NÃO ENCONTRADO] | `src/lib/super-admin/auth.ts` sem `registrarAuditoria` |
| `middleware.ts` de borda | [NÃO ENCONTRADO] | — |

---

## 6. MULTI-TENANCY

| Item | Estado | Evidência |
|------|--------|-----------|
| Schema PostgreSQL dedicado por empresa | [VERIFICADO-OK] | `src/lib/tenant-db.ts:70-80` |
| Suporte a banco dedicado (URL criptografada) | [VERIFICADO-OK] | `src/lib/tenant-db.ts:151-154` |
| Proxy Prisma fail-closed | [VERIFICADO-OK] | `src/lib/prisma.ts:76-86` |
| empresaId NUNCA vem de entrada do cliente | [VERIFICADO-OK] | `src/lib/acesso.ts:34-38` |
| Validação anti-injection do nome do schema | [VERIFICADO-OK] | `src/lib/tenant-db.ts:59-64` |
| AsyncLocalStorage por requisição | [VERIFICADO-OK] | `src/lib/tenant-context.ts:53` |
| Testes de isolamento cross-tenant | [VERIFICADO-OK] | `src/lib/__tests__/isolamento-multiempresa.test.ts:66-124` |
| 5 models de identidade no `public` (só isolamento lógico) | [VERIFICADO-PARCIAL] | `src/lib/prisma.ts:58-62` |
| RLS (Row Level Security) | [NÃO ENCONTRADO] | — |
| FORCE ROW LEVEL SECURITY | [NÃO ENCONTRADO] | — |
| service_role / BYPASSRLS | [NÃO ENCONTRADO] | — |
| `SINGLE_TENANT_LEGACY_MODE` = fallback p/ 1ª empresa | [VERIFICADO-PARCIAL] | `src/lib/impressao.ts:288-294` |

---

## 7. MODELO DE DADOS

### 7.1 Models principais (41 total)

**Plataforma (public):** Empresa, Plano, SuperAdmin, SessaoSuperAdmin, Usuario, Sessao, TokenRecuperacao, PermissaoUsuario, Auditoria, UsoIa, LandingConfig, AcaoPendenteCopiloto, HistoricoCopiloto

**Tenant (schema dedicado):** Cliente, Categoria, Produto, Sabor, Tamanho, Adicional, Mesa, Pedido, ItemPedido, Pagamento, Caixa, MovimentacaoCaixa, EstoqueProduto, MovimentacaoEstoque, NotaFiscal, Entregador, Entrega, DocumentoFiscal, ConversaWhatsApp, MensagemWhatsApp, FilaImpressao, ContadorPedido, ProdutoSabor, PrecoTamanho, + structs

### 7.2 Monetário

| Campo | Tipo | Evidência | Risco |
|-------|------|-----------|-------|
| `Produto.preco` | Float | `schema.prisma:397` | **ALTO** — float para dinheiro |
| `Pedido.total` | Float | `schema.prisma` | **ALTO** |
| `Pagamento.valor` | Float | `schema.prisma:616` | **ALTO** |
| `Caixa.saldoInicial` | Float | `schema.prisma:652` | **ALTO** |
| `PrecoTamanho.valor` | Float | `schema.prisma:462` | **ALTO** |

**Nenhum campo monetário usa Decimal ou integer (centavos).**

### 7.3 Models sem empresaId que deveriam ter

| Model | Linha | Risco |
|-------|-------|-------|
| `Sessao` | `schema.prisma:298` | Baixo (resolvido via `usuario.empresaId`) |
| `TokenRecuperacao` | `schema.prisma:309` | Baixo |
| `PermissaoUsuario` | `schema.prisma:320` | Médio |
| `ItemPedido` | `schema.prisma:594` | Baixo (escopo via `pedido.empresaId`) |
| `Endereco` | `schema.prisma:365` | Baixo (escopo via `cliente`) |

---

## 8. SEGREDOS E CREDENCIAIS

| Item | Estado | Evidência |
|------|--------|-----------|
| `.env` no .gitignore | [VERIFICADO-OK] | `.gitignore:5` |
| `.env` real existe (local) | [VERIFICADO-OK] | `.env` na raiz |
| `.env` tem só DATABASE_URL local | [VERIFICADO-OK] | `.env:1-2` (localhost:5433) |
| `.env.example` tem placeholder `AGENTE_TOKEN` | [VERIFICADO-PARCIAL] | `.env.example:120` |
| Chave de API em texto no src | [NÃO ENCONTRADO] | grep `sk-`, `Bearer` longo = zero |
| Segredos criptografados (AES-256-GCM) | [VERIFICADO-OK] | `src/lib/crypto-segredos.ts` |
| `NEXT_PUBLIC_` expõe algo sensível | [NÃO ENCONTRADO] | — |

---

## 9. INTELIGÊNCIA ARTIFICIAL

| Item | Estado | Evidência |
|------|--------|-----------|
| Provedores OpenAI + Gemini | [VERIFICADO-OK] | `src/lib/ai-provider.ts:17` |
| 3 papéis (whatsapp, copiloto_empresa, copiloto_supremo) | [VERIFICADO-OK] | `src/lib/ai-provider.ts:16` |
| Fetch nativo (sem SDKs) | [VERIFICADO-OK] | `src/lib/ai-provider.ts:92,122` |
| Copiloto Supremo com tools | [VERIFICADO-OK] | `src/lib/ia-admin.ts:660-704` |
| Copiloto Supremo: ações sobre tenants | [VERIFICADO-PARCIAL] | criar/desativar usuário, redefinir senha, alterar landing, status empresa |
| Copiloto Supsemo: SEM auditoria | [VERIFICADO-PARCIAL] | sem `registrarAuditoria` |
| Copiloto empresa: tools de estoque | [VERIFICADO-OK] | `src/lib/copiloto/tools-estoque.ts` |
| Anthropic / Claude | [NÃO ENCONTRADO] | — |
| Prompt injection cross-tenant | [VERIFICADO-PARCIAL] | contexto montado backend, risco baixo |
| IA executa SQL direto | [NÃO ENCONTRADO] | — |
| Abstração de provider | [VERIFICADO-OK] | `src/lib/ai-provider.ts` |

---

## 10. WHATSAPP

| Item | Estado | Evidência |
|------|--------|-----------|
| Meta Cloud API (graph.facebook.com) | [VERIFICADO-OK] | `src/lib/atendente/whatsapp-api.ts:31` |
| API OFICIAL | [VERIFICADO-OK] | `src/lib/atendente/whatsapp-api.ts:5-8` |
| Validação HMAC-SHA256 | [VERIFICADO-OK] | `webhook/route.ts:113` |
| Deduplicação por wamid | [VERIFICADO-OK] | `webhook/route.ts:187` |
| Baileys / whatsapp-web.js | [NÃO ENCONTRADO] | — |
| Evolution API | [NÃO ENCONTRADO] | — |

---

## 11. UPLOADS

| Item | Estado | Evidência |
|------|--------|-----------|
| Produto foto: POST `/api/produtos/[id]/foto` | [VERIFICADO-OK] | `produtos/[id]/foto/route.ts` |
| Supabase Storage ou disco local | [VERIFICADO-OK] | `src/lib/storage.ts:42,71` |
| SVG handler | [VERIFICADO-PARCIAL] | `src/app/api/catalogo/extrair-pdf/route.ts` |
| Validação de extensão/MIME | [VERIFICADO-PARCIAL] | `src/lib/storage.ts` |
| Magic bytes | [NÃO ENCONTRADO] | — |
| Tamanho máximo | [NÃO ENCONTRADO] | — |

---

## 12. TESTES

| Item | Estado | Evidência |
|------|--------|-----------|
| Framework Vitest 4.1 | [VERIFICADO-OK] | `package.json:75` |
| 4 arquivos de teste | [VERIFICADO-OK] | `src/lib/precificacao.test.ts`, `src/lib/cardapio/analisar-texto.test.ts`, `src/lib/__tests__/isolamento-multiempresa.test.ts`, `src/__tests__/config-produtos.dom.test.tsx` |
| Teste cross-tenant | [VERIFICADO-OK] | `src/lib/__tests__/isolamento-multiempresa.test.ts` |
| Coverage | [NÃO ENCONTRADO] | — |
| E2E (Playwright/Cypress) | [NÃO ENCONTRADO] | — |
| Teste de matriz de permissões | [NÃO ENCONTRADO] | — |
| Teste de concorrência/dinheiro | [NÃO ENCONTRADO] | — |

---

## 13. PLANOS E LIMITES

| Item | Estado | Evidência |
|------|--------|-----------|
| Verificação server-side de limite | [VERIFICADO-OK] | `src/lib/limites-plano.ts:14` |
| Limite de usuários | [VERIFICADO-OK] | `src/lib/limites-plano.ts:14-27` |
| Limite de produtos | [VERIFICADO-OK] | `src/lib/limites-plano.ts:31+` |
| Contadores de uso (UsoIa) | [VERIFICADO-OK] | `src/lib/uso-ia.ts` |
| Checagem só no frontend | [NÃO ENCONTRADO] | — |

---

## 14. RATE LIMITING

| Item | Estado | Evidência |
|------|--------|-----------|
| Implementação em memória (Map) | [VERIFICADO-PARCIAL] | `src/lib/rate-limit.ts:8` |
| Login 5/min | [VERIFICADO-OK] | `auth/login/route.ts:11` |
| Recuperar senha 3/10min | [VERIFICADO-OK] | `auth/recuperar/route.ts:34` |
| x-forwarded-for forjável | [VERIFICADO-PARCIAL] | `src/lib/rate-limit.ts:50-51` |
| Redis p/ multi-instância | [NÃO ENCONTRADO] | — |
| Lockout de conta | [NÃO ENCONTRADO] | — |

---

## 15. TRATAMENTO DE ERROS

| Item | Estado | Evidência |
|------|--------|-----------|
| Wrapper `comTratamentoDeErro` | [VERIFICADO-OK] | `src/lib/api-erro.ts:46` |
| 500 genérico em prod | [VERIFICADO-OK] | `src/lib/api-erro.ts:59-62` |
| Stack em log em prod | [VERIFICADO-PARCIAL] | `src/lib/api-erro.ts:33` |
| request_id | [NÃO ENCONTRADO] | — |

---

## 16. INFRAESTRUTURA E HOSPEDAGEM

| Item | Estado | Evidência |
|------|--------|-----------|
| Render (plano free, 1 instância) | [VERIFICADO-OK] | `render.yaml:13` |
| Health check `/api/saude` | [VERIFICADO-OK] | `render.yaml:17` |
| Auto-deploy | [VERIFICADO-OK] | `render.yaml:18` |
| Oracle Cloud + PM2 + Nginx (alternativa) | [VERIFICADO-OK] | `deploy.sh`, `nginx.conf` |
| Dockerfile | [NÃO ENCONTRADO] | — |
| CI/CD (.github) | [NÃO ENCONTRADO] | — |
| SSE em memória (single-process) | [VERIFICADO-PARCIAL] | `src/lib/eventos-tempo-real.ts` |

---

## 17. MIGRATIONS

| Item | Estado | Evidência |
|------|--------|-----------|
| Prisma Migrate | [VERIFICADO-OK] | 12 migrations em `prisma/migrations/` |
| última: `20260807100000_descoberta_tenant_plataforma` | [VERIFICADO-OK] | `prisma/migrations/` |
| Migrations destrutivas DROP/RENAME | [NÃO ENCONTRADO] | — |

---

## TABELA RESUMO

| ITEM | STATUS |
|------|--------|
| Stack (Next.js + Prisma + PG) | VERIFICADO-OK |
| 94 rotas mapeadas | VERIFICADO-OK |
| Autenticação (bcrypt + sessão) | VERIFICADO-OK |
| MFA | NÃO ENCONTRADO |
| Autorização RBAC server-side | VERIFICADO-OK |
| Auditoria Super Admin | NÃO ENCONTRADO |
| Multi-tenancy (schema dedicado + proxy fail-closed) | VERIFICADO-OK |
| RLS | NÃO ENCONTRADO |
| Monetário (Float) | VERIFICADO-PARCIAL |
| Criptografia segredos (AES-256-GCM) | VERIFICADO-OK |
| Segredos no código | NÃO ENCONTRADO |
| WhatsApp Cloud API oficial | VERIFICADO-OK |
| Gateway de pagamento | NÃO ENCONTRADO |
| Testes cross-tenant | VERIFICADO-OK |
| Coverage/E2E | NÃO ENCONTRADO |
| Rate limit em memória | VERIFICADO-PARCIAL |
| Lockout de conta | NÃO ENCONTRADO |
| CSRF token | NÃO ENCONTRADO |
| `middleware.ts` de borda | NÃO ENCONTRADO |
| CI/CD | NÃO ENCONTRADO |
