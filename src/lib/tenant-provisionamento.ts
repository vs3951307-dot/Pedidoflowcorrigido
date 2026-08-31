/**
 * Provisiona o schema PostgreSQL dedicado de UMA empresa (PEDIDO:
 * "isolamento estrutural entre os ambientes", "database per tenant").
 *
 * O QUE ESTE SCRIPT FAZ:
 *   1. Lê `prisma/schema.prisma` e identifica os models de TENANT (todo
 *      model que NÃO está na lista de plataforma — ver
 *      `src/lib/prisma.ts`, `DELEGATES_PLATAFORMA`).
 *   2. Gera o DDL (CREATE TABLE + índices + chaves únicas + chaves
 *      estrangeiras) só para esses models.
 *   3. Cria o schema (`CREATE SCHEMA IF NOT EXISTS tenant_xxx`) e aplica
 *      o DDL dentro dele.
 *
 * QUANDO É CHAMADO: pelo `POST /api/superadmin/empresas` (criação de uma
 * nova empresa) e por `npm run db:seed` (empresa de demonstração).
 *
 * IMPORTANTE — LIMITAÇÃO CONHECIDA E DELIBERADA: os valores de
 * `@default(cuid())`, `@default(now())` e `@updatedAt` são gerados pelo
 * PRISMA CLIENT em tempo de execução (não são defaults do banco) — por
 * isso este gerador NÃO precisa replicá-los em SQL. A única exceção é
 * `@default(autoincrement())` (usado em `Mesa.id`), que precisa mesmo
 * ser uma identidade gerada pelo banco — tratado explicitamente abaixo.
 *
 * AVISO DE VALIDAÇÃO: este script foi escrito e revisado com cuidado,
 * mas não pôde ser executado contra um PostgreSQL real no ambiente em
 * que foi criado (sem acesso à internet/banco). Rode primeiro contra um
 * banco de homologação e compare o resultado com
 * `npx prisma migrate diff` antes de usar em produção.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const SCHEMA_PATH = join(process.cwd(), "prisma/schema.prisma");

/**
 * Cliente `pg` usado no provisionamento/sincronização de schemas.
 *
 * O Supabase usa certificado TLS self-signed na conexão direta
 * (`db.<ref>.supabase.co`). No `pg` 8.x, `sslmode=require` é tratado como
 * verify-full (o `pg-connection-string` v3 devolve `ssl: {}`, deixando
 * `rejectUnauthorized` no default true) e o handshake falha com
 * "self-signed certificate in certificate chain", derrubando a criação de
 * novas empresas (erro 500). Como o `pg` sobrescreve o `ssl` do config com
 * o da URL (`Object.assign` em ConnectionParameters), o ajuste é feito na
 * PRÓPRIA URL: qualquer `sslmode` que exija verificação
 * (require/verify-full/verify-ca/prefer) vira `no-verify`. URLs sem
 * `sslmode` para hosts remotos recebem `sslmode=no-verify`. Conexões locais
 * sem `sslmode` (Docker em localhost) permanecem sem TLS, como antes.
 */
