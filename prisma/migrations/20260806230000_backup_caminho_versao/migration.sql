-- Migração INCREMENTAL (não destrutiva).
--
-- Backup.caminhoArquivo / versaoFormato (PEDIDOS 28/29/30): antes só
-- existia um texto descritivo (`destino`, ex.: "Arquivo local
-- (prisma/backups/xxx.json)") — bom pra humano ler, ruim pra código
-- confiar (teria que fazer parsing de texto pra achar o arquivo de
-- novo). Agora o caminho real fica em campo próprio, e a versão do
-- formato do snapshot permite ao restore recusar arquivos de um
-- formato que não sabe interpretar em vez de tentar e corromper dados.
--
-- Nullable: backups já existentes continuam listados normalmente, só
-- sem suporte a download/restore automático (o `destino` em texto
-- ainda serve pra achar manualmente).

ALTER TABLE "Backup" ADD COLUMN "caminhoArquivo" TEXT;
ALTER TABLE "Backup" ADD COLUMN "versaoFormato" INTEGER;
