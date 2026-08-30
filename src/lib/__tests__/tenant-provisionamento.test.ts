import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import {
  provisionarSchemaEmpresa,
  sincronizarSchemaEmpresa,
  INDICE_CAIXA_ABERTO_UNICO,
} from "@/lib/tenant-provisionamento";
import { clientePg, garantirBancoDeTeste } from "@/lib/__tests__/ajuda-banco-de-teste";

/**
 * ITENS 3 E 4 DA AUDITORIA — sincronização incremental de schema de
 * tenant, provada contra um PostgreSQL real.
 *
 * Item 3 (DEFAULT ''): o sincronizador não pode INVENTAR default. Uma
 * coluna obrigatória nova, numa tabela que já tem linhas, não pode ser
 * preenchida com string vazia — tem de virar pendência com SQL de
 * reparo. E `DEFAULT ''` herdado de versões antigas precisa ser
 * DETECTADO.
 *
 * Item 4 (UNIQUE incremental): o sincronizador precisa comparar o que o
 * schema.prisma exige com o que existe no PostgreSQL, criar o que falta
 * e — o ponto crítico — RECUSAR criar quando os dados atuais já violam
 * a regra, reportando a pendência em vez de apagar/alterar linhas.
 *
 * Tudo roda num schema DESCARTÁVEL criado e derrubado pela própria
 * suíte. Nenhum tenant real é tocado.
 */

const SCHEMA_TESTE = `tenant_teste_sinc_${Date.now().toString(36)}`;
const EMPRESA_FICTICIA = "empresa-de-teste-sincronizacao";

let pg: Client;

/** Recria o schema descartável do zero, com todas as tabelas do Prisma. */
async function recriarSchema() {
  await pg.query(`DROP SCHEMA IF EXISTS "${SCHEMA_TESTE}" CASCADE`);
  // `dedicado: true` = sem FK para public."Empresa" — o schema de teste é
  // autocontido e não depende de uma empresa real existir.
  await provisionarSchemaEmpresa(garantirBancoDeTeste(), SCHEMA_TESTE, { dedicado: true });
}

async function sincronizar() {
  return sincronizarSchemaEmpresa(garantirBancoDeTeste(), SCHEMA_TESTE, { dedicado: true });
}

/** Default SQL atual de uma coluna, direto do catálogo do Postgres. */
async function defaultDaColuna(tabela: string, coluna: string): Promise<string | null> {
  const r = await pg.query<{ column_default: string | null }>(
    `SELECT column_default FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
    [SCHEMA_TESTE, tabela, coluna]
  );
  return r.rows[0]?.column_default ?? null;
}

async function colunaEhNotNull(tabela: string, coluna: string): Promise<boolean> {
  const r = await pg.query<{ is_nullable: string }>(
    `SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
    [SCHEMA_TESTE, tabela, coluna]
  );
  return r.rows[0]?.is_nullable === "NO";
}

async function indiceExiste(nome: string): Promise<boolean> {
  const r = await pg.query(`SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = $2`, [
    SCHEMA_TESTE,
    nome,
  ]);
  return r.rowCount! > 0;
}

async function inserirCategoria(id: string, nome: string) {
  await pg.query(
    `INSERT INTO "${SCHEMA_TESTE}"."Categoria" ("id","empresaId","nome","ordem","ativo") VALUES ($1,$2,$3,0,true)`,
    [id, EMPRESA_FICTICIA, nome]
  );
}

async function inserirProduto(id: string, nome: string, categoriaId: string) {
  await pg.query(
    `INSERT INTO "${SCHEMA_TESTE}"."Produto"
       ("id","empresaId","nome","descricao","preco","categoriaId","emoji","destaque","ativo","ncm","cest","csosn","cfop","unidade")
     VALUES ($1,$2,$3,'descrição real',10,$4,'🍕',false,true,'','','102','5102','UN')`,
    [id, EMPRESA_FICTICIA, nome, categoriaId]
  );
}

beforeAll(async () => {
  pg = await clientePg();
  await recriarSchema();
});

afterEach(async () => {
  await recriarSchema();
});

afterAll(async () => {
  await pg.query(`DROP SCHEMA IF EXISTS "${SCHEMA_TESTE}" CASCADE`);
  await pg.end();
});

