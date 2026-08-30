# PedidoFlow — plataforma SaaS multiempresa

> **Plataforma SaaS (etapa mais recente)**: o PedidoFlow virou uma
> plataforma multiempresa de verdade — cada empresa tem um **schema
> PostgreSQL dedicado** (isolamento estrutural, não só `empresaId`),
> **login em duas etapas** (e-mail → "Bem-vindo, {empresa}" → senha),
> **System Builder** (módulos/tema/textos por empresa, configurável pelo
> Super Admin ou por uma **IA administrativa** com confirmação antes de
> aplicar), **planos 100% editáveis** (`Plano`), **WhatsApp e credenciais
> fiscais criptografadas por empresa**, e uma **landing page comercial**
> em `/` para visitantes sem sessão. Veja `ARQUITETURA-PEDIDOFLOW-PLATAFORMA.md`
> para o desenho completo, e `DEPLOY.md`, `NOVA_EMPRESA.md` e
> `SUPERADMIN.md` para os guias operacionais.
>
> **SaaS multiempresa (etapa anterior)**: o PedidoFlow deixou de ser um
> sistema de uma única pizzaria e virou uma plataforma multiempresa —
> banco **PostgreSQL**, isolamento total de dados por empresa
> (`empresaId`), painel **Super Admin** (`/superadmin`) para cadastrar e
> administrar empresas, módulos habilitáveis por contrato e sincronização
> em tempo real (SSE). A Disk Pizza Rozeno virou a primeira empresa
> cadastrada. O texto abaixo (histórico do produto de uma unidade só)
> permanece como referência dos módulos internos, que continuam os
> mesmos por empresa.

Sistema de gestão de mesas e pedidos da **Disk Pizza Rozeno** (primeira
empresa da plataforma), construído
sobre o Design System oficial do PedidoFlow. **Back-end real**: dados
persistidos em **PostgreSQL via Prisma**, com APIs próprias consumidas pelas
telas (Login, PDV, Garçom, Cozinha, Admin, Entregador). **Autenticação e
autorização reais**: sessão em cookie httpOnly, senha com bcrypt,
recuperação de senha por token, papéis com permissões por recurso
(overrides por usuário) e trilha de auditoria. Onde a integração externa
ainda é simulada (NFC-e, QR Code, impressão, upload de fotos), a tela segue
marcada nos pontos de integração real.

> **Versão final (unidade única)**: todos os módulos foram revisados e padronizados contra
> o Design System (mesmos componentes, tokens e padrões de tela — ver
> `DESIGN_SYSTEM.md`). Validação: `next lint` 0 erros, `npm run build` OK,
> smoke test em todas as rotas → 200, fluxos de API testados de ponta a
> ponta (login/logout, recuperação de senha, sessão expirada, 401/403 por
> papel, pedido+pagamento, caixa, mesas, estoque, entregas). A transformação
> para SaaS multiempresa foi validada por revisão manual (ver relatório de
> auditoria da migração) — recomendamos rodar `npx tsc --noEmit` e a suíte
> de isolamento (`npm run test`) no seu ambiente antes de produção.

## Módulos atuais


| Módulo | Rota | Papel (recurso) | O que faz |
|---|---|---|---|
| Home / login | `/`, `/login` | qualquer sessão | Seleção de módulo filtrada pelo papel; login/logout reais, recuperação de senha (`/login/recuperar`, `/login/redefinir`) |
| **PDV** | `/pdv` | Caixa/Admin (`pdv`) | Caixa completo em 4 abas: **Venda**, **Salão** (mesas), **Retirada** e **Caixa**. Toda cobrança persiste e passa por Pagamento → Caixa → **NFC-e real** (PEDIDO 19; status do documento fiscal real) |
| Garçom | `/garcom` | Garçom/Caixa/Admin (`salao`) | Mesas do salão (reais), abrir mesa, lançar pedido — compartilha comandas com o PDV/Salão |
| **Cozinha (KDS)** | `/cozinha` | Cozinha/Admin (`kds`) | Painel em tempo real (SSE): fila única de produção (PDV, Garçom/Salão, Retirada e Delivery), estágios **recebido → em preparo → pronto → finalizado**, tempo decorrido, alerta de espera e som configurável |
| **Administrador** | `/admin` | Admin (`admin`) | Dashboard, relatórios (6 visões), estoque, configurações, usuários, auditoria e **Fiscal** (`/admin/fiscal`) — dados reais |
| **Entregador** | `/entregador` | Entregador/Admin (`entregas`) | Minha rota, carrinho, QR Code, pagamentos, relatório individual e modo offline |
| **Atendimento** | `/atendimento` | Admin/Caixa (`atendimento`) | Conversas do WhatsApp (PEDIDO 18): robô conduz com dados reais, atendente assume/responde, simulador de cliente |
| Em breve | `/em-breve` | — | (planejado) |

## Stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript**
  (Next 14.2.35 travado por estabilidade em máquinas com pouca RAM — o
  `build` usa `cross-env NODE_OPTIONS=--max-old-space-size=2048`; `npm audit`
  aponta avisos de `postcss`/`next`, sem fix seguro sem upgrade major)
- **Prisma + SQLite** (`prisma/dev.db`) — banco local, sem servidor externo
- **Tailwind CSS** com tokens de design personalizados
- **shadcn/ui** (Radix UI primitives) — estilo `new-york`
- **lucide-react** para ícones
- **sonner** para toasts
- Preparado para **PWA** (manifest + meta tags; adicione um service worker
  quando o app tiver conteúdo para funcionar offline)

## Como rodar

```bash
npm install
npm run db:migrate      # aplica migrações no banco (prisma/dev.db)
npm run db:seed         # (opcional) dados de demonstração
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Contas do seed
(senha gerada aleatoriamente — impressa no console ao rodar `npm run db:seed`, mesma para todas):

| Papel | Login |
|---|---|
| Administrador | `admin@rozeno.com.br` (ou `rozeno@rozeno.com.br`) |
| Garçom | `garcom@rozeno.com.br` |
| Cozinha | `cozinha@rozeno.com.br` |
| Entregador | `samuel@rozeno.com.br` (ou `ari@...`, `marlon@...`) |

Scripts de banco: `db:generate`, `db:migrate`, `db:deploy`, `db:seed`,
`db:reset` (apaga e recria o banco com o seed). O seed é determinístico
(166 pedidos em 14 dias) e idempotente.

## Autenticação e permissões (PEDIDO 14)

- **Sessão**: `POST /api/auth/login` cria um cookie `sessao` httpOnly
  (7 dias, `secure` em produção). O token é armazenado com hash sha256
  (`Sessao.token`). `GET /api/auth/me` devolve usuário + permissões.
- **Recuperação de senha**: `POST /api/auth/recuperar` gera um token de
  uso único (30 min; retornado na resposta, sem e-mail ainda) e
  `POST /api/auth/redefinir` valida 8+ caracteres, revoga todas as sessões
  do usuário e registra em auditoria.
- **Papéis e recursos** (`src/lib/permissao.ts`): ADMINISTRADOR (tudo),
  CAIXA (pdv, salao, retirada, pagamentos, caixa, catalogo, clientes),
  GARCOM (salao, catalogo), COZINHA (kds), ENTREGADOR (entregas,
  pagamentos_entrega). Overrides por usuário (`PermissaoUsuario`)
  sobrescrevem o padrão do papel.
- **Enforcement**: toda rota de API valida sessão + recurso
  (`autorizar(...)` em `src/lib/acesso.ts` → 401/403) e todo layout de
  módulo redireciona via `exigirRota` (→ `/login` ou `/`). O frontend
  também redireciona ao receber 401 (`api-cliente.ts`).
- **Regras por papel no servidor**: Garçom só vê/cria pedidos do canal
  `salao`; Cozinha só vê pedidos `andamento/preparando/pronto` e só avança
  para `preparando|pronto`; Entregador só vê/altera as próprias entregas e
  só consulta o relatório individual (`eu` no ranking).
- **Usuários** (`/admin/configuracoes` → Usuários): criar/editar, ativar/
  desativar (revoga sessões), redefinir senha, trocar papel e ajustar
  permissões recurso a recurso. Não é possível desativar/excluir o próprio
  usuário (409).
- **Auditoria** (`/admin/configuracoes` → Auditoria): login, login_falha,
  logout, recuperação/redefinição, alterações de usuário e de permissões —
  com usuário, IP e horário.

## API (rotas em `src/app/api/`)

| Grupo | Rotas |
|---|---|
| Autenticação | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/recuperar`, `POST /api/auth/redefinir` |
| Cardápio | `GET/POST /api/catalogo`, `PATCH/DELETE /api/produtos/[id]` |
| Clientes | `GET/POST /api/clientes` (cadastro com endereços completos), `GET /api/clientes/[id]` (dados + histórico de pedidos) |
| Mesas | `GET /api/mesas` (mesas + comandas do dia), `PATCH /api/mesas/[id]` (abrir/fechar/status; grava o nome real do usuário) |
| Pedidos | `GET/POST /api/pedidos` (filtros: canal, status, período, limite e **producao** para o KDS), `PATCH/DELETE /api/pedidos/[id]` (cozinha avança a produção só em ordem: 409 em salto), `POST /api/pedidos/[id]/pagamento` |
| KDS | `GET /api/kds/eventos` — **SSE** em tempo real (heartbeat a cada 15s; eventos `mudanca` quando a fila muda); pub/sub em `src/lib/kds-eventos.ts` |
| Caixa | `GET /api/caixa`, `POST /api/caixa/abrir`, `POST /api/caixa/fechar`, `POST /api/caixa/movimentacoes` |
| Estoque | `GET /api/estoque`, `GET/POST /api/estoque/movimentacoes` |
| Fiscal | `GET /api/fiscal/config` (estado público, sem segredos), `POST /api/fiscal/teste` (conectividade), `POST /api/fiscal/emissao` (`{pedidoId, manual?}`), `GET /api/fiscal/documentos` (filtros: status, período, pedidoId), `GET /api/fiscal/documentos/[id]`, `POST /api/fiscal/documentos/[id]/consulta`, `POST /api/fiscal/documentos/[id]/cancelamento` (admin). Legado: `GET/POST /api/notas-fiscais` |
| Entregas | `GET/POST /api/entregas` (entregador vê só as próprias; POST cria manual com entregador opcional), `PATCH /api/entregas/[id]` (atribuir/rota/entregue/cancelar/ocorrência), `GET /api/entrega/taxa` (regras configuradas), `GET /api/entregadores`, `PATCH /api/pagamentos/[id]` (confirma pagamento recebido na entrega) |
| Atendimento | `POST /api/atendimento/mensagem` (simulador), `GET /api/atendimento/conversas`, `GET/PATCH /api/atendimento/conversas/[id]` (humano: assumir/devolver/encerrar/responder), `GET/POST /api/whatsapp/webhook` (verificação + recepção da Meta) |
| Impressão | `GET /api/impressao` (painel; cozinha/caixa veem só o próprio destino), `POST /api/impressao` (reimpressão manual ou teste), `POST /api/impressao/[id]/cancelar` (admin) |
| Impressão (agente) | `GET /api/impressao/fila` (header `x-agente-token`), `POST /api/impressao/fila/[id]/concluir`, `POST /api/impressao/fila/[id]/erro` |
| Admin | `GET /api/dashboard`, `GET /api/relatorios?visao=…`, `GET/PUT /api/configuracoes`, `GET/POST /api/usuarios`, `PATCH/DELETE /api/usuarios/[id]`, `PATCH /api/usuarios/[id]/permissao` (override; DELETE restaura o padrão), `GET /api/auditoria`, `GET/POST /api/backups` |
| Copiloto | `GET /api/copiloto` (consulta pré-aprovadas disponíveis), `POST /api/copiloto` (pergunta em linguagem natural → resposta de uma consulta fixa, somente leitura, com auditoria) |
| Saúde | `GET /api/saude` — health check (banco + tempo de resposta) para monitor externo |

