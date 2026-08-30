-- Migração INCREMENTAL (não destrutiva).
--
-- Tabela Impressora: antes, a configuração de impressoras de cada empresa
-- vivia como um JSON solto em `Configuracao` (chave "impressoras"), com
-- só UM destino por impressora e sem rastreio de status/heartbeat por
-- equipamento. Virou tabela relacional própria porque o novo requisito
-- (múltiplos destinos por impressora, status online calculado por
-- heartbeat do agente, computador vinculado) não cabe bem num blob JSON
-- que era sobrescrito inteiro a cada salvamento.
--
-- SEM PERDA DE DADO: o array `IMPRESSORAS` (fallback em
-- src/lib/configuracoes.ts) sempre foi `[]` — não havia impressora de
-- exemplo. Se alguma empresa em produção já tiver salvo impressoras no
-- formato antigo (`Configuracao.chave = 'impressoras'`), esse registro
-- CONTINUA no banco (esta migration não apaga a tabela Configuracao) —
-- só não é mais lido automaticamente pela tela nova. Recomendação:
-- reconfigurar pela tela Admin → Configurações → Impressoras depois de
-- aplicar esta migration (o cadastro é rápido, e o formato mudou o
-- suficiente — de destino único para múltiplos — que uma migração
-- automática de dado arriscaria inventar destinos que ninguém escolheu).

CREATE TABLE "Impressora" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "modelo" TEXT,
    "fabricante" TEXT,
    "tipoConexao" TEXT NOT NULL,
    "nomeWindows" TEXT,
    "enderecoIp" TEXT,
    "porta" TEXT,
    "larguraPapel" TEXT NOT NULL DEFAULT '80mm',
    "vias" INTEGER NOT NULL DEFAULT 1,
    "impressaoAutomatica" BOOLEAN NOT NULL DEFAULT true,
    "destinos" TEXT NOT NULL DEFAULT '[]',
    "computadorVinculado" TEXT,
    "ultimaComunicacaoEm" TIMESTAMP(3),
    "statusOnline" BOOLEAN NOT NULL DEFAULT false,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Impressora_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Impressora_empresaId_idx" ON "Impressora"("empresaId");

ALTER TABLE "Impressora" ADD CONSTRAINT "Impressora_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
