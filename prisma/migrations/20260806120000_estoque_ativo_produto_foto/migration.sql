-- Migração INCREMENTAL (não destrutiva).
--
-- 1) Produto.fotoUrl — upload de foto do produto (PEDIDO: "finalizar
--    upload de foto de produto"). Nullable, sem default: produto sem foto
--    continua funcionando normalmente (cai no emoji, como já era).
--
-- 2) EstoqueProduto.ativo — ativar/desativar item de estoque (PEDIDO:
--    "permitir editar, ativar/desativar e excluir de forma segura").
--    DEFAULT true preserva o comportamento atual: todo item já cadastrado
--    continua "ativo" depois da migration, nada some da tela.
--
-- 3) EstoqueProduto.fotoUrl — foto do item de estoque (aba "Fotos").
--    Mesma lógica do Produto.fotoUrl: nullable, sem binário no banco.

ALTER TABLE "Produto" ADD COLUMN "fotoUrl" TEXT;

ALTER TABLE "EstoqueProduto" ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "EstoqueProduto" ADD COLUMN "fotoUrl" TEXT;