Regras relevantes no servidor: venda em dinheiro exige caixa aberto (409);
número do pedido é sequencial por dia; pagamento conclui os pedidos da mesa;
**toda rota acima valida sessão e permissão do papel (401/403)**.
Fluxo de produção (PEDIDO 15): todo pedido confirmado entra na fila com `producao: recebido`
(persistido no banco com timestamps `recebidoEm`/`preparoIniciadoEm`/`prontoEm`/`finalizadoEm`);
a cozinha avança `recebido → em_preparo → pronto` (sempre em ordem);
pagamento, retirada, cancelamento ou entrega **entregue** finalizam a produção e o pedido
sai do painel; cada mudança emite um evento SSE (`/api/kds/eventos`) — sem refresh manual,
com fallback para polling de 10s se a conexão cair.

## Impressão térmica (PEDIDO 16)

**Arquitetura**: o servidor não fala com impressoras — ele gera o conteúdo
formatado para **80 mm (42 colunas)** e grava na tabela `FilaImpressao` com
`status: pendente`. Um **agente local** (rodando na máquina da impressora)
consome a fila e confirma a impressão de verdade. O navegador continua com a
visualização/impressão manual como alternativa (`.print-area` em
`globals.css`, `@page { size: 80mm auto }`).

- **O que o servidor faz (funciona de ponta a ponta, sem hardware)**:
  - Gera e enfileira comandas — cozinha sempre; balcão/retirada/delivery
    também no caixa (`POST /api/pedidos`), cupom do cliente no pagamento
    (`POST /api/pedidos/[id]/pagamento`) e fechamento de caixa
    (`POST /api/caixa/fechar`) — só quando a impressora do destino tem
    `automatica: true` (config `impressoras`).
  - `POST /api/impressao` para **reimpressão manual** (sempre cria) e
    **teste** (dedupe anti-duplicata); `POST /api/impressao/[id]/cancelar`
    (só admin). Painéis em PDV (caixa), KDS (cozinha) e Admin (aba
    Impressão) listam a fila com status, vias, tentativas e erro, com
    botões Visualizar (diálogo + impressão do navegador) e Reimprimir.
  - Nunca marca impressão como concluída sozinho; `POST /impressao/fila/[id]/erro`
    mantém `pendente` (reprocessável) e só vira `erro` após **3 tentativas**.
  - Layout 80 mm testado com pedidos grandes (clientes/nomes/observações
    longos, muitos itens): nenhuma linha excede 42 colunas.