function novoClientProvisionamento(databaseUrl: string): Client {
  let url = databaseUrl;
  const sslMode = /(?:^|&)sslmode=([a-z-]+)/i.exec(url)?.[1];
  if (sslMode && sslMode !== "disable" && sslMode !== "no-verify") {
    url = url.replace(/(sslmode=)[a-z-]+/i, "sslmode=no-verify");
  } else if (!sslMode) {
    const host = /@([^:/?#]+)/i.exec(url)?.[1];
    if (host && host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
      url += (url.includes("?") ? "&" : "?") + "sslmode=no-verify";
    }
  }
  return new Client({ connectionString: url });
}

// (arquivo movido para src/lib — chamado tanto pela rota de criação de
// empresa quanto pelo CLI em scripts/provisionar-schema-empresa.ts)

// Mesma lista de src/lib/prisma.ts (DELEGATES_PLATAFORMA), mas com o
// nome EXATO do model (PascalCase) como aparece no schema.prisma.
const MODELS_PLATAFORMA = new Set([
  "Empresa",
  "Plano",
  "SuperAdmin",
  "SessaoSuperAdmin",
  "UsoIa",
  "LandingConfig",
  "HistoricoCopiloto",
  "AcaoPendenteCopiloto",
  "Usuario",
  "Sessao",
  "TokenRecuperacao",
  "PermissaoUsuario",
  "Auditoria",
  "AssinaturaPagamento",
]);

interface Campo {
  nome: string;
  tipo: string; // tipo Prisma bruto (String, Int, Float, Boolean, DateTime)
  opcional: boolean;
  lista: boolean;
  autoincrement: boolean;
  isId: boolean;
  // CORREÇÃO (PEDIDO 2): @unique num campo INDIVIDUAL (ex.:
  // `Pagamento.idempotencyKey String? @unique`) — antes só
  // `@@unique([a,b])` composto (linha de modelo, dois+ campos) era
  // detectado. Uma empresa nova nunca recebia a constraint física de
  // campos como `Entrega.codigoQr`/`DocumentoFiscal.pedidoId`.
  unico: boolean;
  padrao?: string; // conteúdo de @default(...), ex.: "true", '"{}"', "now()", "cuid()"
  relacaoCom?: string; // nome do model relacionado, se `@relation`
  relacaoCampoLocal?: string; // valor de `fields: [...]`
  relacaoCampoRemoto?: string; // valor de `references: [...]`
}

interface ModeloParseado {
  nome: string;
  campos: Campo[];
  idComposto?: string[]; // @@id([a, b])
  unicosCompostos: string[][]; // @@unique([a, b])
  indices: string[][]; // @@index([a, b])
}

function tipoSqlDoTipoPrisma(tipo: string): string {
  switch (tipo) {
    case "String":
      return "TEXT";
    case "Int":
      return "INTEGER";
    case "Float":
      return "DOUBLE PRECISION";
    case "Boolean":
      return "BOOLEAN";
    case "DateTime":
      return "TIMESTAMP(3)";
    default:
      // Enum-like ou tipo desconhecido: trata como texto (o projeto não
      // usa enums nativos do Prisma — validação fica na aplicação).
      return "TEXT";
  }
}

/**
 * Extrai o CORPO de um bloco `model Nome { ... }`, respeitando chaves
 * que aparecem DENTRO de strings (ex.: `@default("{}")`). Uma extração
 * ingênua por regex (`\{([^}]*)\}`) para no primeiro `}` — inclusive o
 * que está dentro de uma string como `"{}"` — e trunca o resto do
 * model (bug real encontrado em produção: `ConversaWhatsApp.estado
 * String @default("{}")` cortava todos os campos seguintes). Esta
 * função conta chaves só FORA de strings entre aspas duplas.
 */
function extrairCorpoDoModel(texto: string, indiceAbreChave: number): string {
  let profundidade = 0;
  let dentroDeString = false;
  for (let i = indiceAbreChave; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"' && texto[i - 1] !== "\\") {
      dentroDeString = !dentroDeString;
      continue;
    }
    if (dentroDeString) continue;
    if (c === "{") profundidade++;
    else if (c === "}") {
      profundidade--;
      if (profundidade === 0) {
        return texto.slice(indiceAbreChave + 1, i);
      }
    }
  }
  throw new Error("Chave de fechamento do model não encontrada (schema.prisma malformado?).");
}

function parseSchema(): ModeloParseado[] {
  const conteudo = readFileSync(SCHEMA_PATH, "utf-8");
  const modelos: ModeloParseado[] = [];
  const inicioRegex = /model\s+(\w+)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = inicioRegex.exec(conteudo))) {
    const nome = m[1];
    const indiceAbreChave = m.index + m[0].length - 1; // posição do "{" encontrado
    const corpo = extrairCorpoDoModel(conteudo, indiceAbreChave);
    const linhas = corpo
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("//"));

    const modelo: ModeloParseado = { nome, campos: [], unicosCompostos: [], indices: [] };

    for (const linha of linhas) {
      if (linha.startsWith("@@id(")) {
        const m = linha.match(/@@id\(\[([^\]]+)\]/);
        if (m) modelo.idComposto = m[1].split(",").map((s) => s.trim());
        continue;
      }
      if (linha.startsWith("@@unique(")) {
        const m = linha.match(/@@unique\(\[([^\]]+)\]/);
        if (m) modelo.unicosCompostos.push(m[1].split(",").map((s) => s.trim()));
        continue;
      }
      if (linha.startsWith("@@index(")) {
        const m = linha.match(/@@index\(\[([^\]]+)\]/);
        if (m) modelo.indices.push(m[1].split(",").map((s) => s.trim()));
        continue;
      }
      if (linha.startsWith("@@")) continue; // outras diretivas (ex.: @@map) — ignoradas aqui

      // Campo: "nome Tipo[]? @attrs..."
      const campoMatch = linha.match(/^(\w+)\s+([A-Za-z_][\w]*)(\[\])?(\?)?\s*(.*)$/);
      if (!campoMatch) continue;
      const [, campoNome, tipoBase, isLista, isOpcional, resto] = campoMatch;

      // Ignora campos de relação "reversa" (arrays de outro model sem
      // @relation explícito neste lado) — não geram coluna própria.
      const ehRelacaoExplicita = /@relation\(/.test(resto);
      const ehTipoEscalar = ["String", "Int", "Float", "Boolean", "DateTime"].includes(tipoBase);
      if (!ehTipoEscalar && !ehRelacaoExplicita) continue; // array de relação reversa, ex.: `usuarios Usuario[]`
      if (!ehTipoEscalar && ehRelacaoExplicita) {
        // campo objeto da relação (ex.: `empresa Empresa @relation(...)`) —
        // não vira coluna; o campo *Id correspondente é que vira coluna
        // (já capturado separadamente).
        continue;
      }

      const campo: Campo = {
        nome: campoNome,
        tipo: tipoBase,
        opcional: Boolean(isOpcional),
        lista: Boolean(isLista),
        autoincrement: /@default\(autoincrement\(\)\)/.test(resto),
        isId: /@id\b/.test(resto),
        unico: /@unique\b/.test(resto),
      };
      const defaultMatch = resto.match(/@default\(\s*([^)]*)\)/);
      if (defaultMatch) campo.padrao = defaultMatch[1].trim();
      modelo.campos.push(campo);
    }

    modelos.push(modelo);
  }

  return modelos;
}

/** Gera o DDL de UM model (CREATE TABLE), assumindo nomes de coluna/tabela iguais aos do Prisma. */
function ddlDaTabela(modelo: ModeloParseado, schema: string, incluirFkParaEmpresa: boolean): string {
  const colunas: string[] = [];
  const chavesPrimarias: string[] = [];

  for (const campo of modelo.campos) {
    if (campo.lista) continue; // arrays de relação não viram coluna
    let def = `"${campo.nome}" ${tipoSqlDoTipoPrisma(campo.tipo)}`;
    if (campo.autoincrement) {
      def = `"${campo.nome}" INTEGER GENERATED BY DEFAULT AS IDENTITY`;
    } else {
      // CORREÇÃO (item 3): o `CREATE TABLE` ignorava `@default(...)` por
      // completo — um schema de tenant recém-provisionado saía SEM
      // nenhum default, divergindo do schema `public` (onde as
      // migrations os criam). Na prática o Prisma Client sempre manda o
      // valor, então não aparecia no uso normal; mas qualquer INSERT que
      // omitisse a coluna (SQL manual, importação, script de correção)
      // batia em "null value violates not-null constraint".
      //
      // Só entram defaults DECLARADOS no schema.prisma —
      // `defaultSqlDoCampo` nunca inventa um (era exatamente o `''`
      // automático que a auditoria mandou remover).
      const padrao = defaultSqlDoCampo(campo);
      if (padrao !== null) def += ` DEFAULT ${padrao}`;
    }
    if (!campo.opcional) def += " NOT NULL";
    colunas.push(def);
    if (campo.isId && !modelo.idComposto) chavesPrimarias.push(`"${campo.nome}"`);
  }

  const restricoes: string[] = [];
  if (modelo.idComposto) {
    restricoes.push(`PRIMARY KEY (${modelo.idComposto.map((c) => `"${c}"`).join(", ")})`);
  } else if (chavesPrimarias.length > 0) {
    restricoes.push(`PRIMARY KEY (${chavesPrimarias.join(", ")})`);
  }
  for (const unico of modelo.unicosCompostos) {
    restricoes.push(`UNIQUE (${unico.map((c) => `"${c}"`).join(", ")})`);
  }
  // CORREÇÃO (PEDIDO 2): @unique em campo INDIVIDUAL — antes só
  // @@unique composto virava constraint física. Sem isto, uma empresa
  // nova nunca recebia a unicidade real de campos como
  // `Entrega.codigoQr`, `DocumentoFiscal.pedidoId`,
  // `ConversaWhatsApp.pedidoId`, `Entregador.usuarioId`,
  // `Pagamento.idempotencyKey`. `isId` fica de fora — já é
  // PRIMARY KEY, UNIQUE ali seria redundante.
  for (const campo of modelo.campos) {
    if (campo.unico && !campo.isId && !campo.lista) {
      restricoes.push(`UNIQUE ("${campo.nome}")`);
    }
  }

  // FK para Empresa (defesa em profundidade, além do isolamento por
  // schema) — só faz sentido quando o tenant vive no MESMO servidor
  // Postgres da plataforma (schema dedicado). Bancos totalmente
  // dedicados (outro servidor) não têm a tabela Empresa disponível.
  if (incluirFkParaEmpresa && modelo.campos.some((c) => c.nome === "empresaId")) {
    restricoes.push(`FOREIGN KEY ("empresaId") REFERENCES public."Empresa"("id")`);
  }

  const corpoSql = [...colunas, ...restricoes].join(",\n  ");
  return `CREATE TABLE IF NOT EXISTS "${schema}"."${modelo.nome}" (\n  ${corpoSql}\n);`;
}

