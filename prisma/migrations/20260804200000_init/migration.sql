-- ============================================================================
-- PedidoFlow — Migration BASELINE/INICIAL
-- ============================================================================
--
-- Corrige um problema real encontrado numa revisão final antes do primeiro
-- deploy de teste: as migrations existentes até agora eram todas
-- INCREMENTAIS (ALTER TABLE em cima de tabelas presumidas já existentes) —
-- não havia, em lugar nenhum, uma migration que CRIASSE as tabelas base.
-- Num Postgres/Supabase vazio, `prisma migrate deploy` falharia na primeira
-- migration incremental com "relation does not exist".
--
-- Esta migration representa o estado do banco EXATAMENTE COMO ELE ERA antes
-- da primeira migration incremental (20260804221457_sincronizar_copiloto_
-- sabor) — ou seja, sem AcaoPendenteCopiloto, sem Sabor.ativo, sem Impressora,
-- sem os campos adicionados pelas migrations seguintes. Cada migration
-- incremental já existente aplica sua própria mudança em cima desta base,
-- exatamente como já fazia — nenhuma delas foi alterada. O resultado final
-- (baseline + todas as incrementais aplicadas em ordem) é idêntico ao
-- schema.prisma atual.
--
-- Datada ANTES da primeira migration incremental (2026-08-04 20:00:00, a
-- incremental mais antiga é 2026-08-04 22:14:57) para rodar primeiro.
--
-- ============================================================================
-- PARTE 1 — TABELAS (sem foreign keys ainda — adicionadas na Parte 3)
-- ============================================================================

CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "razaoSocial" TEXT,
    "cnpj" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "logoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'teste',
    "plano" TEXT NOT NULL DEFAULT 'basico',
    "planoId" TEXT,
    "modulos" TEXT NOT NULL DEFAULT '[]',
    "tema" TEXT NOT NULL DEFAULT '{}',
    "textos" TEXT NOT NULL DEFAULT '{}',
    "menuConfig" TEXT NOT NULL DEFAULT '[]',
    "schemaBanco" TEXT,
    "databaseUrlSecreta" TEXT,
    "limiteMensagensIA" INTEGER,
    "usoIAMesAtual" INTEGER NOT NULL DEFAULT 0,
    "usoIAMesReferencia" TEXT,
    "trialFimEm" TIMESTAMP(3),
    "planoInicioEm" TIMESTAMP(3),
    "vencimentoEm" TIMESTAMP(3),
    "ultimaAtividadeEm" TIMESTAMP(3),
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Plano" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "preco" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "moeda" TEXT NOT NULL DEFAULT 'BRL',
    "descricao" TEXT,
    "modulosPadrao" TEXT NOT NULL DEFAULT '[]',
    "limiteUsuarios" INTEGER,
    "limiteMensagensIA" INTEGER,
    "iaIncluida" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plano_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HistoricoCopiloto" (
    "id" TEXT NOT NULL,
    "superAdminId" TEXT NOT NULL,
    "superAdminNome" TEXT NOT NULL,
    "empresaId" TEXT,
    "empresaNome" TEXT,
    "instrucaoOriginal" TEXT NOT NULL,
    "acoesAplicadas" TEXT NOT NULL,
    "estadoAnterior" TEXT NOT NULL,
    "estadoNovo" TEXT NOT NULL,
    "sucesso" BOOLEAN NOT NULL DEFAULT true,
    "desfeitoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricoCopiloto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LandingConfig" (
    "id" TEXT NOT NULL DEFAULT 'landing',
    "conteudo" TEXT NOT NULL DEFAULT '{}',
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandingConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UsoIa" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tokensEntrada" INTEGER NOT NULL DEFAULT 0,
    "tokensSaida" INTEGER NOT NULL DEFAULT 0,
    "custoEstimado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsoIa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SuperAdmin" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoAcesso" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuperAdmin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SessaoSuperAdmin" (
    "token" TEXT NOT NULL,
    "superAdminId" TEXT NOT NULL,
    "userAgent" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessaoSuperAdmin_pkey" PRIMARY KEY ("token")
);

CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" TEXT NOT NULL DEFAULT 'CAIXA',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoAcesso" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Sessao" (
    "token" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "userAgent" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sessao_pkey" PRIMARY KEY ("token")
);

