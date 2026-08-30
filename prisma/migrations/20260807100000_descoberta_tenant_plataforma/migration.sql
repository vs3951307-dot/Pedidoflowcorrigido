-- Migração INCREMENTAL (não destrutiva) — corrige um bloqueador real.
--
-- PEDIDO 1: `encontrarEmpresaPorTokenAgente()` consultava
-- `prisma.configuracao` (modelo de TENANT — vive num schema Postgres
-- SEPARADO por empresa) para descobrir a qual empresa um agente de
-- impressão pertence — mas essa descoberta acontece exatamente ANTES
-- de sabermos qual tenant ativar. Isso não era "arriscado", era
-- estruturalmente impossível: não existe consulta única que procure
-- "em todas as empresas" quando cada empresa é um schema diferente, e
-- o Proxy de `src/lib/prisma.ts` lança erro imediato ao tentar acessar
-- um model de tenant sem tenant ativo no contexto.
--
-- PEDIDO 7: mesmo problema, mesmo mecanismo, no webhook do WhatsApp
-- (`encontrarEmpresaPorPhoneNumberId`/`verificarTokenWebhook`).
--
-- Correção: os identificadores usados PARA a descoberta (hash do token
-- de impressão; phoneNumberId e verifyToken do WhatsApp) passam a
-- viver diretamente em Empresa (modelo de PLATAFORMA, schema `public`,
-- sempre consultável sem tenant ativo). Nenhum segredo de verdade sai
-- do schema do tenant — o access token do WhatsApp (usado para ENVIAR
-- mensagens) continua só lá; aqui só ficam identificadores/hashes
-- usados exclusivamente para saber QUAL tenant ativar.

ALTER TABLE "Empresa" ADD COLUMN "agenteImpressaoTokenHash" TEXT;
CREATE UNIQUE INDEX "Empresa_agenteImpressaoTokenHash_key" ON "Empresa"("agenteImpressaoTokenHash");

ALTER TABLE "Empresa" ADD COLUMN "whatsappPhoneNumberId" TEXT;
CREATE UNIQUE INDEX "Empresa_whatsappPhoneNumberId_key" ON "Empresa"("whatsappPhoneNumberId");

ALTER TABLE "Empresa" ADD COLUMN "whatsappVerifyToken" TEXT;