function ddlDosIndices(modelo: ModeloParseado, schema: string): string[] {
  return modelo.indices.map((idx, i) => {
    const colunasIdx = idx.map((c) => `"${c}"`).join(", ");
    const nomeIdx = `${modelo.nome}_${idx.join("_")}_idx_${i}`.slice(0, 63);
    return `CREATE INDEX IF NOT EXISTS "${nomeIdx}" ON "${schema}"."${modelo.nome}" (${colunasIdx});`;
  });
}

/**
 * Constraints ESPECIAIS que o DSL do Prisma não consegue expressar (por
 * isso não aparecem em `schema.prisma` como `@@unique`/`@@index` — o
 * parser genérico acima nunca as encontraria sozinho) — PEDIDO 2:
 * "garanta a proteção que impede existir mais de UM caixa aberto
 * simultaneamente". Hardcoded aqui de propósito, espelhando EXATAMENTE
 * a migration `20260806210000_caixa_aberto_unico` (schema `public`,
 * baseline) — se uma dessas mudar, a outra precisa mudar junto.
 */
function ddlDeConstraintsEspeciais(modelo: ModeloParseado, schema: string): string[] {
  if (modelo.nome !== "Caixa") return [];
  return [
    `CREATE UNIQUE INDEX IF NOT EXISTS "${INDICE_CAIXA_ABERTO_UNICO}" ON "${schema}"."Caixa"("empresaId") WHERE status = 'aberto';`,
  ];
}

/** Nome do índice único parcial "no máximo um caixa aberto por empresa". */
export const INDICE_CAIXA_ABERTO_UNICO = "Caixa_empresaId_aberto_unico";

export interface ResultadoProvisionamento {
  schema: string;
  tabelasCriadas: string[];
}

/**
 * Algo que o sincronizador identificou como necessário mas NÃO aplicou
 * sozinho, porque aplicar poderia corromper/perder dado existente
 * (itens 3 e 4 da auditoria: "gerar pendência/SQL de reparo quando não
 * for seguro alterar automaticamente", "nunca aplicar UNIQUE se os dados
 * existentes violarem a regra").
 *
 * Cada pendência traz o SQL PRONTO para o operador: primeiro o de
 * DIAGNÓSTICO (mostra exatamente quais linhas impedem a mudança) e
 * depois o de REPARO (aplica a mudança depois que os dados forem
 * corrigidos). Nada disso roda sozinho.
 */
export interface Pendencia {
  tipo:
    | "coluna_obrigatoria_sem_default"
    | "default_vazio_herdado"
    | "default_divergente"
    | "unique_com_duplicatas"
    | "fk_nao_aplicada";
  schema: string;
  tabela: string;
  colunas: string[];
  /** Explicação em português de por que não foi aplicado automaticamente. */
  motivo: string;
  /** SQL que LISTA as linhas problemáticas (só leitura, sempre seguro). */
  sqlDiagnostico?: string;
  /** SQL que aplica a correção DEPOIS de o operador tratar os dados. */
  sqlReparo: string[];
}

/** Observação informativa — não impede nada, só documenta o estado. */
export interface Aviso {
  schema: string;
  tabela: string;
  coluna: string;
  mensagem: string;
}

export interface ResultadoSincronizacao {
  schema: string;
  tabelasCriadas: string[];
  colunasAdicionadas: { tabela: string; coluna: string }[];
  /** Índices únicos efetivamente criados nesta execução. */
  unicosCriados: { tabela: string; colunas: string[]; indice: string }[];
  pendencias: Pendencia[];
  avisos: Aviso[];
}

/**
 * DEFAULT SQL de uma coluna — item 3 da auditoria.
 *
 * REGRA: só devolve um DEFAULT quando ele está DECLARADO no
 * `schema.prisma`. Nunca inventa um.
 *
 * O QUE FOI REMOVIDO (e por quê): esta função terminava com um
 * "fallback seguro por tipo" que devolvia `''` para TEXT, `0` para
 * números, `false` para booleanos e `now()` para datas quando o campo
 * NÃO declarava `@default`. Consequência real: toda coluna obrigatória
 * nova de texto (um CNPJ, um código fiscal, um endereço) nascia em TODAS
 * as empresas já existentes com `DEFAULT ''` — string vazia gravada como
 * se fosse um valor legítimo, indistinguível de um dado real preenchido
 * errado. Pior: o DEFAULT ficava colado na tabela para sempre, então
 * todo INSERT posterior que omitisse a coluna também gravava `''`.
 *
 * Como ficou: sem `@default` no schema, a função devolve `null` e quem
 * chama decide — se a tabela estiver VAZIA, a coluna entra como
 * `NOT NULL` de verdade; se tiver linhas, entra NULLABLE e vira
 * PENDÊNCIA com o SQL de reparo, para um humano escolher o valor certo.
 *
 * Defaults gerados pelo Prisma Client em runtime (`cuid()`,
 * `autoincrement()`) continuam fora do banco de propósito.
 */
