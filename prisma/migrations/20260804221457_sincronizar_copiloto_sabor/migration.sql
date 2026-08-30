-- Migração INCREMENTAL (não destrutiva): sincroniza o schema `public`
-- com o schema.prisma atual do PedidoFlow.
--
-- 1) Tabela AcaoPendenteCopiloto (model novo — fluxo Human-in-the-Loop do
--    Copiloto Supremo e do Copiloto da Empresa). Antes desta migration a
--    tabela não existia fisicamente, e qualquer confirmação de ação
--    (criarAcaoPendente/procurarAcaoPendente) estourava "does not exist" → 500.
-- 2) Coluna Sabor.ativo (Boolean @default(true)) — faltava na tabela
--    existente; consultas do PDV/atendente que selecionam `ativo`
--    quebravam com "column does not exist".

CREATE TABLE "AcaoPendenteCopiloto" (
    "id" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "solicitanteId" TEXT NOT NULL,
    "empresaId" TEXT,
    "instrucaoOriginal" TEXT NOT NULL,
    "acoes" TEXT NOT NULL,
    "resolvida" BOOLEAN NOT NULL DEFAULT false,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcaoPendenteCopiloto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AcaoPendenteCopiloto_solicitanteId_idx" ON "AcaoPendenteCopiloto"("solicitanteId");
CREATE INDEX "AcaoPendenteCopiloto_expiraEm_idx" ON "AcaoPendenteCopiloto"("expiraEm");

-- Coluna que faltava em Sabor (default respeita o schema.prisma: @default(true)).
ALTER TABLE "Sabor" ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT true;