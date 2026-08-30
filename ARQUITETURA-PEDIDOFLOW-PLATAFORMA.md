# Arquitetura PedidoFlow — Plataforma SaaS Multiempresa

> "Seu sistema, do seu jeito." — uma base de código, muitos ambientes
> isolados, cada um configurado sem precisar programar de novo.

Este documento descreve a arquitetura ATUAL do PedidoFlow depois da
transformação em plataforma: Control Plane (Super Admin), isolamento
estrutural por empresa, autenticação em duas etapas, System Builder, IA
administrativa, WhatsApp/IA por empresa, NFC-e por empresa e planos
configuráveis.

---

## 1. Visão geral

```
                         ┌─────────────────────────┐
                         │   CONTROL PLANE          │
                         │   (Super Admin)          │
                         │                          │
                         │  Empresa · Plano         │
                         │  SuperAdmin · UsoIa      │
                         │  (schema "public")       │
                         └───────────┬──────────────┘
                                     │ cria/edita/provisiona
                                     ▼
        ┌────────────────────────────────────────────────────┐
        │              PLATAFORMA (aplicação Next.js única)   │
        │                                                      │
        │  Identidade/login: Usuario, Sessao, PermissaoUsuario │
        │  (schema "public" — ver seção 3 para o porquê)       │
        └───────────────┬──────────────────┬───────────────────┘
                         │                  │
             ativarTenant()      ativarTenant()
                         ▼                  ▼
        ┌───────────────────────┐  ┌───────────────────────┐
        │ schema tenant_rozeno   │  │ schema tenant_pastel_x │
        │ Pedido, Cliente,       │  │ Pedido, Cliente,       │
        │ Produto, Caixa,        │  │ Produto, Caixa,        │
        │ Estoque, WhatsApp,     │  │ Estoque, WhatsApp,     │
        │ Fiscal, Impressão…     │  │ Fiscal, Impressão…     │
        └───────────────────────┘  └───────────────────────┘
```

Uma única aplicação Next.js, um único banco PostgreSQL (por padrão) —
mas cada empresa opera em seu **schema PostgreSQL próprio**, não numa
tabela compartilhada filtrada só por coluna. Empresas que justifiquem
isolamento físico total podem, opcionalmente, ter um **banco
completamente separado** (outro servidor) — a aplicação não muda nada,
só a resolução de conexão (seção 3).

---

## 2. Control Plane

O "Control Plane" é o conjunto de dados que pertence à PLATAFORMA, não a
nenhuma empresa: quem existe, o que contratou, quem é o dono do negócio
(você). Vive no schema `public` do Postgres:

| Model | O que guarda |
|---|---|
| `Empresa` | tenant: nome, slug, status, plano, módulos, tema/textos/menu (System Builder), schema/banco dedicado, limites de IA |
| `Plano` | planos comerciais editáveis (nome, preço, módulos padrão, limites) — nada fixo no código |
| `SuperAdmin` / `SessaoSuperAdmin` | sua conta, totalmente separada de qualquer `Usuario` de empresa |
| `UsoIa` | consumo de IA por empresa (atendimento, copiloto, admin) — visão agregada de todas as empresas num só lugar |

O painel fica em `/superadmin` (login próprio em `/superadmin/login`,
cookie `sessao_superadmin` — nunca o mesmo cookie/sessão de um usuário
de empresa). A guarda de acesso é `autorizarSuperAdmin()`
(`src/lib/super-admin/auth.ts`), que **nunca** reaproveita
`autorizar()`/`temPermissao()` de empresa — não existe combinação de
papel de `Usuario` que dê acesso ao Super Admin.

---

## 3. Isolamento estrutural entre empresas

### 3.1 Por que não só `empresaId`

O pedido foi explícito: isolamento **estrutural**, não só uma coluna.
A resposta implementada:

- Cada empresa tem um **schema PostgreSQL dedicado**
  (`tenant_<slug>`), com as MESMAS tabelas (Pedido, Cliente, Produto,
  Caixa, Estoque, WhatsApp, Fiscal, Impressão…), fisicamente separadas
  por *namespace* no banco — não uma tabela só filtrada por
  `empresaId`.
- `empresaId` **continua existindo** nessas tabelas como camada extra de
  defesa (protege contra um bug de lógica que esqueça de trocar de
  schema, e mantém compatibilidade com o código já escrito) — mas quem
  garante o isolamento de fato é o schema, não mais só o filtro.
- Empresas que precisem de isolamento físico total (outro servidor,
  outra região) podem ter uma `DATABASE_URL` própria, criptografada
  (`Empresa.databaseUrlSecreta`) — banco 100% dedicado, sem nada
  compartilhado.

### 3.2 Por que `Usuario`/`Sessao` ficam na plataforma (decisão deliberada)

Isso é o ponto mais importante para entender a arquitetura: **login e
sessão continuam no schema `public`**, não no schema do tenant.

Motivo: para saber QUAL schema consultar, o sistema primeiro precisa
saber a qual empresa o usuário pertence — e essa informação está
justamente no registro de `Usuario`. Se `Usuario` estivesse dentro do
schema do tenant, seria preciso já saber o tenant para encontrar o
usuário que diz qual é o tenant — um problema circular sem solução sem
duplicar dados de login numa tabela-índice à parte (o que traria
complexidade de sincronização sem ganho real de segurança).

O isolamento entre empresas nesses models continua garantido por:
- `empresaId` em `Usuario` (nunca aceito do cliente — sempre resolvido
  no servidor a partir da sessão);
- `email` único **na plataforma inteira** (não por empresa) — assim,
  encontrar "a qual empresa este e-mail pertence" na 1ª etapa do login
  é uma consulta direta, sem ambiguidade;
- toda rota de negócio some da plataforma para o tenant assim que a
  sessão é validada (`autorizar()`), então nenhum dado OPERACIONAL
  (pedidos, clientes, financeiro, WhatsApp, fiscal) nunca passa perto do
  schema `public`.

Ou seja: dados de identidade (quem é o usuário, seu e-mail, seu papel)
ficam centralizados; dados de NEGÓCIO (tudo que o pedido de arquitetura
listou: pedidos, clientes, produtos, estoque, caixa, pagamentos,
relatórios, configurações, WhatsApp, conversas, contexto de IA,
impressão, NFC-e, fiscal, credenciais, integrações, logs operacionais)
ficam isolados por schema.

### 3.3 Como a troca de schema acontece sem reescrever as rotas

```
Requisição chega → autorizar()/exigirRota() (src/lib/acesso.ts)
                       │
                       ├─ valida sessão (Usuario/Sessao — schema public)
                       ├─ confere status da empresa (ativa/bloqueada/…)
                       └─ ativarTenant(usuario.empresa)  ← AQUI
                              │
                              ├─ resolve/cacheia um PrismaClient
                              │  apontado para o schema (ou banco) desta
                              │  empresa (src/lib/tenant-db.ts)
                              └─ entra no contexto (AsyncLocalStorage —
                                 src/lib/tenant-context.ts) para o
                                 RESTANTE desta requisição
                       │
Rota de negócio (inalterada) → import { prisma } from "@/lib/prisma"
                       │
                       └─ prisma é um PROXY (src/lib/prisma.ts):
                          • model de plataforma → cliente da plataforma
                          • model de tenant → cliente do tenant ATIVO
                            (do AsyncLocalStorage) — ou ERRO, se por
                            algum motivo nenhum tenant foi ativado
                            (nunca cai silenciosamente em outro banco)
```

Vantagem prática: as **56+ rotas de API já existentes não precisaram
ser reescritas** — todas continuam com `import { prisma } from
"@/lib/prisma"` exatamente como antes. A troca de schema é transparente.

### 3.4 Provisionamento de um schema novo

