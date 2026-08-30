-- Migração INCREMENTAL (não destrutiva) — módulo de impressão apenas.
--
-- 1) FilaImpressao.impressoraId / nomeImpressoraWindows — cada trabalho
--    agora carrega QUAL impressora específica deve imprimi-lo (antes, o
--    agente resolvia a impressora "na hora" a partir do destino, o que
--    não dava pra usar quando duas impressoras diferentes atendiam
--    destinos parecidos). Nullable: trabalhos antigos na fila continuam
--    válidos, só não têm impressora específica atribuída (o agente cai
--    no comportamento anterior pra esses).
--
-- 2) FilaImpressao.processandoEm — marca quando um agente reivindicou o
--    trabalho, usada para (a) detectar reivindicação simultânea por dois
--    agentes (impressão duplicada) e (b) destravar sozinho um trabalho
--    preso em "processando" se o agente caiu no meio do processo.

ALTER TABLE "FilaImpressao" ADD COLUMN "impressoraId" TEXT;
ALTER TABLE "FilaImpressao" ADD COLUMN "nomeImpressoraWindows" TEXT;
ALTER TABLE "FilaImpressao" ADD COLUMN "processandoEm" TIMESTAMP(3);