- **O que depende do ambiente físico (fora do servidor)**:
  - A comunicação com a impressora em si (USB/rede, drivers, ESC/POS) é
    responsabilidade do **agente local** — veja `scripts/agente-impressao/`
    (`agente.mjs` de exemplo + README com o contrato da API, token
    `x-agente-token`, opções de impressão real e agendamento). Sem o agente,
    nada é impresso fisicamente; a fila fica `pendente` e o painel mostra.
  - Configuração de rede/localhost do agente e do servidor.
- **Limitação conhecida**: `PUT /api/configuracoes` só aceita as chaves
  documentadas; o token do agente (`impressao.agenteToken`) é definido no
  seed/banco (a aba Impressão exibe somente-leitura).

## Delivery (PEDIDO 17)

**Fluxo operacional completo, persistido no banco**:

- **Cliente**: cadastro automático por telefone ao criar o pedido (com
  endereços completos: rua, bairro, complemento e referência); `GET
  /api/clientes/[id]` traz o histórico de pedidos.
- **Pedido delivery**: taxa de entrega calculada **no servidor** pelas regras
  configuradas (regra `bairro` ou `fixa`, valor padrão e grátis acima de X —
  aba Configurações → Taxas), previsão, observação, forma de pagamento e
  troco para a entrega; `pagarNaEntrega` cria o pagamento **pendente** e o
  total já inclui a taxa.
- **Entrega**: nasce `aguardando` (sem entregador); a equipe **atribui** um
  entregador (`preparo`), o entregador **sai para entrega** (`rota`, grava
  `iniciadaEm`) e **conclui** (`entregue`) ou **cancela** (com ocorrência).
  Só pode avançar na ordem (rota exige atribuída; entregue exige rota ou
  preparo; cancelada não após entregue) — senão 409. Ocorrência pode ser
  registrada avulsa (sem mudar status).
- **Entregador** (`/entregador`): rota real do dia (só as próprias entregas),
  botões iniciar/concluir, diálogo de ocorrência com sugestões e
  confirmação de pagamento recebido na entrega (só das próprias).
- **Integração financeira**: ao concluir a entrega, o pedido **sai da
  produção** (concluído/finalizado) e o pagamento pendente é confirmado,
  registrando a venda (e o troco, quando houver) no caixa — dinheiro exige
  caixa aberto (fica pendente caso contrário). Pagar **na hora** num
  delivery com entrega em aberto **não** tira o pedido da cozinha.
- **Taxas** (`src/lib/delivery.ts`): `calcularTaxaEntrega(config, bairro,
  subtotal)` com regras por bairro + fallback, `TAXA_ENTREGA_PADRAO` e
  previsão padrão; leitura da config `taxas.taxaEntrega` com normalização
  do formato legado.
- **PDV → Delivery**: aba no PDV com filas por status (aguardando/preparo/
  rota/entregue/cancelada), atribuição de entregador, novo pedido com busca
  de cliente que autopreenche o endereço e calcula a taxa do bairro em
  tempo real.

## WhatsApp + Atendente IA (PEDIDO 18)

**Atendimento por WhatsApp com robô que usa dados REAIS do banco** —
nunca inventa produto, sabor, tamanho, preço, adicional, taxa, promoção ou
disponibilidade: tudo é consultado/cadastrado (`src/lib/atendente/catalogo.ts`)
e validado pelo motor (`src/lib/atendente/motor.ts`).

