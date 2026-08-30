import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { clientePg } from "./__tests__/ajuda-banco-de-teste";
import {
  calcularPrecoItem,
  validarMisturaSabores,
  type EntradaPrecoPizza,
  type SaborPreco,
} from "./preco-pizza";

/**
 * Testes da regra de preço de pizza (ETAPA 1).
 *
 * Os PREÇOS são lidos do banco de teste (tenant_disk_pizza_rozeno do seed),
 * nunca de constantes no arquivo. Os totais ESPERADOS vêm da tabela da
 * spec (§2) e servem como asserção do comportamento da função única
 * `calcularPrecoItem`.
 *
 * CORREÇÃO (item 7 da auditoria — "os testes de preço não executavam"):
 * a conexão era montada com um parser de string no formato
 * `key=valor;key=valor` (estilo ADO.NET/SQL Server) aplicado a uma URL
 * `postgresql://usuario:senha@host:porta/banco`. NENHUM dos regexes
 * casava, então todos os valores caíam no default embutido no arquivo
 * (host 127.0.0.1, porta 5433, banco "pedidoflow") e o `beforeAll`
 * morria com `database "pedidoflow" does not exist` — o que o Vitest
 * reporta como 16 testes "skipped". Skip aparece como não-falha em
 * qualquer leitura rápida do resultado: os 16 testes de preço nunca
 * rodaram, e nada avisava.
 *
 * Agora a conexão usa a `DATABASE_URL` de verdade (via
 * `clientePg()`), e se o banco não estiver disponível a suíte FALHA com
 * a razão explícita — nunca "passa" nem some como skip.
 */

const SCHEMA = "tenant_disk_pizza_rozeno";

let client: Client;

beforeAll(async () => {
  client = await clientePg();
  // Prova que os dados do seed estão presentes: sem eles, os testes
  // abaixo não teriam preço nenhum para verificar e falhariam por
  // "sabor não encontrado" — mensagem que esconderia a causa real.
  const sabores = await client.query(`select count(*)::int as total from ${SCHEMA}."Sabor"`);
  if (sabores.rows[0].total === 0) {
    throw new Error(
      `O schema ${SCHEMA} existe mas está sem sabores cadastrados. ` +
        `Rode \`npx prisma db seed\` contra o banco de TESTE antes desta suíte.`
    );
  }
});

afterAll(async () => {
  await client?.end();
});

async function precoSabor(nome: string, tamanho: string): Promise<number> {
  const r = await client.query(
    `select pt.valor from ${SCHEMA}."PrecoTamanho" pt
     join ${SCHEMA}."Tamanho" t on t.id = pt."tamanhoId"
     join ${SCHEMA}."Produto" p on p.id = pt."produtoId"
     where p.nome = $1 and t.nome = $2`,
    [nome, tamanho]
  );
  if (!r.rows.length) throw new Error(`Preço não encontrado p/ sabor "${nome}" tamanho "${tamanho}"`);
  return Number(r.rows[0].valor);
}

async function saborInfo(nome: string): Promise<{ saborId: string; tipo: string }> {
  const r = await client.query(`select id, tipo from ${SCHEMA}."Sabor" where nome = $1`, [nome]);
  if (!r.rows.length) throw new Error(`Sabor não encontrado: ${nome}`);
  return { saborId: r.rows[0].id, tipo: r.rows[0].tipo };
}

async function maxSabores(tamanho: string): Promise<number> {
  const r = await client.query(`select "maxSabores" from ${SCHEMA}."Tamanho" where nome = $1`, [tamanho]);
  if (!r.rows.length) throw new Error(`Tamanho não encontrado: ${tamanho}`);
  return Number(r.rows[0].maxSabores);
}

async function montarSabores(nomes: string[], tamanho: string): Promise<SaborPreco[]> {
  return Promise.all(
    nomes.map(async (nome) => {
      const info = await saborInfo(nome);
      return { saborId: info.saborId, tipo: info.tipo, precoNoTamanho: await precoSabor(nome, tamanho) };
    })
  );
}

// Só tipo/saborId — para validarMisturaSabores (não precisa de preço)
async function montarSaboresTipo(nomes: string[]): Promise<SaborPreco[]> {
  return Promise.all(
    nomes.map(async (nome) => {
      const info = await saborInfo(nome);
      return { saborId: info.saborId, tipo: info.tipo, precoNoTamanho: 0 };
    })
  );
}

function entrada(sabores: SaborPreco[], sobre: Partial<EntradaPrecoPizza> = {}): EntradaPrecoPizza {
  return {
    sabores,
    adicionais: [],
    quantidade: 1,
    acrescimoPorSaborPremium: 10,
    maxSabores: 2,
    ...sobre,
  };
}

