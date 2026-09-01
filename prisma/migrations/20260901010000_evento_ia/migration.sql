-- CreateTable
CREATE TABLE "EventoIA" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "etapa" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "tokensEntrada" INTEGER NOT NULL DEFAULT 0,
    "tokensSaida" INTEGER NOT NULL DEFAULT 0,
    "latenciaMs" INTEGER NOT NULL DEFAULT 0,
    "toolsChamadas" TEXT,
    "erro" TEXT,
    "duracaoMs" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoIA_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventoIA_empresaId_idx" ON "EventoIA"("empresaId");

-- CreateIndex
CREATE INDEX "EventoIA_criadoEm_idx" ON "EventoIA"("criadoEm");

-- CreateIndex
CREATE INDEX "EventoIA_tipo_idx" ON "EventoIA"("tipo");

-- AddForeignKey
ALTER TABLE "EventoIA" ADD CONSTRAINT "EventoIA_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