- **Fluxo guiado (FSM)**: saudação → intenção → produto → tamanho →
  sabores (tradicional/especial do cadastro) → adicionais → quantidade →
  mais itens → entrega/retirada → endereço (endereços salvos ou novo) →
  bairro/taxa real → pagamento → troco → resumo → confirmação explícita →
  **cria o pedido real** (cliente upsert por telefone, `origem: whatsapp`,
  entra no KDS e na fila de impressão automática) e **vincula a conversa ao
  pedido** (`ConversaWhatsApp.pedidoId`).
- **Contexto persistido**: `ConversaWhatsApp.estado` (JSON) guarda o
  progresso; a conversa retoma de onde parou (e conversas encerradas
  reabrem com saudação curta).
- **Anti-repetição e humano**: respostas repetidas contam como tentativa
  (2 → transfere para humano); palavras como *"atendente"/"pessoa"*
  transferem na hora; o atendente humano vê a thread completa em
  `/atendimento`, **assume/devolve ao robô**, **responde** e **encerra**.
- **Simulador**: `POST /api/atendimento/mensagem` (e o painel
  `/atendimento`) permitem testar o fluxo inteiro sem WhatsApp real.
- **IA opcional** (`src/lib/atendente/ia.ts`): com `IA_ATENDENTE_API_KEY`,
  um LLM (compatível OpenAI) apenas **normaliza** a mensagem do cliente
  usando os nomes exatos do cardápio real (corrige digitação/sinônimos);
  todo valor continua validado no banco pelo motor. Sem a chave, o
  interpretador determinístico (regras) conduz 100% do fluxo.
- **WhatsApp oficial** (`src/lib/atendente/whatsapp-api.ts`): integração
  com a **WhatsApp Business Cloud API (Meta)** — webhook
  `GET/POST /api/whatsapp/webhook` (verificação `hub.verify_token` +
  recepção de mensagens) e envio via Graph API. **Apenas a API oficial**:
  não usamos bibliotecas não oficiais (Baileys, whatsapp-web.js etc.),
  que violam os Termos do WhatsApp e podem banir o número.
  ⚠️ **Risco documentado**: expor o webhook sem `WHATSAPP_ACCESS_TOKEN`
  configurado deixa o robô fora do ar (501 com instruções); mantenha os
  tokens **somente no `.env`** (nunca no código), use HTTPS e `secure`
  cookies; em produção, monitore a cota de mensagens da Meta.
- **Configuração** (veja `.env.example`): `WHATSAPP_WEBHOOK_VERIFY_TOKEN`,
  `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` e (opcional)
  `IA_ATENDENTE_API_KEY`, `IA_ATENDENTE_BASE_URL`, `IA_ATENDENTE_MODEL`.
  Sem essas variáveis, o sistema segue em **modo simulação**.
- **Permissões**: recurso `atendimento` (Administrador e Caixa) controla o
  painel `/atendimento` e todas as rotas `/api/atendimento/**`.


## NFC-e fiscal (PEDIDO 19)

**Integração real com provedor de NFC-e via API REST** — o sistema NUNCA
fabrica chave/protocolo/autorização: o status do documento reflete sempre a
resposta do provedor (SEFAZ) ou a ausência de configuração.

- **Fluxo**: ao pagar o pedido (`emitirAutomatico`), o backend monta o
  payload com dados REAIS do banco (empresa, produtos, itens, pagamentos),
  valida tudo (CNPJ 14 dígitos, IE, UF, NCM 8, CFOP 4, CSOSN 3, unidade) e
  envia ao provedor. O registro `DocumentoFiscal` é criado SEMPRE — com
  status `pendente → enviado → autorizado/rejeitado`; sem configuração o
  status é `nao_configurado` (com o motivo) e a venda continua normal.
- **Onde fica cada coisa**:
  - Banco (`Configuracao "nfce"`, editável em Admin → Configurações → NFC-e):
    série, próximo número, ambiente, logo, emissão automática, provedor.
  - `.env` (nunca no banco/código): `NFCe_PROVEDOR_URL`, `NFCe_TOKEN`,
    `NFCe_CSC`, `NFCe_CSC_ID`, `NFCe_CERT_PATH`, `NFCe_CERT_SENHA`,
    `NFCe_AMBIENTE` (tem precedência sobre o banco), `NFCe_TIMEOUT_MS`.
  - `Admin → Fiscal` (`/admin/fiscal`): lista de documentos com filtros,
    detalhe (chave formatada, protocolo, cStat/xMotivo, XML, DANFE/QR Code),
    **consultar status** no provedor e **cancelar** (justificativa ≥ 15
    caracteres; apenas Administrador e somente se `autorizado`).