CREATE TABLE "TokenRecuperacao" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenRecuperacao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PermissaoUsuario" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "recurso" TEXT NOT NULL,
    "permitido" BOOLEAN NOT NULL,

    CONSTRAINT "PermissaoUsuario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Auditoria" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT,
    "usuarioId" TEXT,
    "usuarioNome" TEXT,
    "acao" TEXT NOT NULL,
    "detalhe" TEXT,
    "ip" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "email" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Endereco" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "rotulo" TEXT,
    "rua" TEXT NOT NULL,
    "bairro" TEXT NOT NULL,
    "cidade" TEXT,
    "cep" TEXT,
    "complemento" TEXT,
    "referencia" TEXT,

    CONSTRAINT "Endereco_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Categoria" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Produto" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "preco" DOUBLE PRECISION NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '🍕',
    "destaque" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ncm" TEXT NOT NULL DEFAULT '',
    "cest" TEXT NOT NULL DEFAULT '',
    "csosn" TEXT NOT NULL DEFAULT '102',
    "cfop" TEXT NOT NULL DEFAULT '5102',
    "unidade" TEXT NOT NULL DEFAULT 'UN',

    CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Sabor" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'tradicional',

    CONSTRAINT "Sabor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProdutoSabor" (
    "produtoId" TEXT NOT NULL,
    "saborId" TEXT NOT NULL,

    CONSTRAINT "ProdutoSabor_pkey" PRIMARY KEY ("produtoId","saborId")
);

CREATE TABLE "Tamanho" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "fatorPreco" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "Tamanho_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrecoTamanho" (
    "produtoId" TEXT NOT NULL,
    "tamanhoId" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PrecoTamanho_pkey" PRIMARY KEY ("produtoId","tamanhoId")
);

CREATE TABLE "Adicional" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "preco" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Adicional_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Mesa" (
    "id" SERIAL NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "capacidade" INTEGER NOT NULL DEFAULT 4,
    "status" TEXT NOT NULL DEFAULT 'livre',
    "garcom" TEXT,
    "pessoas" INTEGER,
    "abertaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mesa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Pedido" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "canal" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'andamento',
    "producao" TEXT NOT NULL DEFAULT 'recebido',
    "recebidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "preparoIniciadoEm" TIMESTAMP(3),
    "prontoEm" TIMESTAMP(3),
    "finalizadoEm" TIMESTAMP(3),
    "clienteNome" TEXT,
    "clienteId" TEXT,
    "clienteTelefone" TEXT,
    "mesaId" INTEGER,
    "observacao" TEXT,
    "previsao" TEXT,
    "taxaEntrega" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trocoPara" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "formaPagamentoEntrega" TEXT,
    "origem" TEXT,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentoFiscal" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "ambiente" TEXT NOT NULL DEFAULT 'homologacao',
    "provedor" TEXT,
    "numero" INTEGER,
    "serie" INTEGER,
    "chave" TEXT,
    "protocolo" TEXT,
    "cStat" TEXT,
    "xMotivo" TEXT,
    "xml" TEXT,
    "danfeUrl" TEXT,
    "qrcodeUrl" TEXT,
    "qrcodeTexto" TEXT,
    "erro" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "emitidaEm" TIMESTAMP(3),
    "autorizadaEm" TIMESTAMP(3),
    "canceladaEm" TIMESTAMP(3),
    "motivoCancelamento" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoFiscal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ItemPedido" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "precoUnit" DOUBLE PRECISION NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "tamanho" TEXT,
    "observacao" TEXT,
    "sabores" TEXT,
    "adicionais" TEXT,

    CONSTRAINT "ItemPedido_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Pagamento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "forma" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "troco" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'confirmado',
    "recebidoPorId" TEXT,
    "recebidoPorNome" TEXT,
    "repassadoAoCaixa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pagamento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Caixa" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "abertoEm" TIMESTAMP(3) NOT NULL,
    "fechadoEm" TIMESTAMP(3),
    "saldoInicial" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'aberto',

    CONSTRAINT "Caixa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MovimentacaoCaixa" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "caixaId" TEXT,
    "tipo" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "descricao" TEXT NOT NULL,
    "metodo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentacaoCaixa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EstoqueProduto" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "minimo" DOUBLE PRECISION NOT NULL,
    "custoUnitario" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "EstoqueProduto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MovimentacaoEstoque" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "fornecedor" TEXT,
    "valorTotal" DOUBLE PRECISION,
    "responsavel" TEXT NOT NULL,
    "notaId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentacaoEstoque_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotaFiscal" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "serie" TEXT NOT NULL DEFAULT '1',
    "fornecedor" TEXT NOT NULL,
    "emissao" TIMESTAMP(3) NOT NULL,
    "itens" INTEGER NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'conferida',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotaFiscal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Entregador" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "avaliacao" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "statusHoje" TEXT NOT NULL DEFAULT 'ativo',

    CONSTRAINT "Entregador_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Entrega" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "entregadorId" TEXT,
    "endereco" TEXT NOT NULL,
    "bairro" TEXT NOT NULL,
    "complemento" TEXT,
    "referencia" TEXT,
    "telefone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'aguardando',
    "previsao" TEXT,
    "km" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gorjeta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tempoMedio" INTEGER,
    "ocorrencia" TEXT,
    "iniciadaEm" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entrega_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Configuracao" (
    "empresaId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Configuracao_pkey" PRIMARY KEY ("empresaId","chave")
);