Quando uma empresa é criada (`POST /api/superadmin/empresas`):
1. Valida nome/slug/e-mail do administrador.
2. **Provisiona o schema** (`src/lib/tenant-provisionamento.ts`): lê
   `schema.prisma`, gera o DDL das tabelas de TENANT (não das de
   plataforma) e aplica em `tenant_<slug>` — `CREATE SCHEMA` +
   `CREATE TABLE` + índices + chaves únicas + chaves estrangeiras.
3. Só depois disso cria o registro `Empresa` (schema `public`) e o
   primeiro `Usuario` (ADMINISTRADOR) numa única transação.

Se o provisionamento falhar, nada é criado — não fica empresa "pela
metade".

> **Aviso de validação**: o gerador de DDL foi escrito e revisado com
> cuidado, mas não pôde ser executado contra um PostgreSQL real no
> ambiente onde foi criado (sandbox sem acesso à internet/banco). Rode
> contra um banco de homologação antes de usar em produção, e compare
> com `npx prisma migrate diff` se quiser uma segunda validação.

---

## 4. Autenticação em duas etapas

```
Etapa 1                          Etapa 2
┌─────────────────┐              ┌─────────────────────────┐
│ PedidoFlow       │              │ Bem-vindo, {Empresa}     │
│                  │   e-mail     │                          │
│ [ e-mail ]       │ ───────────► │ [ senha ]                │
│ [ Continuar ]    │  resolve     │ [ Entrar ]               │
└─────────────────┘  empresa     └─────────────────────────┘
                     (nome/logo)
```

- `POST /api/auth/empresa-por-email`: recebe o e-mail, encontra o
  `Usuario`/`Empresa` correspondente (schema `public`) e devolve só
  nome/logo/cor (nunca confirma explicitamente se o e-mail existe com
  uma mensagem diferente — mesma resposta genérica nos dois casos;
  limitado por taxa/IP contra varredura de e-mails).
- A autenticação REAL (senha) continua exatamente como antes —
  `POST /api/auth/login` valida no banco (bcrypt), abre sessão em
  cookie httpOnly. A etapa 1 é só identificação/UX.
- Dentro da empresa, os acessos individuais (Administrador, Caixa,
  Garçom, Cozinha, Entregador) continuam sendo o mesmo `Usuario` de
  sempre, com papel e permissões próprias — nenhuma mudança na lógica
  de permissões existente.
- Um login nunca funciona no ambiente de outra empresa: a sessão
  carrega o `empresaId` do usuário, e todo acesso a dado de negócio
  passa pelo schema daquela empresa (seção 3).

---

## 5. System Builder

Cada empresa é configurável sem alterar código:

| O que é configurável | Onde vive | Quem edita |
|---|---|---|
| Módulos habilitados | `Empresa.modulos` (JSON) | Super Admin (ou IA administrativa) |
| Plano/limites | `Empresa.planoId` → `Plano` | Super Admin |
| Identidade visual (cor, logo, nome de exibição) | `Empresa.tema` (JSON) | Super Admin (ou IA administrativa) |
| Textos de tela | `Empresa.textos` (JSON) | Super Admin (ou IA administrativa) |
| Itens/ordem de menu | `Empresa.menuConfig` (JSON) | Super Admin |

Um módulo desabilitado bloqueia **tanto o menu quanto a API** — `
autorizar()`/`exigirRota()` recusam (HTTP 402) qualquer recurso que
dependa de um módulo não contratado (`src/lib/modulos.ts`,
`MODULO_DO_RECURSO`).

O que o System Builder **não** faz (por design): criar uma tela nova,
uma integração nova, uma regra de negócio nova. Isso é programação de
verdade — a IA administrativa (seção 6) é instruída a reconhecer esse
limite e avisar, nunca inventar.

---

## 6. IA administrativa (Super Admin)

`src/lib/ia-admin.ts` + `POST /api/superadmin/ia`.

Fluxo **sempre em duas chamadas**:
1. `{ empresaId, instrucao }` → a IA interpreta e devolve uma lista de
   **ações propostas** (nunca aplica nada ainda).
