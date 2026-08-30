-- Migração INCREMENTAL (não destrutiva) — módulo de entregas.
--
-- 1) Entregador.usuarioId — relação REAL com a conta de login (PEDIDO 14).
--    Antes, autorizar uma ação de entrega comparava
--    `entrega.entregador.nome` com `usuario.nome` (texto, até com
--    `contains`) — inseguro e ambíguo. Nullable + UNIQUE: um cadastro de
--    entregador pode não ter login vinculado ainda (recomendado
--    completar depois desta migration, na tela de Entregadores), mas
--    quando tiver, é um-para-um.
--
-- 2) Entrega.codigoQr — token aleatório imprevisível pra assumir a
--    entrega via QR (PEDIDO 15), em vez do número sequencial do pedido.
--    Nullable + UNIQUE: entregas já existentes continuam válidas sem
--    QR novo (o código antigo baseado em número ainda funciona via
--    fallback documentado no endpoint, só o payload novo é imprevisível).

ALTER TABLE "Entregador" ADD COLUMN "usuarioId" TEXT;
CREATE UNIQUE INDEX "Entregador_usuarioId_key" ON "Entregador"("usuarioId");
ALTER TABLE "Entregador" ADD CONSTRAINT "Entregador_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Entrega" ADD COLUMN "codigoQr" TEXT;
CREATE UNIQUE INDEX "Entrega_codigoQr_key" ON "Entrega"("codigoQr");