describe("calcularPrecoItem — regra de preço pizza (§2 da spec)", () => {
  it("Média / 4 Queijos = 46,00", async () => {
    const s = await montarSabores(["4 Queijos"], "Média");
    const r = calcularPrecoItem(entrada(s));
    expect("erro" in r).toBe(false);
    if (!("erro" in r)) expect(r.precoUnitario).toBe(46);
  });

  it("Média / 4 Queijos + Calabresa = 46,00", async () => {
    const s = await montarSabores(["4 Queijos", "Calabresa"], "Média");
    const r = calcularPrecoItem(entrada(s));
    expect("erro" in r).toBe(false);
    if (!("erro" in r)) expect(r.precoUnitario).toBe(46);
  });

  it("Média / 4 Queijos + Doritos = 52,00", async () => {
    const s = await montarSabores(["4 Queijos", "Doritos"], "Média");
    const r = calcularPrecoItem(entrada(s));
    expect("erro" in r).toBe(false);
    if (!("erro" in r)) expect(r.precoUnitario).toBe(52);
  });

  it("Média / Doritos + Tomate Seco = 62,00", async () => {
    const s = await montarSabores(["Doritos", "Tomate Seco"], "Média");
    const r = calcularPrecoItem(entrada(s));
    expect("erro" in r).toBe(false);
    if (!("erro" in r)) expect(r.precoUnitario).toBe(62);
  });

  it("Média / Banoffe = 52,00", async () => {
    const s = await montarSabores(["Banoffe"], "Média");
    const r = calcularPrecoItem(entrada(s));
    expect("erro" in r).toBe(false);
    if (!("erro" in r)) expect(r.precoUnitario).toBe(52);
  });

  it("Média / Banoffe + Prestígio = 62,00", async () => {
    const s = await montarSabores(["Banoffe", "Prestígio"], "Média");
    const r = calcularPrecoItem(entrada(s));
    expect("erro" in r).toBe(false);
    if (!("erro" in r)) expect(r.precoUnitario).toBe(62);
  });

  it("Grande / Doritos + Tomate Seco = 72,00", async () => {
    const s = await montarSabores(["Doritos", "Tomate Seco"], "Grande");
    const r = calcularPrecoItem(entrada(s, { maxSabores: await maxSabores("Grande") }));
    expect("erro" in r).toBe(false);
    if (!("erro" in r)) expect(r.precoUnitario).toBe(72);
  });

  it("Família / 2 especiais + 1 trad = 82,00", async () => {
    const s = await montarSabores(["Doritos", "Tomate Seco", "4 Queijos"], "Família");
    const r = calcularPrecoItem(entrada(s, { maxSabores: await maxSabores("Família") }));
    expect("erro" in r).toBe(false);
    if (!("erro" in r)) expect(r.precoUnitario).toBe(82);
  });

  it("Família / 3 tradicionais = 66,00", async () => {
    const s = await montarSabores(["4 Queijos", "Calabresa", "Portuguesa"], "Família");
    const r = calcularPrecoItem(entrada(s, { maxSabores: await maxSabores("Família") }));
    expect("erro" in r).toBe(false);
    if (!("erro" in r)) expect(r.precoUnitario).toBe(66);
  });

  it("Grande / 4 Queijos + Calabresa = 56,00", async () => {
    const s = await montarSabores(["4 Queijos", "Calabresa"], "Grande");
    const r = calcularPrecoItem(entrada(s, { maxSabores: await maxSabores("Grande") }));
    expect("erro" in r).toBe(false);
    if (!("erro" in r)) expect(r.precoUnitario).toBe(56);
  });

  it("Família / 3 especiais = 92,00", async () => {
    const s = await montarSabores(["Doritos", "Tomate Seco", "Filé na Chapa"], "Família");
    const r = calcularPrecoItem(entrada(s, { maxSabores: await maxSabores("Família") }));
    expect("erro" in r).toBe(false);
    if (!("erro" in r)) expect(r.precoUnitario).toBe(92);
  });
});

describe("maxSabores vem do banco e permite meia a meia / 3 sabores", () => {
  // Estes testes existem por causa de um defeito real encontrado na
  // auditoria: a coluna `Tamanho.maxSabores` era criada com DEFAULT 1 e
  // nunca preenchida, então TODO tamanho ficava com limite de 1 sabor e
  // meia a meia / 2 sabores / 3 sabores eram simplesmente impossíveis
  // de vender. Asserção direta sobre o dado, para a regressão não voltar
  // silenciosamente.
  it("Média aceita 2 sabores (meia a meia)", async () => {
    expect(await maxSabores("Média")).toBe(2);
  });

  it("Grande aceita 2 sabores (meia a meia)", async () => {
    expect(await maxSabores("Grande")).toBe(2);
  });

  it("Família aceita 3 sabores", async () => {
    expect(await maxSabores("Família")).toBe(3);
  });
});