2. Painel mostra a lista ao Super Admin. Só quando ele confirma
   (`{ confirmar: true, acoesPropostas: [...] }`, ecoando exatamente o
   que foi mostrado) as ações são aplicadas.

Catálogo fechado de ações: habilitar/desabilitar módulo, alterar texto,
alterar tema (cor), definir plano. Qualquer coisa fora disso vira
`fora_do_escopo` com uma explicação — nunca uma ação inventada.

Duas formas de interpretar a instrução:
- **Determinística (sempre disponível)**: casamento de palavras-chave
  em português (nomes de módulo, "sem X", "mude o texto Y para Z"...).
  Previsível, sem custo de API.
- **Opcional via LLM** (`IA_ADMIN_API_KEY`): mais flexível, mas **toda
  resposta da IA é validada contra o catálogo real** antes de virar uma
  ação proposta — um nome de módulo que não exista na lista oficial é
  descartado, nunca aplicado.

Consumo de IA (qualquer uma das duas formas, quando usa LLM) é
contabilizado por empresa em `UsoIa` (seção 8).

---

## 7. WhatsApp por empresa

- Cada empresa conecta o **próprio número** Meta WhatsApp Business
  Cloud API pelo painel dela (Admin → Configurações → WhatsApp) — um
  fluxo de "Conectar meu WhatsApp" que testa a credencial na hora
  (`POST /api/whatsapp/conectar`).
- O **access token é criptografado** (AES-256-GCM,
  `SECRETS_MASTER_KEY`) antes de ir para o banco —
  `src/lib/atendente/whatsapp-api.ts`.
- O webhook é ÚNICO na plataforma (`/api/whatsapp/webhook`), mas
  identifica a empresa dona de cada mensagem pelo `phone_number_id`
  recebido (`encontrarEmpresaPorPhoneNumberId`) — uma mensagem da
  Empresa A nunca é processada pelo motor da Empresa B.
- Conversas, mensagens e todo o contexto da conversa (`ConversaWhatsApp`,
  `MensagemWhatsApp`) vivem no **schema do tenant** — isolamento
  estrutural, não só um filtro.

---

## 8. IA de atendimento por empresa

- Cada empresa tem seu próprio cardápio, preços, taxas e horários — o
  motor (`src/lib/atendente/motor.ts`) sempre consulta o schema da
  própria empresa (nunca há como "vazar" cardápio entre empresas,
  porque fisicamente são tabelas diferentes).
- A API paga do LLM pode ser central (uma chave só), mas o **consumo é
  contado por empresa** (`UsoIa`, `src/lib/uso-ia.ts`) e cada empresa
  tem seu próprio **limite mensal** (`Empresa.limiteMensagensIA` ou o
  limite do `Plano`) — ao esgotar, a IA para de ser chamada para
  aquela empresa (o atendimento continua funcionando com o
  interpretador determinístico, só sem o "polimento" da IA).

---

## 9. NFC-e / Fiscal por empresa

Em Admin → Configurações → Fiscal, cada empresa cadastra:
CNPJ, IE, razão social, nome fantasia, endereço fiscal, regime
tributário, série/numeração, CSC, ID do CSC, certificado digital
(base64) e senha do certificado, token do provedor, ambiente
(homologação/produção).

- Dados cadastrais ficam em texto normal (não são segredo).
- CSC, ID do CSC, certificado, senha do certificado e token do provedor
  são **criptografados** (`src/lib/crypto-segredos.ts`) antes de ir
  para o banco — nunca em texto puro, nunca compartilhados entre
  empresas.
- `statusConfiguracaoFiscal()` e as chamadas reais ao provedor
  (`src/lib/fiscal/provedor.ts`) preferem sempre a credencial cadastrada
  pela EMPRESA; variáveis de ambiente (`NFCe_*`) continuam existindo só
  como fallback legado (uma empresa/instalação única).
- Nenhuma nota é simulada: sem credencial válida, o documento fica
  `nao_configurado` — nunca "autorizado" sem retorno real do provedor.