- **Contrato do provedor** (`src/lib/fiscal/provedor.ts`, tolerante a
  variações de nomes): `POST {url}/nfce` (payload de emissão),
  `GET {url}/nfce/{chave}`, `POST {url}/nfce/{chave}/cancelamento`
  (`{justificativa}`), `GET {url}/status`. Autenticação
  `Authorization: Bearer NFCe_TOKEN`. Campos esperados na resposta:
  `status`, `chave`, `protocolo`/`nProt`, `cStat`, `xMotivo`, `xml`,
  `danfe`/`danfeUrl`, `qrcodeUrl`, `qrcodeTexto`. Status desconhecido vira
  `erro` — nunca sucesso.
- **Cupom**: quando o documento está `autorizado`, o cupom impresso e o
  diálogo do PDV mostram NFC-e nº/série, ambiente, chave formatada,
  protocolo e autorização; sem autorização, mostram o aviso real
  (não configurado / rejeitado / erro técnico) — nunca texto de sucesso.
- **Produtos**: cadastro com `ncm`, `cest`, `csosn`, `cfop`, `unidade`
  (PATCH/POST `/api/catalogo` e `/api/produtos/[id]`; visíveis em
  Admin → Configurações → Produtos).
- **Permissão**: recurso `fiscal` (somente Administrador) para todas as
  rotas `/api/fiscal/**` e o painel `/admin/fiscal`.

## Estrutura de pastas

