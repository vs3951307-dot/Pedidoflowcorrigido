-- Migração INCREMENTAL (não destrutiva) — módulo de impressão.
--
-- Lease de reivindicação de verdade (PEDIDO: "implementar um mecanismo
-- robusto de LEASE/LOCK da impressão"), substituindo o timeout cego de
-- 60s por um lease com expiração RENOVÁVEL via heartbeat:
--
--   claimId        — token aleatório da reivindicação atual. Só quem
--                    apresenta o claimId certo pode renovar/concluir/
--                    reportar erro deste trabalho específico.
--   leaseAte       — quando o lease expira SE não houver heartbeat.
--                    Renovado a cada heartbeat enquanto o agente
--                    imprime de verdade — nunca um timeout fixo desde
--                    a reivindicação original.
--   processandoPor — computador (x-agente-computador) que detém o
--                    lease atual, para autorização por identidade além
--                    do claimId.
--
-- Todas nullable: trabalhos antigos na fila continuam válidos, só sem
-- lease atribuído ainda (tratados como "nunca reivindicados").

ALTER TABLE "FilaImpressao" ADD COLUMN "claimId" TEXT;
ALTER TABLE "FilaImpressao" ADD COLUMN "leaseAte" TIMESTAMP(3);
ALTER TABLE "FilaImpressao" ADD COLUMN "processandoPor" TEXT;

CREATE INDEX "FilaImpressao_claimId_idx" ON "FilaImpressao"("claimId");