function defaultSqlDoCampo(campo: Campo): string | null {
  if (campo.autoincrement || (campo.isId && campo.padrao === "cuid()")) return null;
  const p = campo.padrao?.trim();
  if (!p) return null; // sem @default declarado → NUNCA inventar um
  if (p === "cuid()" || p === "uuid()" || p === "autoincrement()") return null; // gerados pelo client
  if (p === "now()") return "now()";
  if (/^(true|false)$/.test(p)) return p;
  if (/^[+-]?\d+(\.\d+)?$/.test(p)) return p;
  if (p.startsWith('"')) {
    const conteudo = p.slice(1, -1).replace(/'/g, "''");
    return `'${conteudo}'`;
  }
  if (p.startsWith("dbgenerated(")) {
    const interno = p.slice("dbgenerated(".length, -1).trim();
    if (interno.startsWith('"') || interno.startsWith("'")) return interno.slice(1, -1);
    return interno;
  }
  // `@default(...)` de forma não representável (ex.: enum do Prisma) —
  // melhor não traduzir errado do que gravar um valor inventado.
  return null;
}

/** `true` quando o `@default` declarado no schema é a string vazia. */
function defaultDeclaradoEhVazio(campo: Campo): boolean {
  const p = campo.padrao?.trim();
  return p === '""' || p === "''";
}

/**
 * `true` quando o `column_default` lido do PostgreSQL é a string vazia
 * (o Postgres devolve com o cast explícito, ex.: `''::text`).
 */
function defaultDoBancoEhVazio(colunaDefault: string | null): boolean {
  if (!colunaDefault) return false;
  return /^''(::(text|character varying|bpchar|varchar))?$/i.test(colunaDefault.trim());
}

/** Nome do índice único no padrão do Prisma: `Tabela_col1_col2_key`. */
function nomeIndiceUnico(tabela: string, colunas: string[]): string {
  return `${tabela}_${colunas.join("_")}_key`.slice(0, 63);
}

/** Uniques que o `schema.prisma` exige para um model (campo a campo + compostos). */
function unicosDesejadosDoModelo(modelo: ModeloParseado): string[][] {
  const desejados: string[][] = [];
  for (const campo of modelo.campos) {
    // `isId` já é PRIMARY KEY — um UNIQUE ali seria redundante.
    if (campo.unico && !campo.isId && !campo.lista) desejados.push([campo.nome]);
  }
  for (const composto of modelo.unicosCompostos) desejados.push([...composto]);
  return desejados;
}

/**
 * Índices ÚNICOS que já existem fisicamente numa tabela do PostgreSQL,
 * como listas de colunas. Inclui os criados por `UNIQUE (...)` inline no
 * `CREATE TABLE` (o Postgres materializa constraint única como índice
 * único), por isso ler `pg_index` cobre os dois casos.
 *
 * Índices PARCIAIS (com `WHERE`) são devolvidos à parte: um único
 * parcial não satisfaz um `@unique` global do Prisma, então tratá-lo
 * como equivalente faria o sincronizador achar que a proteção existe
 * quando ela só vale para um subconjunto das linhas.
 */
async function unicosExistentes(
  cliente: Client,
  schema: string,
  tabela: string
): Promise<{ totais: string[][]; parciais: string[] }> {
  const r = await cliente.query<{ nome: string; colunas: string[]; parcial: boolean }>(
    // `a.attname` é do tipo `name`; sem o `::text` o `array_agg` devolve
    // `name[]`, um tipo de array que o driver `pg` NÃO converte para
    // array JS — chegaria aqui como a string "{empresaId,email}". A
    // comparação com a lista de colunas do Prisma nunca casaria e TODO
    // índice único seria considerado inexistente (recriado a cada
    // sincronização e reportado como novo). `::text` devolve `text[]`,
    // que o driver converte corretamente.
    `SELECT i.relname AS nome,
            array_agg(a.attname::text ORDER BY k.ord) AS colunas,
            (ix.indpred IS NOT NULL) AS parcial
       FROM pg_index ix
       JOIN pg_class i  ON i.oid = ix.indexrelid
       JOIN pg_class t  ON t.oid = ix.indrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord) ON TRUE
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      WHERE ix.indisunique AND n.nspname = $1 AND t.relname = $2
      GROUP BY i.relname, ix.indpred`,
    [schema, tabela]
  );
  return {
    totais: r.rows.filter((x) => !x.parcial).map((x) => x.colunas),
    parciais: r.rows.filter((x) => x.parcial).map((x) => x.nome),
  };
}

/** Compara conjuntos de colunas ignorando a ordem (semântica de unicidade). */
function mesmasColunas(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const ordA = [...a].sort();
  const ordB = [...b].sort();
  return ordA.every((c, i) => c === ordB[i]);
}

/**
 * Linhas que VIOLARIAM um índice único ainda inexistente — item 4
 * ("verificar duplicatas antes de criar índice/constraint", "nunca
 * aplicar UNIQUE se os dados existentes violarem a regra").
 *
 * Linhas com NULL em qualquer das colunas são EXCLUÍDAS da contagem: no
 * PostgreSQL, `NULL`s são distintos entre si num índice único (o padrão
 * é NULLS DISTINCT), então elas nunca conflitam e incluí-las produziria
 * um falso positivo que bloquearia um índice perfeitamente aplicável.
 */
function sqlDeDuplicatas(schema: string, tabela: string, colunas: string[]): string {
  const lista = colunas.map((c) => `"${c}"`).join(", ");
  const naoNulos = colunas.map((c) => `"${c}" IS NOT NULL`).join(" AND ");
  return (
    `SELECT ${lista}, count(*) AS repeticoes\n` +
    `  FROM "${schema}"."${tabela}"\n` +
    ` WHERE ${naoNulos}\n` +
    ` GROUP BY ${lista}\n` +
    `HAVING count(*) > 1`
  );
}

/**
 * Cria o índice único se — e SOMENTE se — os dados atuais o permitirem.
 * Devolve `null` quando criou, ou a `Pendencia` quando havia duplicatas
 * (nesse caso NADA é executado contra a tabela além do SELECT de
 * diagnóstico, que é leitura pura).
 */
async function criarUnicoSeSeguro(
  cliente: Client,
  schema: string,
  tabela: string,
  colunas: string[]
): Promise<{ criado: string } | { pendencia: Pendencia }> {
  const consultaDuplicatas = sqlDeDuplicatas(schema, tabela, colunas);
  const duplicatas = await cliente.query(`${consultaDuplicatas} LIMIT 20`);
  const indice = nomeIndiceUnico(tabela, colunas);
  const ddl =
    `CREATE UNIQUE INDEX IF NOT EXISTS "${indice}" ` +
    `ON "${schema}"."${tabela}" (${colunas.map((c) => `"${c}"`).join(", ")});`;

  if (duplicatas.rows.length > 0) {
    const exemplo = duplicatas.rows
      .slice(0, 3)
      .map((linha) => JSON.stringify(linha))
      .join(" | ");
    return {
      pendencia: {
        tipo: "unique_com_duplicatas",
        schema,
        tabela,
        colunas,
        motivo:
          `O schema.prisma exige UNIQUE(${colunas.join(", ")}) em "${tabela}", mas os dados atuais ` +
          `já violam essa regra (${duplicatas.rows.length}+ grupo(s) repetido(s); exemplos: ${exemplo}). ` +
          `O índice NÃO foi criado — criá-lo agora falharia, e "resolver" apagando/alterando linhas ` +
          `seria decidir por você qual registro é o certo. Trate os duplicados e rode a sincronização de novo.`,
        sqlDiagnostico: consultaDuplicatas + ";",
        sqlReparo: [ddl],
      },
    };
  }

  await cliente.query(ddl);
  return { criado: indice };
}

/**
 * Sincroniza o schema de uma empresa JÁ EXISTENTE com o `schema.prisma`
 * atual, SEM APAGAR NADA (PEDIDO: "correção dos bancos/tenants já
 * existentes sem depender de recriá-los"):
 *
 * - Tabela de model novo → cria a tabela (`CREATE TABLE IF NOT EXISTS`).
 * - Coluna nova num model já existente → `ALTER TABLE ... ADD COLUMN`,
 *   respeitando o `@default` DECLARADO no schema (nunca um inventado —
 *   ver `defaultSqlDoCampo`, item 3 da auditoria).
 * - Índices e chaves ÚNICAS que faltam → criados só depois de VERIFICAR
 *   que os dados existentes não violam a regra (item 4).
 * - Nunca remove tabela/coluna, nunca trunca dado, nunca apaga linha
 *   duplicada por conta própria.
 *
 * Tudo que não deu para aplicar com segurança sai em `pendencias`, com o
 * SQL de diagnóstico e o de reparo prontos para revisão humana.
 *
 * Chamada por `scripts/sincronizar-schemas-tenants.ts` (todas as
 * empresas) e pode ser chamada para uma empresa específica.
 */
export async function sincronizarSchemaEmpresa(
  databaseUrl: string,
  schema: string,
  opcoes: { dedicado?: boolean } = {}
): Promise<ResultadoSincronizacao> {
  const modelos = parseSchema().filter((m) => !MODELS_PLATAFORMA.has(m.nome));
  const cliente = novoClientProvisionamento(databaseUrl);
  await cliente.connect();
  const tabelasCriadas: string[] = [];
  const colunasAdicionadas: { tabela: string; coluna: string }[] = [];
  const unicosCriados: { tabela: string; colunas: string[]; indice: string }[] = [];
  const pendencias: Pendencia[] = [];
  const avisos: Aviso[] = [];

  try {
    await cliente.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);

    const tabelasExistentes = await cliente.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
      [schema]
    );
    const nomesExistentes = new Set(tabelasExistentes.rows.map((r) => r.table_name));

    for (const modelo of modelos) {
      if (!nomesExistentes.has(modelo.nome)) {
        // Model novo — nunca existiu nesta empresa: cria do zero. Tabela
        // recém-criada está vazia, então as colunas obrigatórias entram
        // como NOT NULL de verdade (sem default inventado) e os UNIQUEs
        // inline não têm como violar nada.
        try {
          await cliente.query(ddlDaTabela(modelo, schema, !opcoes.dedicado));
          tabelasCriadas.push(modelo.nome);
        } catch (erro) {
          const mensagem = erro instanceof Error ? erro.message : String(erro);
          throw new Error(`Falha ao criar a tabela "${modelo.nome}" no schema "${schema}": ${mensagem}`);
        }
        continue;
      }

      // ---------------------------------------------------------------
      // Model já existe: colunas que faltam + auditoria dos defaults
      // herdados das colunas que já estão lá (item 3).
      // ---------------------------------------------------------------
      const colunasExistentes = await cliente.query<{ column_name: string; column_default: string | null }>(
        `SELECT column_name, column_default FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2`,
        [schema, modelo.nome]
      );
      const nomesColunas = new Set(colunasExistentes.rows.map((r) => r.column_name));
      const defaultDoBancoPorColuna = new Map(
        colunasExistentes.rows.map((r) => [r.column_name, r.column_default])
      );

      // A tabela está vazia? Só nesse caso é seguro adicionar uma coluna
      // obrigatória SEM default: não existe linha para ficar com valor
      // inventado. Conta com LIMIT 1 (não `count(*)`) para não varrer
      // tabelas grandes.
      const temLinhas =
        (await cliente.query(`SELECT 1 FROM "${schema}"."${modelo.nome}" LIMIT 1`)).rowCount! > 0;

      // --- Defaults ANTIGOS HERDADOS (colunas que já existem) ---------
      for (const campo of modelo.campos) {
        if (campo.lista || !nomesColunas.has(campo.nome)) continue;
        const defaultBanco = defaultDoBancoPorColuna.get(campo.nome) ?? null;
        const defaultEsperado = defaultSqlDoCampo(campo);

        if (defaultDoBancoEhVazio(defaultBanco)) {
          if (defaultDeclaradoEhVazio(campo)) {
            // O `@default("")` está no schema.prisma — é decisão
            // deliberada do time (ex.: campos fiscais opcionais do
            // Produto). Fica registrado, mas não é pendência.
            avisos.push({
              schema,
              tabela: modelo.nome,
              coluna: campo.nome,
              mensagem:
                `DEFAULT '' existe no banco E está declarado no schema.prisma — mantido de propósito. ` +
                `Vale revisar se string vazia é mesmo um valor válido para este campo.`,
            });
          } else {
            // DEFAULT '' no banco SEM respaldo no schema: resíduo das
            // versões antigas deste sincronizador, que inventava `''`
            // para toda coluna de texto. Continua gravando string vazia
            // em todo INSERT que omitir a coluna.
            pendencias.push({
              tipo: "default_vazio_herdado",
              schema,
              tabela: modelo.nome,
              colunas: [campo.nome],
              motivo:
                `"${modelo.nome}"."${campo.nome}" tem DEFAULT '' no PostgreSQL, mas o schema.prisma NÃO ` +
                `declara default para este campo. É resíduo da versão antiga deste sincronizador (que ` +
                `inventava '' para toda coluna de texto): todo INSERT que omitir a coluna continua gravando ` +
                `string vazia como se fosse dado real. O DROP DEFAULT não é aplicado automaticamente porque ` +
                `pode haver código legado inserindo sem a coluna — remova o default e confira as linhas que ` +
                `já ficaram com ''.`,
              sqlDiagnostico:
                `SELECT count(*) AS linhas_com_string_vazia FROM "${schema}"."${modelo.nome}" ` +
                `WHERE "${campo.nome}" = '';`,
              sqlReparo: [
                `ALTER TABLE "${schema}"."${modelo.nome}" ALTER COLUMN "${campo.nome}" DROP DEFAULT;`,
              ],
            });
          }
          continue;
        }

        // Divergência entre o default do banco e o declarado no schema —
        // não é apagado nem sobrescrito automaticamente (mudar default de
        // coluna em produção altera o comportamento de inserts em curso).
        if (
          defaultEsperado !== null &&
          defaultBanco !== null &&
          !defaultBanco.startsWith(defaultEsperado) &&
          !campo.isId &&
          !campo.autoincrement
        ) {
          pendencias.push({
            tipo: "default_divergente",
            schema,
            tabela: modelo.nome,
            colunas: [campo.nome],
            motivo:
              `"${modelo.nome}"."${campo.nome}": o PostgreSQL tem DEFAULT ${defaultBanco} e o schema.prisma ` +
              `declara ${defaultEsperado}. Trocar o default de uma coluna em uso muda o valor de inserts ` +
              `futuros, então a decisão fica com o operador.`,
            sqlReparo: [
              `ALTER TABLE "${schema}"."${modelo.nome}" ALTER COLUMN "${campo.nome}" SET DEFAULT ${defaultEsperado};`,
            ],
          });
        }
      }

      // --- Colunas que FALTAM ----------------------------------------
      for (const campo of modelo.campos) {
        if (campo.lista) continue;
        if (nomesColunas.has(campo.nome)) continue;

        const tipoSql = campo.autoincrement ? "INTEGER" : tipoSqlDoTipoPrisma(campo.tipo);
        const padrao = defaultSqlDoCampo(campo);
        const obrigatoria = !campo.opcional && !campo.isId;

        // Caso 1 — opcional: entra NULLABLE, com o default do schema se
        // houver. Sempre seguro.
        // Caso 2 — obrigatória COM default declarado: NOT NULL + DEFAULT
        // exato do schema; o Postgres preenche as linhas existentes com
        // um valor que o próprio time escolheu.
        // Caso 3 — obrigatória SEM default declarado E tabela vazia:
        // NOT NULL de verdade, sem inventar valor nenhum.
        // Caso 4 — obrigatória SEM default E tabela COM linhas: entra
        // NULLABLE e vira PENDÊNCIA. É exatamente aqui que a versão
        // antiga gravava '' silenciosamente em toda linha existente.
        let sql: string;
        if (!obrigatoria) {
          sql =
            `ALTER TABLE "${schema}"."${modelo.nome}" ADD COLUMN IF NOT EXISTS "${campo.nome}" ${tipoSql}` +
            (padrao !== null ? ` DEFAULT ${padrao}` : "");
        } else if (padrao !== null) {
          sql = `ALTER TABLE "${schema}"."${modelo.nome}" ADD COLUMN IF NOT EXISTS "${campo.nome}" ${tipoSql} DEFAULT ${padrao} NOT NULL`;
        } else if (!temLinhas) {
          sql = `ALTER TABLE "${schema}"."${modelo.nome}" ADD COLUMN IF NOT EXISTS "${campo.nome}" ${tipoSql} NOT NULL`;
        } else {
          sql = `ALTER TABLE "${schema}"."${modelo.nome}" ADD COLUMN IF NOT EXISTS "${campo.nome}" ${tipoSql}`;
          pendencias.push({
            tipo: "coluna_obrigatoria_sem_default",
            schema,
            tabela: modelo.nome,
            colunas: [campo.nome],
            motivo:
              `"${modelo.nome}"."${campo.nome}" é OBRIGATÓRIA no schema.prisma, não tem @default e a tabela ` +
              `já contém linhas. A coluna foi criada como NULLABLE (sem default): NENHUM valor foi inventado ` +
              `para as linhas existentes. Defina o valor correto de cada linha e só então aplique o NOT NULL ` +
              `do SQL de reparo. (A versão antiga deste sincronizador preenchia tudo com '' — string vazia ` +
              `indistinguível de um dado real preenchido errado.)`,
            sqlDiagnostico:
              `SELECT count(*) AS linhas_sem_valor FROM "${schema}"."${modelo.nome}" WHERE "${campo.nome}" IS NULL;`,
            sqlReparo: [
              `-- 1) Defina o valor correto (troque <VALOR> pelo valor de negócio certo):`,
              `UPDATE "${schema}"."${modelo.nome}" SET "${campo.nome}" = <VALOR> WHERE "${campo.nome}" IS NULL;`,
              `-- 2) Só depois, torne a coluna obrigatória:`,
              `ALTER TABLE "${schema}"."${modelo.nome}" ALTER COLUMN "${campo.nome}" SET NOT NULL;`,
            ],
          });
        }

        try {
          await cliente.query(sql);
          colunasAdicionadas.push({ tabela: modelo.nome, coluna: campo.nome });
        } catch (erro) {
          const mensagem = erro instanceof Error ? erro.message : String(erro);
          throw new Error(
            `Falha ao adicionar a coluna "${campo.nome}" na tabela "${modelo.nome}" (schema "${schema}"): ${mensagem}`
          );
        }
      }
    }

    // -----------------------------------------------------------------
    // Índices comuns (não únicos) — criar é sempre seguro, não há regra
    // de dados que possa ser violada.
    // -----------------------------------------------------------------
    for (const modelo of modelos) {
      for (const indiceSql of ddlDosIndices(modelo, schema)) {
        await cliente.query(indiceSql);
      }
    }

    // -----------------------------------------------------------------
    // UNIQUE INCREMENTAL (item 4): schema.prisma × PostgreSQL.
    //
    // A versão antiga NÃO fazia nada disto na sincronização — os UNIQUEs
    // só existiam se a tabela tivesse sido criada do zero já com eles.
    // Toda empresa provisionada ANTES de um `@unique`/`@@unique` novo
    // ficava para sempre sem a constraint física, e o único sinal disso
    // era um `.catch(() => null)` silencioso.
    // -----------------------------------------------------------------
    const tabelasAgora = await cliente.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
      [schema]
    );
    const existeTabela = new Set(tabelasAgora.rows.map((r) => r.table_name));

    for (const modelo of modelos) {
      if (!existeTabela.has(modelo.nome)) continue;
      const desejados = unicosDesejadosDoModelo(modelo);
      if (desejados.length === 0) continue;

      const { totais: jaExistentes } = await unicosExistentes(cliente, schema, modelo.nome);
      // Colunas do model que de fato existem na tabela — um `@@unique`
      // sobre coluna que ficou pendente (caso 4 acima) não pode ser
      // criado ainda.
      const colunasDaTabela = new Set(
        (
          await cliente.query<{ column_name: string }>(
            `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
            [schema, modelo.nome]
          )
        ).rows.map((r) => r.column_name)
      );

      for (const colunas of desejados) {
        if (jaExistentes.some((existente) => mesmasColunas(existente, colunas))) continue;
        if (!colunas.every((c) => colunasDaTabela.has(c))) continue; // coluna ainda não existe

        const resultado = await criarUnicoSeSeguro(cliente, schema, modelo.nome, colunas);
        if ("pendencia" in resultado) {
          pendencias.push(resultado.pendencia);
        } else {
          unicosCriados.push({ tabela: modelo.nome, colunas, indice: resultado.criado });
        }
      }
    }

    // -----------------------------------------------------------------
    // Constraint especial "um caixa aberto por empresa" — índice único
    // PARCIAL, que o DSL do Prisma não sabe expressar. Mesma regra: só
    // cria se os dados atuais não violarem.
    // -----------------------------------------------------------------
    if (existeTabela.has("Caixa")) {
      const { parciais } = await unicosExistentes(cliente, schema, "Caixa");
      if (!parciais.includes(INDICE_CAIXA_ABERTO_UNICO)) {
        const consulta =
          `SELECT "empresaId", count(*) AS caixas_abertos\n` +
          `  FROM "${schema}"."Caixa"\n` +
          ` WHERE status = 'aberto'\n` +
          ` GROUP BY "empresaId"\n` +
          `HAVING count(*) > 1`;
        const duplicados = await cliente.query(consulta);
        const ddl =
          `CREATE UNIQUE INDEX IF NOT EXISTS "${INDICE_CAIXA_ABERTO_UNICO}" ` +
          `ON "${schema}"."Caixa"("empresaId") WHERE status = 'aberto';`;
        if (duplicados.rows.length > 0) {
          pendencias.push({
            tipo: "unique_com_duplicatas",
            schema,
            tabela: "Caixa",
            colunas: ["empresaId"],
            motivo:
              `Já existe MAIS DE UM caixa com status 'aberto' nesta empresa, então o índice que garante ` +
              `"no máximo um caixa aberto" não pôde ser criado. Feche os caixas abertos indevidos (conferindo ` +
              `os valores de cada um — fechar pelo script perderia a conferência) e rode a sincronização de novo.`,
            sqlDiagnostico: consulta + ";",
            sqlReparo: [ddl],
          });
        } else {
          await cliente.query(ddl);
          unicosCriados.push({
            tabela: "Caixa",
            colunas: ["empresaId (parcial: status='aberto')"],
            indice: INDICE_CAIXA_ABERTO_UNICO,
          });
        }
      }
    }

    // -----------------------------------------------------------------
    // Chaves estrangeiras entre tabelas do tenant.
    //
    // Antes: `.catch(() => null)` engolia TUDO — inclusive uma FK que
    // falhou por existirem linhas órfãs, que é justamente o caso que
    // precisa de atenção. Agora a existência é checada em `pg_constraint`
    // (uma FK que já existe simplesmente não é recriada) e uma falha
    // real vira pendência com o SQL que lista as órfãs.
    // -----------------------------------------------------------------
    const EXCECOES_FK: Record<string, string> = { "MovimentacaoEstoque.produtoId": "EstoqueProduto" };
    for (const modelo of modelos) {
      if (!existeTabela.has(modelo.nome)) continue;
      for (const campo of modelo.campos) {
        if (!campo.nome.endsWith("Id") || campo.nome === "empresaId") continue;
        const excecao = EXCECOES_FK[`${modelo.nome}.${campo.nome}`];
        const modeloReferenciado = excecao ?? campo.nome.replace(/Id$/, "");
        const nomeModeloRef = modelos.find((m) => m.nome.toLowerCase() === modeloReferenciado.toLowerCase())?.nome;
        if (!nomeModeloRef || !existeTabela.has(nomeModeloRef)) continue;

        const nomeFk = `${modelo.nome}_${campo.nome}_fkey`.slice(0, 63);
        const jaTem = await cliente.query(
          `SELECT 1 FROM pg_constraint c
             JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE n.nspname = $1 AND c.conname = $2`,
          [schema, nomeFk]
        );
        if (jaTem.rowCount! > 0) continue;

        const ddl =
          `ALTER TABLE "${schema}"."${modelo.nome}" ADD CONSTRAINT "${nomeFk}" ` +
          `FOREIGN KEY ("${campo.nome}") REFERENCES "${schema}"."${nomeModeloRef}"("id");`;
        try {
          await cliente.query(ddl);
        } catch (erro) {
          const mensagem = erro instanceof Error ? erro.message : String(erro);
          pendencias.push({
            tipo: "fk_nao_aplicada",
            schema,
            tabela: modelo.nome,
            colunas: [campo.nome],
            motivo:
              `A chave estrangeira ${modelo.nome}.${campo.nome} → ${nomeModeloRef}.id não pôde ser criada ` +
              `(${mensagem}). Normalmente significa linhas órfãs: registros apontando para um pai que não ` +
              `existe mais. Nada foi apagado — trate as órfãs e rode a sincronização de novo.`,
            sqlDiagnostico:
              `SELECT f."${campo.nome}", count(*) AS orfas\n` +
              `  FROM "${schema}"."${modelo.nome}" f\n` +
              `  LEFT JOIN "${schema}"."${nomeModeloRef}" p ON p."id" = f."${campo.nome}"\n` +
              ` WHERE f."${campo.nome}" IS NOT NULL AND p."id" IS NULL\n` +
              ` GROUP BY f."${campo.nome}";`,
            sqlReparo: [ddl],
          });
        }
      }
    }
  } finally {
    await cliente.end();
  }

  return { schema, tabelasCriadas, colunasAdicionadas, unicosCriados, pendencias, avisos };
}

/** Roda `sincronizarSchemaEmpresa` para TODAS as empresas cadastradas na plataforma. */
export async function sincronizarTodosOsTenants(
  databaseUrl: string,
  empresas: { schemaBanco: string | null; databaseUrlSecreta: string | null }[]
): Promise<ResultadoSincronizacao[]> {
  const resultados: ResultadoSincronizacao[] = [];
  for (const empresa of empresas) {
    if (!empresa.schemaBanco) continue; // empresa ainda não provisionada — nada a sincronizar
    const urlAlvo = empresa.databaseUrlSecreta ? undefined : databaseUrl; // banco dedicado é tratado por quem chama
    if (!urlAlvo) continue;
    const resultado = await sincronizarSchemaEmpresa(urlAlvo, empresa.schemaBanco, {
      dedicado: Boolean(empresa.databaseUrlSecreta),
    });
    resultados.push(resultado);
  }
  return resultados;
}

/**
 * Provisiona o schema de uma empresa. `dedicado` = true quando a conexão
 * já aponta para um banco TOTALMENTE separado (não inclui a FK para
 * Empresa, que não existiria lá).
 */
export async function provisionarSchemaEmpresa(
  databaseUrl: string,
  schema: string,
  opcoes: { dedicado?: boolean } = {}
): Promise<ResultadoProvisionamento> {
  const modelos = parseSchema().filter((m) => !MODELS_PLATAFORMA.has(m.nome));
  const cliente = novoClientProvisionamento(databaseUrl);
  await cliente.connect();
  const tabelasCriadas: string[] = [];
  try {
    await cliente.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    // Cria as tabelas primeiro (sem FKs entre si), depois as FKs entre
    // tenant tables — evita erro de "tabela referenciada ainda não existe"
    // por causa da ordem dos models no schema.prisma.
    for (const modelo of modelos) {
      try {
        await cliente.query(ddlDaTabela(modelo, schema, !opcoes.dedicado));
        tabelasCriadas.push(modelo.nome);
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        throw new Error(`Falha ao criar a tabela "${modelo.nome}" no schema "${schema}": ${mensagem}`);
      }
    }
    for (const modelo of modelos) {
      for (const indiceSql of ddlDosIndices(modelo, schema)) {
        await cliente.query(indiceSql);
      }
      for (const especialSql of ddlDeConstraintsEspeciais(modelo, schema)) {
        await cliente.query(especialSql);
      }
    }
    // FKs entre tabelas do próprio tenant (ex.: Produto.categoriaId →
    // Categoria.id) — aplicadas por último e de forma best-effort: uma
    // FK que já existe (nova rodada do script) não derruba o resto.
    //
    // Exceções ao padrão "campoId" → model "Campo": o nome do campo não
    // bate com o nome do model referenciado.
    const EXCECOES_FK: Record<string, string> = {
      "MovimentacaoEstoque.produtoId": "EstoqueProduto",
    };
    for (const modelo of modelos) {
      for (const campo of modelo.campos) {
        if (campo.nome.endsWith("Id") && campo.nome !== "empresaId") {
          const excecao = EXCECOES_FK[`${modelo.nome}.${campo.nome}`];
          const modeloReferenciado = excecao ?? campo.nome.replace(/Id$/, "");
          const nomeModeloRef = modelos.find(
            (m) => m.nome.toLowerCase() === modeloReferenciado.toLowerCase()
          )?.nome;
          if (!nomeModeloRef) continue;
          const nomeFk = `${modelo.nome}_${campo.nome}_fkey`.slice(0, 63);
          await cliente
            .query(
              `ALTER TABLE "${schema}"."${modelo.nome}" ` +
                `ADD CONSTRAINT "${nomeFk}" FOREIGN KEY ("${campo.nome}") ` +
                `REFERENCES "${schema}"."${nomeModeloRef}"("id")`
            )
            .catch(() => null); // best-effort: idempotente, não falha se já existir
        }
      }
    }
  } finally {
    await cliente.end();
  }
  return { schema, tabelasCriadas };
}