```
prisma/
├── schema.prisma          # Modelos (usuários, catálogo, pedidos, caixa, estoque, …)
├── seed.ts                # Dados de demonstração determinísticos
└── dev.db                 # Banco SQLite (ignorado no git)

src/
├── lib/
│   ├── api-cliente.ts     # api<T>() (fetch + erro e redirect 401) e useApi<T>()
│   ├── auth.ts            # Senha bcrypt, sessão por token sha256 (cookie httpOnly)
│   ├── permissao.ts       # Papéis, recursos, permissões por papel (puro)
│   ├── acesso.ts          # Guardas server: autorizar() (APIs), exigirRota() (páginas), auditoria
│   ├── kds-eventos.ts     # Pub/sub in-process: emitirMudancaKds() / assinarMudancaKds()
│   ├── impressao.ts       # Fila/impressão 80 mm: geradores de texto, enfileiramento, agente
│   ├── delivery.ts        # Delivery: status de entrega, taxas por regra, previsão padrão
│   ├── fiscal/            # NFC-e (PEDIDO 19): chave, tipos, config, payload, provedor, emissão, consulta
│   └── prisma.ts          # Cliente Prisma (singleton)
├── app/
│   ├── api/               # Back-end (rotas da tabela acima)
│   ├── layout.tsx         # Layout raiz: fontes (geist), metadata, PWA, <Toaster/>
│   ├── globals.css        # Variáveis de tema + resets + impressão do cupom
│   ├── page.tsx           # Home: módulos filtrados pelo papel do usuário
│   ├── login/page.tsx     # Login real (POST /api/auth/login)
│   ├── login/recuperar/   # Solicitar token de recuperação de senha
│   ├── login/redefinir/   # Definir nova senha com o token (revoga sessões)
│   ├── em-breve/page.tsx  # Módulos planejados
│   ├── not-found.tsx      # 404 no idioma do produto
│   ├── pdv/               # ⭐ Módulo PDV (parte atual)
│   │   ├── page.tsx       # 4 abas: Venda | Salão | Retirada | Caixa
│   │   ├── layout.tsx     # AppShell + providers (Caixa/Retirada/Salão/Venda)
│   │   ├── _lib/
│   │   │   ├── pdv-context.tsx      # Estado do pedido (balcão)
│   │   │   ├── caixa-context.tsx    # Caixa: abertura, movimentações, fechamento (API)
│   │   │   ├── retirada-context.tsx # Pedidos de retirada (API)
│   │   │   ├── salao-context.tsx    # Mesas + comandas do Salão (API)
│   │   │   ├── use-cobranca.ts      # Fluxo comum: pagamento → caixa → NFC-e (+ entrega)
│   │   │   └── mock-data.ts         # Re-exports (cardápio, tipos, formas)
│   │   └── _components/
│   │       ├── catalogo-produtos.tsx  # Busca + abas de categoria (API)
│   │       ├── resumo-pedido.tsx      # Resumo do pedido (desktop/mobile)
│   │       ├── pagamento-dialog.tsx   # Pagamento: forma + troco
│   │       ├── nfce-dialog.tsx        # Cupom NFC-e mock (imprimível)
│   │       ├── salao-view.tsx         # Grade de mesas + cobrança
│   │       ├── retirada-view.tsx      # Lista + novo pedido de retirada
│   │       ├── delivery-view.tsx      # Delivery: filas por status, atribuir, concluir, novo pedido
│   │       └── caixa-view.tsx         # Abertura/movimentações/fechamento
│   ├── admin/                # ⭐ Módulo Administrador
│   │   ├── layout.tsx        # AppShell (nav: Dashboard, Relatórios, Estoque)
│   │   ├── page.tsx          # Dashboard: KPIs, gráficos, últimos pedidos (API)
│   │   ├── relatorios/       # Relatórios (6 abas — API)
│   │   │   └── _components/  # Uma view por relatório (resumo + gráficos + tabelas)
│   │   ├── estoque/          # Estoque (abas: produtos, entradas, fotos, notas — API)
│   │   │   └── _components/  # Uma view por aba do estoque
│   │   └── configuracoes/    # Configurações (7 abas — API)
│   │       └── _components/  # Uma view por aba de configuração
│   ├── entregador/           # ⭐ Módulo Entregador (rota, carrinho, QR Code,
│   │   │                     #   pagamento, relatório e modo offline)
│   │   ├── layout.tsx        # Guarda de sessão (server) + casca client
│   │   ├── page.tsx          # Minha rota (paradas do dia — API)
│   │   ├── carrinho/         # Entregas atribuídas (cards — API)
│   │   ├── qrcode/           # Cobrança Pix na entrega (QR ilustrativo)
│   │   ├── pagamento/        # Cobranças da rota + confirmação (API)
│   │   ├── relatorio/        # Desempenho individual (gráfico + avaliação — API)
│   │   ├── offline/          # Modo offline + fila de sincronização
│   │   └── _components/      # entregador-casca (nav com 6 telas), qr-code-mock
│   ├── cozinha/              # ⭐ Módulo Cozinha/KDS (produção em tempo real)
│   │   ├── layout.tsx        # Guarda de sessão (kds) + casca
│   │   └── page.tsx          # Kanban recebido → em preparo → pronto (SSE + fallback, som)
│   └── garcom/               # Módulo Garçom (mesas e pedidos — API)
├── components/
│   ├── ui/                   # Primitivos shadcn/ui (não editar a lógica base)
│   ├── charts/               # Gráficos SVG/HTML próprios, sem dependências
│   │   ├── bar-chart.tsx     # Barras verticais (HTML/CSS, tokens do DS)
│   │   ├── line-chart.tsx    # Linhas com área suave e pontos (SVG)
│   │   └── donut-chart.tsx   # Rosca com total no centro (SVG)
│   ├── layout/               # Casca do aplicativo (sidebar, header, app-shell)
│   └── patterns/             # Componentes de domínio (status-badge, table-card,
│                             #   produto-card, item-pedido-row, floating-cart-bar,
│                             #   stat-card, page-header, empty-state, module-card)
├── lib/                      # Fallback/contrato dos dados (usados se a API falhar)
│   ├── catalogo.ts           # Produtos, categorias, ItemPedido, calcularTotais
│   ├── mesas.ts              # Mesa, TableStatus, MESAS_INICIAIS
│   ├── pedido.ts             # Tipos/formas de pagamento
│   ├── nfce.ts               # Emissão NFC-e mock (chave 44 dígitos, protocolo)
│   ├── indicadores.ts        # Dados do Dashboard (KPIs, séries, mix, top, últimos)
│   ├── relatorios.ts         # Dados dos Relatórios (6 visões: resumo, séries, tabelas)
│   ├── estoque.ts            # Dados do Estoque (produtos, entradas, NF, categorias)
│   ├── entregador.ts         # Dados do Entregador (rota, carrinho, pagamentos, offline)
│   ├── configuracoes.ts      # Dados das Configurações (empresa, NFC-e, taxas, backup, usuários)
│   └── utils.ts              # cn(), formatBRL(), formatElapsed(), formatHora()
└── hooks/
    └── use-relogio.ts        # Relógio real (Header + tempo decorrido)
```

## Regras de arquitetura

- **Fonte única de dados** em `src/lib/`: catálogo, mesas, tipos/formas de
  pedido e NFC-e. Os `_lib/mock-data.ts` dos módulos só re-exportam — nunca
  duplicam.