CREATE TABLE "ConversaWhatsApp" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "nome" TEXT,
    "status" TEXT NOT NULL DEFAULT 'nova',
    "etapa" TEXT NOT NULL DEFAULT 'saudacao',
    "estado" TEXT NOT NULL DEFAULT '{}',
    "atendimentoHumano" BOOLEAN NOT NULL DEFAULT false,
    "humanaDesde" TIMESTAMP(3),
    "motivoTransferencia" TEXT,
    "ultimaPergunta" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'whatsapp',
    "pedidoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversaWhatsApp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MensagemWhatsApp" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "de" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensagemWhatsApp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FilaImpressao" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "vias" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "criadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "concluidoEm" TIMESTAMP(3),

    CONSTRAINT "FilaImpressao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Backup" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "tipo" TEXT NOT NULL,
    "tamanho" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'concluido',

    CONSTRAINT "Backup_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- PARTE 2 — ÍNDICES E CONSTRAINTS ÚNICAS
-- ============================================================================

CREATE UNIQUE INDEX "Empresa_slug_key" ON "Empresa"("slug");
CREATE UNIQUE INDEX "Empresa_schemaBanco_key" ON "Empresa"("schemaBanco");
CREATE INDEX "Empresa_status_idx" ON "Empresa"("status");

CREATE UNIQUE INDEX "Plano_slug_key" ON "Plano"("slug");

CREATE INDEX "HistoricoCopiloto_empresaId_idx" ON "HistoricoCopiloto"("empresaId");
CREATE INDEX "HistoricoCopiloto_criadoEm_idx" ON "HistoricoCopiloto"("criadoEm");

CREATE INDEX "UsoIa_empresaId_criadoEm_idx" ON "UsoIa"("empresaId", "criadoEm");
CREATE INDEX "UsoIa_tipo_idx" ON "UsoIa"("tipo");

CREATE UNIQUE INDEX "SuperAdmin_email_key" ON "SuperAdmin"("email");

CREATE INDEX "SessaoSuperAdmin_superAdminId_idx" ON "SessaoSuperAdmin"("superAdminId");

CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");
CREATE INDEX "Usuario_empresaId_idx" ON "Usuario"("empresaId");

CREATE INDEX "Sessao_usuarioId_idx" ON "Sessao"("usuarioId");

CREATE UNIQUE INDEX "TokenRecuperacao_tokenHash_key" ON "TokenRecuperacao"("tokenHash");

CREATE UNIQUE INDEX "PermissaoUsuario_usuarioId_recurso_key" ON "PermissaoUsuario"("usuarioId", "recurso");

CREATE INDEX "Auditoria_usuarioId_idx" ON "Auditoria"("usuarioId");
CREATE INDEX "Auditoria_criadoEm_idx" ON "Auditoria"("criadoEm");
CREATE INDEX "Auditoria_empresaId_idx" ON "Auditoria"("empresaId");

