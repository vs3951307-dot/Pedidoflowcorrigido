-- Migração INCREMENTAL (não destrutiva).
--
-- Plano.limiteProdutos (PEDIDO 69/31): item explicitamente pedido na
-- lista de limites do construtor de planos, mas que não existia em
-- lugar nenhum do schema. Nullable = sem limite (mesma convenção já
-- usada em limiteUsuarios/limiteMensagensIA) — planos existentes
-- continuam sem limite de produtos até o Super Admin configurar um.

ALTER TABLE "Plano" ADD COLUMN "limiteProdutos" INTEGER;