describe("Item 3 — nunca inventar DEFAULT (em especial o '')", () => {
  it("coluna OBRIGATÓRIA sem @default, numa tabela COM LINHAS, vira pendência — e nenhuma linha recebe ''", async () => {
    // Simula um tenant antigo: a coluna `Produto.descricao` (String
    // obrigatória, SEM @default no schema.prisma) ainda não existe lá, e a
    // tabela já tem produtos cadastrados.
    await inserirCategoria("cat-1", "Pizzas");
    await inserirProduto("prod-1", "Calabresa", "cat-1");
    await pg.query(`ALTER TABLE "${SCHEMA_TESTE}"."Produto" DROP COLUMN "descricao"`);

    const resultado = await sincronizar();

    // A coluna foi criada — mas NULLABLE e SEM default.
    expect(await defaultDaColuna("Produto", "descricao")).toBeNull();
    expect(await colunaEhNotNull("Produto", "descricao")).toBe(false);

    // A linha existente ficou com NULL ("não sei"), nunca com '' (que
    // seria indistinguível de uma descrição realmente vazia).
    const linhas = await pg.query<{ descricao: string | null }>(
      `SELECT "descricao" FROM "${SCHEMA_TESTE}"."Produto" WHERE id = 'prod-1'`
    );
    expect(linhas.rows[0].descricao).toBeNull();

    // E a pendência foi reportada, com diagnóstico e reparo prontos.
    const pendencia = resultado.pendencias.find(
      (p) => p.tipo === "coluna_obrigatoria_sem_default" && p.tabela === "Produto"
    );
    expect(pendencia, "faltou a pendência de coluna obrigatória sem default").toBeDefined();
    expect(pendencia!.colunas).toEqual(["descricao"]);
    expect(pendencia!.sqlDiagnostico).toContain("IS NULL");
    expect(pendencia!.sqlReparo.join("\n")).toContain("SET NOT NULL");
  });

  it("a MESMA coluna, numa tabela VAZIA, entra como NOT NULL de verdade — sem pendência e sem default", async () => {
    await pg.query(`ALTER TABLE "${SCHEMA_TESTE}"."Produto" DROP COLUMN "descricao"`);

    const resultado = await sincronizar();

    expect(await colunaEhNotNull("Produto", "descricao")).toBe(true);
    expect(await defaultDaColuna("Produto", "descricao")).toBeNull();
    expect(resultado.pendencias.filter((p) => p.tabela === "Produto" && p.colunas.includes("descricao"))).toEqual([]);
  });

  it("coluna obrigatória COM @default declarado usa o default do schema (não um inventado)", async () => {
    // `Produto.csosn` é obrigatória e declara `@default("102")`.
    await inserirCategoria("cat-1", "Pizzas");
    await inserirProduto("prod-1", "Calabresa", "cat-1");
    await pg.query(`ALTER TABLE "${SCHEMA_TESTE}"."Produto" DROP COLUMN "csosn"`);

    const resultado = await sincronizar();

    expect(await defaultDaColuna("Produto", "csosn")).toContain("'102'");
    expect(await colunaEhNotNull("Produto", "csosn")).toBe(true);
    const linhas = await pg.query<{ csosn: string }>(
      `SELECT "csosn" FROM "${SCHEMA_TESTE}"."Produto" WHERE id = 'prod-1'`
    );
    // A linha existente foi preenchida com o valor que o TIME escolheu.
    expect(linhas.rows[0].csosn).toBe("102");
    expect(resultado.pendencias.filter((p) => p.colunas.includes("csosn"))).toEqual([]);
  });

  it("DEFAULT '' HERDADO (sem respaldo no schema.prisma) é DETECTADO e vira pendência", async () => {
    // Simula o resíduo deixado pela versão antiga do sincronizador, que
    // inventava `DEFAULT ''` para toda coluna de texto.
    await pg.query(`ALTER TABLE "${SCHEMA_TESTE}"."Produto" ALTER COLUMN "descricao" SET DEFAULT ''`);
    await inserirCategoria("cat-1", "Pizzas");
    await pg.query(
      `INSERT INTO "${SCHEMA_TESTE}"."Produto"
         ("id","empresaId","nome","preco","categoriaId","emoji","destaque","ativo","ncm","cest","csosn","cfop","unidade")
       VALUES ('prod-vazio',$1,'Sem descrição',10,'cat-1','🍕',false,true,'','','102','5102','UN')`,
      [EMPRESA_FICTICIA]
    );

    const resultado = await sincronizar();

    const pendencia = resultado.pendencias.find(
      (p) => p.tipo === "default_vazio_herdado" && p.tabela === "Produto" && p.colunas.includes("descricao")
    );
    expect(pendencia, "o DEFAULT '' herdado não foi detectado").toBeDefined();
    expect(pendencia!.sqlReparo.join("\n")).toContain("DROP DEFAULT");

    // NÃO foi removido automaticamente — a decisão fica com o operador
    // (pode haver código legado inserindo sem a coluna).
    expect(await defaultDaColuna("Produto", "descricao")).toContain("''");

    // E o diagnóstico realmente encontra a linha que ficou com ''.
    const diag = await pg.query<{ linhas_com_string_vazia: string }>(pendencia!.sqlDiagnostico!);
    expect(Number(diag.rows[0].linhas_com_string_vazia)).toBe(1);
  });

  it("DEFAULT '' DECLARADO no schema.prisma é aviso, não pendência (decisão deliberada do time)", async () => {
    // `Produto.ncm` e `Produto.cest` declaram `@default("")` de propósito
    // (campos fiscais opcionais). Não podem ser tratados como resíduo.
    const resultado = await sincronizar();

    expect(resultado.pendencias.filter((p) => p.colunas.includes("ncm") || p.colunas.includes("cest"))).toEqual([]);
    const avisos = resultado.avisos.filter((a) => a.coluna === "ncm" || a.coluna === "cest");
    expect(avisos.length).toBeGreaterThan(0);
    expect(avisos[0].mensagem).toContain("declarado no schema.prisma");
  });

  it("nenhuma coluna de um schema provisionado do ZERO recebe DEFAULT '' inventado", async () => {
    // Varredura ampla: qualquer `DEFAULT ''` no schema novo tem de estar
    // declarado no schema.prisma (hoje: só Produto.ncm e Produto.cest).
    const r = await pg.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = $1 AND column_default LIKE '''''%'`,
      [SCHEMA_TESTE]
    );
    const inesperadas = r.rows.filter(
      (c) => !(c.table_name === "Produto" && (c.column_name === "ncm" || c.column_name === "cest"))
    );
    expect(inesperadas, "há DEFAULT '' que não está declarado no schema.prisma").toEqual([]);
  });
});

describe("Item 4 — UNIQUE incremental: schema.prisma × PostgreSQL", () => {
  it("cria o índice único que falta quando os dados NÃO violam a regra", async () => {
    const indice = "Categoria_empresaId_nome_key";
    // Simula um tenant provisionado antes do `@@unique([empresaId, nome])`.
    await pg.query(`ALTER TABLE "${SCHEMA_TESTE}"."Categoria" DROP CONSTRAINT IF EXISTS "${indice}"`);
    await pg.query(`DROP INDEX IF EXISTS "${SCHEMA_TESTE}"."${indice}"`);
    expect(await indiceExiste(indice)).toBe(false);

    await inserirCategoria("cat-1", "Pizzas");
    await inserirCategoria("cat-2", "Bebidas");

    const resultado = await sincronizar();

    expect(await indiceExiste(indice)).toBe(true);
    const criado = resultado.unicosCriados.find((u) => u.indice === indice);
    expect(criado, "o índice criado não foi reportado").toBeDefined();
    expect(criado!.colunas.sort()).toEqual(["empresaId", "nome"]);
    expect(resultado.pendencias.filter((p) => p.tabela === "Categoria")).toEqual([]);
  });

  it("NUNCA cria o índice único quando os dados existentes já o violam — e não apaga nada", async () => {
    const indice = "Categoria_empresaId_nome_key";
    await pg.query(`ALTER TABLE "${SCHEMA_TESTE}"."Categoria" DROP CONSTRAINT IF EXISTS "${indice}"`);
    await pg.query(`DROP INDEX IF EXISTS "${SCHEMA_TESTE}"."${indice}"`);

    // Duas categorias com o MESMO nome na mesma empresa: exatamente o
    // que o índice proibiria.
    await inserirCategoria("cat-1", "Pizzas");
    await inserirCategoria("cat-2", "Pizzas");

    const resultado = await sincronizar();

    // O índice NÃO foi criado.
    expect(await indiceExiste(indice)).toBe(false);
    expect(resultado.unicosCriados.find((u) => u.indice === indice)).toBeUndefined();

    // A pendência foi reportada, com o SQL que mostra o problema e o que
    // aplica a correção depois.
    const pendencia = resultado.pendencias.find(
      (p) => p.tipo === "unique_com_duplicatas" && p.tabela === "Categoria"
    );
    expect(pendencia, "faltou a pendência de UNIQUE com duplicatas").toBeDefined();
    expect(pendencia!.colunas.sort()).toEqual(["empresaId", "nome"]);
    expect(pendencia!.sqlReparo.join("\n")).toContain("CREATE UNIQUE INDEX");

    // NENHUMA das duas linhas foi apagada ou alterada para "resolver" o
    // conflito — decidir qual é a certa é do operador.
    const linhas = await pg.query(`SELECT id FROM "${SCHEMA_TESTE}"."Categoria" ORDER BY id`);
    expect(linhas.rows.map((l) => l.id)).toEqual(["cat-1", "cat-2"]);

    // O diagnóstico realmente aponta o grupo duplicado.
    const diag = await pg.query(pendencia!.sqlDiagnostico!);
    expect(diag.rowCount).toBe(1);
  });

  it("depois que o operador resolve a duplicata, a sincronização seguinte cria o índice", async () => {
    const indice = "Categoria_empresaId_nome_key";
    await pg.query(`ALTER TABLE "${SCHEMA_TESTE}"."Categoria" DROP CONSTRAINT IF EXISTS "${indice}"`);
    await pg.query(`DROP INDEX IF EXISTS "${SCHEMA_TESTE}"."${indice}"`);
    await inserirCategoria("cat-1", "Pizzas");
    await inserirCategoria("cat-2", "Pizzas");

    const bloqueada = await sincronizar();
    expect(bloqueada.pendencias.some((p) => p.tipo === "unique_com_duplicatas")).toBe(true);
    expect(await indiceExiste(indice)).toBe(false);

    // Operador corrige o dado (renomeia a duplicata) e roda de novo.
    await pg.query(`UPDATE "${SCHEMA_TESTE}"."Categoria" SET "nome" = 'Bebidas' WHERE id = 'cat-2'`);
    const liberada = await sincronizar();

    expect(await indiceExiste(indice)).toBe(true);
    expect(liberada.pendencias.filter((p) => p.tabela === "Categoria")).toEqual([]);
  });

  it("o índice criado é REAL: o banco passa a recusar a duplicata", async () => {
    const indice = "Categoria_empresaId_nome_key";
    await pg.query(`ALTER TABLE "${SCHEMA_TESTE}"."Categoria" DROP CONSTRAINT IF EXISTS "${indice}"`);
    await pg.query(`DROP INDEX IF EXISTS "${SCHEMA_TESTE}"."${indice}"`);
    await inserirCategoria("cat-1", "Pizzas");

    await sincronizar();

    await expect(inserirCategoria("cat-2", "Pizzas")).rejects.toThrow(/duplicate key|unique/i);
    // Empresas diferentes com o mesmo nome continuam permitidas.
    await pg.query(
      `INSERT INTO "${SCHEMA_TESTE}"."Categoria" ("id","empresaId","nome","ordem","ativo") VALUES ('cat-3','outra-empresa','Pizzas',0,true)`
    );
  });

  it("linhas com NULL não contam como duplicata (NULLs são distintos no Postgres)", async () => {
    // `Pedido.idempotencyKey` é nullable e único por empresa. Vários
    // pedidos SEM chave não podem impedir a criação do índice.
    const indice = "Pedido_empresaId_idempotencyKey_key";
    await pg.query(`ALTER TABLE "${SCHEMA_TESTE}"."Pedido" DROP CONSTRAINT IF EXISTS "${indice}"`);
    await pg.query(`DROP INDEX IF EXISTS "${SCHEMA_TESTE}"."${indice}"`);
    for (const id of ["p1", "p2", "p3"]) {
      await pg.query(
        `INSERT INTO "${SCHEMA_TESTE}"."Pedido"
           ("id","empresaId","numero","canal","status","producao","recebidoEm","taxaEntrega","trocoPara","total","criadoEm","atualizadoEm")
         VALUES ($1,$2,$3,'balcao','andamento','recebido',now(),0,0,10,now(),now())`,
        [id, EMPRESA_FICTICIA, Number(id.slice(1))]
      );
    }

    const resultado = await sincronizar();

    expect(await indiceExiste(indice)).toBe(true);
    expect(resultado.pendencias.filter((p) => p.colunas.includes("idempotencyKey"))).toEqual([]);
  });

  it("índices únicos que JÁ existem não são recriados nem reportados como novos", async () => {
    const primeira = await sincronizar();
    const segunda = await sincronizar();
    // A primeira execução num schema recém-provisionado já encontra tudo
    // no lugar; a segunda tem de ser um no-op perfeito (idempotência).
    expect(primeira.unicosCriados).toEqual([]);
    expect(segunda.unicosCriados).toEqual([]);
    expect(segunda.tabelasCriadas).toEqual([]);
    expect(segunda.colunasAdicionadas).toEqual([]);
  });
});

describe("Item 4 — índice único PARCIAL 'um caixa aberto por empresa'", () => {
  it("é criado quando não há mais de um caixa aberto", async () => {
    await pg.query(`DROP INDEX IF EXISTS "${SCHEMA_TESTE}"."${INDICE_CAIXA_ABERTO_UNICO}"`);
    await pg.query(
      `INSERT INTO "${SCHEMA_TESTE}"."Caixa" ("id","empresaId","abertoEm","saldoInicial","status")
       VALUES ('cx-1',$1,now(),0,'aberto')`,
      [EMPRESA_FICTICIA]
    );

    const resultado = await sincronizar();

    expect(await indiceExiste(INDICE_CAIXA_ABERTO_UNICO)).toBe(true);
    expect(resultado.unicosCriados.some((u) => u.indice === INDICE_CAIXA_ABERTO_UNICO)).toBe(true);
  });

  it("NÃO é criado (e vira pendência) quando a empresa já tem dois caixas abertos", async () => {
    await pg.query(`DROP INDEX IF EXISTS "${SCHEMA_TESTE}"."${INDICE_CAIXA_ABERTO_UNICO}"`);
    for (const id of ["cx-1", "cx-2"]) {
      await pg.query(
        `INSERT INTO "${SCHEMA_TESTE}"."Caixa" ("id","empresaId","abertoEm","saldoInicial","status")
         VALUES ($1,$2,now(),0,'aberto')`,
        [id, EMPRESA_FICTICIA]
      );
    }

    const resultado = await sincronizar();

    expect(await indiceExiste(INDICE_CAIXA_ABERTO_UNICO)).toBe(false);
    const pendencia = resultado.pendencias.find((p) => p.tabela === "Caixa");
    expect(pendencia, "faltou a pendência dos caixas abertos duplicados").toBeDefined();
    expect(pendencia!.motivo).toContain("MAIS DE UM caixa");

    // Nenhum caixa foi fechado automaticamente — fechar sem conferir os
    // valores seria perder a conferência do dia.
    const abertos = await pg.query(`SELECT id FROM "${SCHEMA_TESTE}"."Caixa" WHERE status = 'aberto'`);
    expect(abertos.rowCount).toBe(2);
  });
});

describe("Sincronização é não destrutiva", () => {
  it("não apaga tabela, coluna nem linha existente", async () => {
    await inserirCategoria("cat-1", "Pizzas");
    await inserirProduto("prod-1", "Calabresa", "cat-1");

    const tabelasAntes = await pg.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
      [SCHEMA_TESTE]
    );
    // Coluna que NÃO existe no schema.prisma — o sincronizador não pode
    // removê-la (pode ser de uma customização ou de uma versão futura).
    await pg.query(`ALTER TABLE "${SCHEMA_TESTE}"."Categoria" ADD COLUMN "coluna_legada" TEXT`);

    await sincronizar();

    const tabelasDepois = await pg.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
      [SCHEMA_TESTE]
    );
    expect(tabelasDepois.rows.map((t) => t.table_name)).toEqual(tabelasAntes.rows.map((t) => t.table_name));

    const legada = await pg.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'Categoria' AND column_name = 'coluna_legada'`,
      [SCHEMA_TESTE]
    );
    expect(legada.rowCount).toBe(1);

    const produtos = await pg.query(`SELECT id FROM "${SCHEMA_TESTE}"."Produto"`);
    expect(produtos.rows.map((p) => p.id)).toEqual(["prod-1"]);
  });
});