CREATE INDEX "Cliente_telefone_idx" ON "Cliente"("telefone");
CREATE INDEX "Cliente_empresaId_idx" ON "Cliente"("empresaId");

CREATE UNIQUE INDEX "Categoria_empresaId_nome_key" ON "Categoria"("empresaId", "nome");

CREATE INDEX "Produto_categoriaId_idx" ON "Produto"("categoriaId");
CREATE INDEX "Produto_empresaId_idx" ON "Produto"("empresaId");

CREATE UNIQUE INDEX "Sabor_empresaId_nome_key" ON "Sabor"("empresaId", "nome");

CREATE UNIQUE INDEX "Tamanho_empresaId_nome_key" ON "Tamanho"("empresaId", "nome");

CREATE UNIQUE INDEX "Adicional_empresaId_nome_key" ON "Adicional"("empresaId", "nome");

CREATE UNIQUE INDEX "Mesa_empresaId_numero_key" ON "Mesa"("empresaId", "numero");
CREATE INDEX "Mesa_empresaId_idx" ON "Mesa"("empresaId");

CREATE UNIQUE INDEX "Pedido_empresaId_numero_key" ON "Pedido"("empresaId", "numero");
CREATE INDEX "Pedido_status_idx" ON "Pedido"("status");
CREATE INDEX "Pedido_criadoEm_idx" ON "Pedido"("criadoEm");
CREATE INDEX "Pedido_mesaId_idx" ON "Pedido"("mesaId");
CREATE INDEX "Pedido_clienteId_idx" ON "Pedido"("clienteId");
CREATE INDEX "Pedido_canal_idx" ON "Pedido"("canal");
CREATE INDEX "Pedido_producao_idx" ON "Pedido"("producao");
CREATE INDEX "Pedido_empresaId_idx" ON "Pedido"("empresaId");

CREATE UNIQUE INDEX "DocumentoFiscal_pedidoId_key" ON "DocumentoFiscal"("pedidoId");
CREATE INDEX "DocumentoFiscal_status_idx" ON "DocumentoFiscal"("status");
CREATE INDEX "DocumentoFiscal_empresaId_idx" ON "DocumentoFiscal"("empresaId");

CREATE INDEX "ItemPedido_pedidoId_idx" ON "ItemPedido"("pedidoId");

CREATE INDEX "Pagamento_pedidoId_idx" ON "Pagamento"("pedidoId");
CREATE INDEX "Pagamento_empresaId_idx" ON "Pagamento"("empresaId");
CREATE INDEX "Pagamento_repassadoAoCaixa_idx" ON "Pagamento"("repassadoAoCaixa");

CREATE INDEX "Caixa_empresaId_idx" ON "Caixa"("empresaId");
CREATE INDEX "Caixa_status_idx" ON "Caixa"("status");

CREATE INDEX "MovimentacaoCaixa_caixaId_idx" ON "MovimentacaoCaixa"("caixaId");
CREATE INDEX "MovimentacaoCaixa_criadoEm_idx" ON "MovimentacaoCaixa"("criadoEm");
CREATE INDEX "MovimentacaoCaixa_empresaId_idx" ON "MovimentacaoCaixa"("empresaId");

CREATE UNIQUE INDEX "EstoqueProduto_empresaId_nome_key" ON "EstoqueProduto"("empresaId", "nome");

CREATE INDEX "MovimentacaoEstoque_produtoId_idx" ON "MovimentacaoEstoque"("produtoId");
CREATE INDEX "MovimentacaoEstoque_criadoEm_idx" ON "MovimentacaoEstoque"("criadoEm");
CREATE INDEX "MovimentacaoEstoque_empresaId_idx" ON "MovimentacaoEstoque"("empresaId");

CREATE INDEX "NotaFiscal_empresaId_idx" ON "NotaFiscal"("empresaId");

CREATE UNIQUE INDEX "Entregador_empresaId_email_key" ON "Entregador"("empresaId", "email");
CREATE INDEX "Entregador_empresaId_idx" ON "Entregador"("empresaId");

CREATE UNIQUE INDEX "Entrega_pedidoId_key" ON "Entrega"("pedidoId");
CREATE INDEX "Entrega_entregadorId_idx" ON "Entrega"("entregadorId");
CREATE INDEX "Entrega_status_idx" ON "Entrega"("status");
CREATE INDEX "Entrega_empresaId_idx" ON "Entrega"("empresaId");