describe("acréscimo de R$ 10 por sabor premium ADICIONAL", () => {
  // A regra é "por sabor premium ADICIONAL", multiplicada — não um valor
  // fixo somado uma vez. Cada caso abaixo isola um degrau dela.
  it("1 sabor premium sozinho NÃO gera acréscimo (Média/Doritos = 52)", async () => {
    const s = await montarSabores(["Doritos"], "Média");
    const r = calcularPrecoItem(entrada(s, { maxSabores: await maxSabores("Média") }));
    expect("erro" in r).toBe(false);
    if (!("erro" in r)) expect(r.precoUnitario).toBe(52);
  });

  it("2 sabores premium geram 1× R$10 (Média: 52 + 10 = 62)", async () => {
    const s = await montarSabores(["Doritos", "Tomate Seco"], "Média");
    const r = calcularPrecoItem(entrada(s, { maxSabores: await maxSabores("Média") }));
    expect("erro" in r).toBe(false);
    if (!("erro" in r)) expect(r.precoUnitario).toBe(62);
  });

  it("3 sabores premium geram 2× R$10 (Família: 72 + 20 = 92)", async () => {
    const s = await montarSabores(["Doritos", "Tomate Seco", "Filé na Chapa"], "Família");
    const r = calcularPrecoItem(entrada(s, { maxSabores: await maxSabores("Família") }));
    expect("erro" in r).toBe(false);
    if (!("erro" in r)) expect(r.precoUnitario).toBe(92);
  });

  it("2 sabores TRADICIONAIS não geram acréscimo nenhum (Média = 46)", async () => {
    const s = await montarSabores(["4 Queijos", "Calabresa"], "Média");
    const r = calcularPrecoItem(entrada(s, { maxSabores: await maxSabores("Média") }));
    expect("erro" in r).toBe(false);
    if (!("erro" in r)) expect(r.precoUnitario).toBe(46);
  });

  it("cobra o MAIOR preço entre os sabores, não o do primeiro escolhido", async () => {
    // Tradicional (46) + especial (52) na Média: o especial é 1 só, então
    // não há acréscimo — o preço tem de ser 52 (o maior), nunca 46.
    const tradicionalPrimeiro = await montarSabores(["4 Queijos", "Doritos"], "Média");
    const especialPrimeiro = await montarSabores(["Doritos", "4 Queijos"], "Média");
    const limite = await maxSabores("Média");
    const r1 = calcularPrecoItem(entrada(tradicionalPrimeiro, { maxSabores: limite }));
    const r2 = calcularPrecoItem(entrada(especialPrimeiro, { maxSabores: limite }));
    expect("erro" in r1).toBe(false);
    expect("erro" in r2).toBe(false);
    if (!("erro" in r1)) expect(r1.precoUnitario).toBe(52);
    // A ordem de escolha não pode mudar o preço.
    if (!("erro" in r1) && !("erro" in r2)) expect(r1.precoUnitario).toBe(r2.precoUnitario);
  });

  it("multiplica o preço unitário pela quantidade do item", async () => {
    const s = await montarSabores(["Doritos", "Tomate Seco"], "Média");
    const r = calcularPrecoItem(entrada(s, { maxSabores: await maxSabores("Média"), quantidade: 3 }));
    expect("erro" in r).toBe(false);
    if (!("erro" in r)) {
      expect(r.precoUnitario).toBe(62);
      expect(r.total).toBe(186);
    }
  });
});

describe("calcularPrecoItem — validações (recusa)", () => {
  it("recusa quando ultrapassa maxSabores (Média=2, 3 sabores)", async () => {
    const limite = await maxSabores("Média");
    expect(limite).toBe(2); // garante que a recusa abaixo é por 3 > 2, não por 3 > 1
    const s = await montarSabores(["4 Queijos", "Calabresa", "Portuguesa"], "Média");
    const r = calcularPrecoItem(entrada(s, { maxSabores: limite }));
    expect("erro" in r).toBe(true);
  });

  it("soma adicionais ao preço base (46 + 6 = 52)", async () => {
    const s = await montarSabores(["4 Queijos"], "Média");
    const r = calcularPrecoItem(entrada(s, { adicionais: [{ preco: 6, quantidade: 1 }] }));
    expect("erro" in r).toBe(false);
    if (!("erro" in r)) expect(r.precoUnitario).toBe(52);
  });
});

describe("validarMisturaSabores", () => {
  it("recusa mistura doce+salgada quando permitirMisturarDoceSalgada=false", async () => {
    const s = await montarSaboresTipo(["Banoffe", "Calabresa"]);
    const erro = validarMisturaSabores(s, false);
    expect(erro).not.toBeNull();
  });

  it("permite 3 sabores doces puros (sem salgada) quando permitir=false", async () => {
    const s = await montarSaboresTipo(["Banoffe", "Prestígio", "Chocolate"]);
    const erro = validarMisturaSabores(s, false);
    expect(erro).toBeNull();
  });

  it("permite mistura doce/salgada quando habilitado", async () => {
    const s = await montarSaboresTipo(["Banoffe", "Calabresa"]);
    const erro = validarMisturaSabores(s, true);
    expect(erro).toBeNull();
  });
});