- **Persistência real via `src/lib/api-cliente.ts`**: `useApi()` (client)
  carrega da API com fallback nos mocks de `src/lib/`; `api()` faz chamadas
  e lança `Error` com a mensagem do servidor (toasts nas telas); resposta
  401 sem sessão redireciona para `/login`.
- **Toda tela autenticada** nasce do `AppShell` (relógio real, gaveta
  mobile, navegação) e é protegida no servidor (`exigirRota` nos layouts).
- **Fluxo de cobrança único**: `useCobranca` orquestra PagamentoDialog →
  registro no Caixa → NFC-e. Não crie fluxos paralelos.
- **Regra de negócio do caixa**: venda em dinheiro exige caixa aberto
  (validada também no servidor).
- Para qualquer elemento visual novo, **componha a partir do que já existe**
  em `components/ui` e `components/patterns`.

## Implantação (PEDIDO 20)

Guia completo de produção (ambiente, banco, migrações, HTTPS, backup,
segurança e ativação das integrações): **veja [`DEPLOY.md`](./DEPLOY.md)**.

O que mudou no PEDIDO 20:

- **Preços de pedido recalculados no servidor** — o valor enviado pelo
  cliente é ignorado (fonte da verdade: cadastro de produto/tamanho/
  adicionais); item com produto/tamanho inexistente é rejeitado (400).
- **Pagamento duplicado bloqueado** (409) — a venda nunca entra 2× no caixa.
- **Backup real** (`POST /api/backups`): cópia consistente do SQLite via
  `VACUUM INTO` em `prisma/backups/` (antes era registro simulado).
- **Headers de proteção** em todas as respostas; `DEMO_MODE=false` desliga o
  retorno do token de recuperação de senha na API (exige e-mail real).
- **Índices** nas consultas mais quentes e **migração versionada completa**
  (`prisma migrate deploy` validada em banco limpo).
- **Auditoria** ampliada: abertura/fechamento de caixa, backup e ações de
  NFC-e agora também são registrados.
- Relatórios: tempos médios (mesas, preparo, entregadores) calculados de
  dados reais — sem valores fictícios.

## Ainda simulado (ponto de integração externa)

- **NFC-e**: o motor, as APIs, o registro `DocumentoFiscal` e o cupom são
  REAIS (PEDIDO 19); o que falta é a **credencial do provedor** no `.env`
  (`NFCe_PROVEDOR_URL`, `NFCe_TOKEN`, `NFCe_CSC*`, certificado A1 em
  produção) — sem isso o documento fica `nao_configurado` e nada é emitido.
- **QR Code** da cobrança Pix (SVG ilustrativo) e **upload de fotos** do
  estoque.
- **Impressão térmica**: conteúdo, fila e painéis são reais; a impressão
  física depende do agente local (`scripts/agente-impressao/`) na máquina
  com a impressora — o navegador (diálogo de impressão, 80 mm) é o
  substituto direto.
- **Delivery**: o fluxo operacional é real (pedido → atribuição → rota →
  entrega → financeiro, com taxas por regras próprias); **sem Google Maps**
  (roteamento/rastreamento em mapa), **sem integração com apps de
  entregadores** (iFood/Loggi) e sem cobrança Pix integrada com banco — o
  QR Code da cobrança na entrega é ilustrativo.
- **WhatsApp**: atendente com máquina de estados persistida, painel de
  simulação e webhook oficial da Meta (Cloud API) implementados — sem
  credenciais (`WHATSAPP_*`) roda em **modo simulação**; com credenciais,
  mensagens reais entram pelo mesmo motor (PEDIDO 18).
- **IA** (atendente e copiloto): implementada como camada opcional de
  interpretação de linguagem (nunca decide valores); sem chave de API usa
  interpretador determinístico por regras.
- **Copiloto interno** (Admin): consultas em linguagem natural sobre o
  banco, somente leitura, via catálogo fechado de consultas pré-aprovadas
  (`src/lib/copiloto/`) — a IA nunca gera SQL. Variáveis opcionais
  `COPILOTO_IA_*` no `.env`.
- **Integração bancária**: não implementada por escopo.

Consulte `DESIGN_SYSTEM.md` para tokens e diretrizes visuais.

## PWA

- `public/manifest.json` já configurado (nome, cores, ícones).
- `public/sw.js` (service worker) registrado no layout raiz: cacheia só o
  shell estático (manifest + ícones) e **nunca** respostas de `/api/**` —
  dados de pedido vêm sempre da rede.
- Substitua os ícones em `public/icons/` pelos ícones reais da marca.