CREATE UNIQUE INDEX "ConversaWhatsApp_pedidoId_key" ON "ConversaWhatsApp"("pedidoId");
CREATE UNIQUE INDEX "ConversaWhatsApp_empresaId_telefone_key" ON "ConversaWhatsApp"("empresaId", "telefone");
CREATE INDEX "ConversaWhatsApp_empresaId_idx" ON "ConversaWhatsApp"("empresaId");

CREATE INDEX "MensagemWhatsApp_conversaId_idx" ON "MensagemWhatsApp"("conversaId");

CREATE INDEX "FilaImpressao_status_idx" ON "FilaImpressao"("status");
CREATE INDEX "FilaImpressao_criadoEm_idx" ON "FilaImpressao"("criadoEm");
CREATE INDEX "FilaImpressao_empresaId_idx" ON "FilaImpressao"("empresaId");

CREATE INDEX "Backup_empresaId_idx" ON "Backup"("empresaId");

-- ============================================================================
-- PARTE 3 — FOREIGN KEYS
-- ============================================================================

ALTER TABLE "Empresa" ADD CONSTRAINT "Empresa_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "Plano"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UsoIa" ADD CONSTRAINT "UsoIa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SessaoSuperAdmin" ADD CONSTRAINT "SessaoSuperAdmin_superAdminId_fkey" FOREIGN KEY ("superAdminId") REFERENCES "SuperAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Sessao" ADD CONSTRAINT "Sessao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TokenRecuperacao" ADD CONSTRAINT "TokenRecuperacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PermissaoUsuario" ADD CONSTRAINT "PermissaoUsuario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Endereco" ADD CONSTRAINT "Endereco_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Categoria" ADD CONSTRAINT "Categoria_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Produto" ADD CONSTRAINT "Produto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Sabor" ADD CONSTRAINT "Sabor_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProdutoSabor" ADD CONSTRAINT "ProdutoSabor_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProdutoSabor" ADD CONSTRAINT "ProdutoSabor_saborId_fkey" FOREIGN KEY ("saborId") REFERENCES "Sabor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Tamanho" ADD CONSTRAINT "Tamanho_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PrecoTamanho" ADD CONSTRAINT "PrecoTamanho_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrecoTamanho" ADD CONSTRAINT "PrecoTamanho_tamanhoId_fkey" FOREIGN KEY ("tamanhoId") REFERENCES "Tamanho"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Adicional" ADD CONSTRAINT "Adicional_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Mesa" ADD CONSTRAINT "Mesa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DocumentoFiscal" ADD CONSTRAINT "DocumentoFiscal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentoFiscal" ADD CONSTRAINT "DocumentoFiscal_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ItemPedido" ADD CONSTRAINT "ItemPedido_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemPedido" ADD CONSTRAINT "ItemPedido_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Caixa" ADD CONSTRAINT "Caixa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MovimentacaoCaixa" ADD CONSTRAINT "MovimentacaoCaixa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimentacaoCaixa" ADD CONSTRAINT "MovimentacaoCaixa_caixaId_fkey" FOREIGN KEY ("caixaId") REFERENCES "Caixa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EstoqueProduto" ADD CONSTRAINT "EstoqueProduto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MovimentacaoEstoque" ADD CONSTRAINT "MovimentacaoEstoque_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimentacaoEstoque" ADD CONSTRAINT "MovimentacaoEstoque_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "EstoqueProduto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Entregador" ADD CONSTRAINT "Entregador_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_entregadorId_fkey" FOREIGN KEY ("entregadorId") REFERENCES "Entregador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Configuracao" ADD CONSTRAINT "Configuracao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConversaWhatsApp" ADD CONSTRAINT "ConversaWhatsApp_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversaWhatsApp" ADD CONSTRAINT "ConversaWhatsApp_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MensagemWhatsApp" ADD CONSTRAINT "MensagemWhatsApp_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "ConversaWhatsApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FilaImpressao" ADD CONSTRAINT "FilaImpressao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Backup" ADD CONSTRAINT "Backup_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