---

## 10. Planos

`Plano` é 100% editável pelo Super Admin (`/api/superadmin/planos`):
nome, preço, módulos padrão, limite de usuários, limite de mensagens de
IA, se inclui IA, ordem de exibição, ativo/inativo. Os valores
R$119,90/249,90/399,90 do briefing existem só como carga inicial do
seed — não há nada hardcoded no código depois disso.

A landing page (`/`, para visitantes sem sessão) busca os planos ativos
em tempo real (`GET /api/planos-publicos`, pública, sem dado sensível).

Cobrança automática **não foi integrada** nesta etapa (como pedido) —
o schema já tem os campos (`Plano.preco`, `Empresa.vencimentoEm`,
`Empresa.trialFimEm`) prontos para uma integração futura (Stripe,
Pagar.me, etc.).

---

## 11. Como criar um novo cliente

1. `/superadmin/login` → aba Empresas → **Nova empresa**.
2. Preenche nome, slug, plano (ou monta módulos manualmente), dados do
   administrador inicial.
3. O sistema provisiona o schema do tenant, cria a `Empresa` e o
   primeiro `Usuario` (ADMINISTRADOR) — tudo numa chamada.
4. O administrador da nova empresa loga normalmente em `/login`
   (etapa 1 → "Bem-vindo, {empresa}" → senha) e configura o resto
   (cardápio, equipe, WhatsApp, fiscal) pelo próprio painel dele.

## 12. Como personalizar um cliente

- Pelo painel Super Admin (edição de empresa): módulos, plano, tema,
  textos.
- Pela IA administrativa: instruções em linguagem natural, sempre com
  confirmação antes de aplicar (seção 6).
- Pelo próprio Administrador da empresa (dentro do ambiente dela):
  cardápio, taxas, WhatsApp, fiscal, financeiro (Pix/banco) — tudo isso
  já era configurável pelo Admin antes desta etapa e continua sendo,
  agora com o cofre de segredos para o que é sensível.

## 13. Como hospedar (produção)

Ver `DEPLOY.md` para o passo a passo completo. Resumo do que muda nesta
etapa: `SECRETS_MASTER_KEY` passa a ser obrigatória (sem ela, salvar
credencial de WhatsApp/fiscal falha), e o primeiro deploy precisa gerar
a migration do Postgres normalmente (`npx prisma migrate dev`) — os
schemas de TENANT são provisionados por empresa, não por uma migration
única (ver seção 3.4).

## 14. Pendências externas (não dependem de código)

- Hospedagem PostgreSQL real, domínio, HTTPS.
- Credenciais Meta WhatsApp Business Cloud API (cada empresa cadastra a
  própria).
- Credenciais do provedor fiscal NFC-e (token, CSC, certificado A1) por
  empresa.
- Chave de API de LLM, se quiser IA além do interpretador determinístico
  (atendimento, copiloto, IA administrativa) — cada uma tem seu próprio
  `*_API_KEY` opcional.
- Integração de cobrança automática (schema já preparado, integração em
  si fora do escopo desta etapa).

## 15. Limitações conhecidas desta etapa (honestidade técnica)

- O provisionamento de schema (`tenant-provisionamento.ts`) foi escrito
  com cuidado mas **não executado contra um Postgres real** no ambiente
  em que foi criado (sem acesso à internet/banco) — valide em
  homologação antes de produção.
- `Float` continua sendo usado para valores monetários (não migrado
  para `Decimal`) — decisão deliberada para não arriscar uma
  refatoração ampla sem conseguir compilar/testar; ver nota no
  relatório de validação.
- Cobrança automática de planos não integrada (schema pronto).
- A IA administrativa cobre um catálogo de ações deliberadamente
  pequeno nesta primeira versão (módulos, textos, tema, plano) — pode
  crescer, mas cada ação nova precisa entrar no catálogo validado, nunca
  "aprender" a fazer algo novo sozinha.
