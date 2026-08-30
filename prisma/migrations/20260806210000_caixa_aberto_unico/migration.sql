-- Migração INCREMENTAL (não destrutiva).
--
-- Bug confirmado: abrir caixa fazia `findFirst` (existe caixa aberto?)
-- e SÓ DEPOIS `create` — dois dispositivos clicando "abrir caixa" ao
-- mesmo tempo podiam os dois passar pelo `findFirst` (nenhum viu caixa
-- aberto ainda) antes de qualquer um criar, resultando em DOIS caixas
-- "aberto" simultâneos pra mesma empresa.
--
-- Índice único PARCIAL (só considera linhas com status='aberto'): o
-- Postgres passa a REJEITAR a segunda criação de caixa aberto no nível
-- do banco, não só na checagem da aplicação — a corrida deixa de ser
-- possível independentemente de quantas requisições cheguem juntas.
-- Fechar um caixa (status='fechado') sai do escopo do índice, então
-- não impede abrir um novo depois de fechar o anterior.

CREATE UNIQUE INDEX "Caixa_empresaId_aberto_unico"
    ON "Caixa"("empresaId")
    WHERE status = 'aberto';
