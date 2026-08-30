-- Migração INCREMENTAL (não destrutiva).
--
-- Pagamento.idempotencyKey (PEDIDO 44): cliques duplos e retry de rede
-- não podem criar dois registros de pagamento pra uma mesma tentativa
-- do usuário. Nullable + UNIQUE: pagamentos antigos (sem chave) e
-- chamadas de clientes que ainda não enviam a chave continuam
-- funcionando normalmente — a proteção só entra em vigor quando a
-- chave é enviada.

ALTER TABLE "Pagamento" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Pagamento_idempotencyKey_key" ON "Pagamento"("idempotencyKey");
