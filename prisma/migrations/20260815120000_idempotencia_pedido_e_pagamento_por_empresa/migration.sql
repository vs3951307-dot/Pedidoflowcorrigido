-- Migração INCREMENTAL e NÃO DESTRUTIVA.
--
-- Nada é apagado, truncado ou reescrito: só uma coluna nova (nullable) e
-- troca de dois índices únicos por versões escopadas em `empresaId`.
--
-- ============================================================
-- 1) Pedido.idempotencyKey — item 1 da auditoria
-- ============================================================
-- "Duas requisições simultâneas com a mesma chave devem gerar somente 1
-- pedido." A garantia REAL disso é o índice único abaixo: quem perde a
-- corrida recebe P2002 do Postgres (a segunda inserção fica BLOQUEADA
-- até a primeira commitar, então quando o erro chega o pedido vencedor
-- já está visível) e a rota devolve o pedido já criado.
--
-- Antes desta migração o código guardava a chave no campo `observacao`
-- (que era logo em seguida sobrescrito pela observação real do pedido) e
-- procurava duplicata com `findFirst` — sem constraint nenhuma. Ou seja:
-- a chave nunca era de fato persistida e duas requisições concorrentes
-- criavam DOIS pedidos.
ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

-- Unicidade POR EMPRESA (nunca global): uma chave da empresa A não pode
-- bloquear nem vazar um pedido da empresa B. No Postgres, NULLs são
-- distintos entre si num índice único (NULLS DISTINCT é o padrão), então
-- qualquer número de pedidos SEM chave convive sem conflito.
CREATE UNIQUE INDEX IF NOT EXISTS "Pedido_empresaId_idempotencyKey_key"
  ON "Pedido" ("empresaId", "idempotencyKey");

-- ============================================================
-- 2) Pagamento.idempotencyKey — de GLOBAL para POR EMPRESA (item 2)
-- ============================================================
-- O índice antigo era global (`Pagamento_idempotencyKey_key` sobre uma
-- coluna só). Consequências reais, ambas corrigidas aqui:
--   a) uma chave já gravada pela empresa A fazia o INSERT da empresa B
--      falhar com P2002 — um pagamento de OUTRO cliente bloqueando uma
--      cobrança legítima;
--   b) o lookup `findUnique({ idempotencyKey })` não filtrava empresa e
--      podia devolver o pagamento de OUTRO tenant.
--
-- A troca abaixo NÃO enfraquece a proteção: dentro da mesma empresa a
-- chave continua única. Só deixa de valer entre empresas — que é
-- exatamente o comportamento correto num sistema multiempresa.
--
-- Ordem importa: cria o índice novo ANTES de remover o antigo, para que
-- a janela sem proteção seja zero.
CREATE UNIQUE INDEX IF NOT EXISTS "Pagamento_empresaId_idempotencyKey_key"
  ON "Pagamento" ("empresaId", "idempotencyKey");

-- O Prisma cria `@unique` de campo como ÍNDICE único, mas em bancos que
-- passaram por `db push`/edição manual isso pode existir como CONSTRAINT.
-- Os dois caminhos são cobertos, sem erro se nenhum existir.
ALTER TABLE "Pagamento" DROP CONSTRAINT IF EXISTS "Pagamento_idempotencyKey_key";
DROP INDEX IF EXISTS "Pagamento_idempotencyKey_key";
