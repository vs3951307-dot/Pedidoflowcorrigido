-- Migração INCREMENTAL (não destrutiva).
--
-- Bug confirmado: o número do pedido era calculado como
-- `(MAX(numero) por empresa) + 1` dentro de uma transação Prisma comum
-- — mas o nível de isolamento padrão do Postgres (READ COMMITTED) NÃO
-- impede duas transações concorrentes de lerem o MESMO `MAX(numero)`
-- antes de qualquer uma delas gravar. Existe `@@unique([empresaId,
-- numero])` no schema, então isso não duplicava número silenciosamente
-- — mas fazia a SEGUNDA transação concorrente estourar violação de
-- constraint única, virando erro 500 pro cliente que só queria fazer
-- um pedido em um horário de pico.
--
-- Correção: uma tabela de contador dedicada por empresa. Incrementar
-- via `UPDATE ... SET "ultimoNumero" = "ultimoNumero" + 1` é ATÔMICO no
-- Postgres (a linha fica bloqueada durante o UPDATE) — duas requisições
-- concorrentes são serializadas pelo próprio banco, nunca colidem.
--
-- BACKFILL OBRIGATÓRIO: o contador de cada empresa começa do MAIOR
-- número de pedido JÁ EXISTENTE (nunca de 1000 fixo) — senão, uma
-- empresa que já tem pedidos até o #1247 receberia um novo pedido
-- #1001 e colidiria com a constraint única na primeira venda depois
-- do deploy. Empresas sem nenhum pedido ainda começam em 1000 (mesmo
-- valor inicial que o código já usava).

CREATE TABLE "ContadorPedido" (
    "empresaId" TEXT NOT NULL,
    "ultimoNumero" INTEGER NOT NULL DEFAULT 1000,
    CONSTRAINT "ContadorPedido_pkey" PRIMARY KEY ("empresaId")
);

ALTER TABLE "ContadorPedido" ADD CONSTRAINT "ContadorPedido_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: uma linha por empresa que JÁ TEM pedido, com o maior número
-- encontrado. Empresas sem nenhum pedido não entram aqui — o código
-- cria a linha com o padrão (1000) na primeira vez que precisar,
-- via upsert (ver `src/lib/contador.ts`).
INSERT INTO "ContadorPedido" ("empresaId", "ultimoNumero")
SELECT "empresaId", MAX("numero")
FROM "Pedido"
GROUP BY "empresaId";
