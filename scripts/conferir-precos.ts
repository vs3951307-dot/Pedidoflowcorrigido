/**
 * ETAPA 1 — script de conferência (SOMENTE LEITURA, não grava nada).
 *
 * Lê o catálogo de pizzas do banco (tamanhos, sabores, preços e a
 * configuração "pizza") e recalcula os preços usando a MESMA função
 * `calcularPrecoItem` que o servidor usa. Imprime lado a lado o valor
 * calculado contra um valor de referência (do cardápio impresso), para o
 * dono conferir se bate.
 *
 * Uso:
 *   npm run db:conferir-precos
 *   npm run db:conferir-precos -- --schema tenant_disk_pizza_rozeno
 *   npm run db:conferir-precos -- --ref referencia.json
 *
 * Formato de referencia.json:
 *   [ { "tamanho": "Média", "sabores": ["4 Queijos","Doritos"], "esperado": 52.00 }, ... ]
 */
import { Client } from "pg";
import { readFileSync } from "fs";
import { calcularPrecoItem, type SaborPreco } from "../src/lib/preco-pizza";

function conexaoString(): string {
  // Prefere DIRECT_URL (conexão direta, como o Prisma usa em migrations).
  // Passa a string crua ao pg, que faz o parse correto da senha (inclui
  // percent-encoding), igual ao comportamento do Prisma.
  return process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";
}

interface RefEntry {
  tamanho: string;
  sabores: string[];
  esperado?: number;
  nota?: string;
}

const REF_PADRAO: RefEntry[] = [
  { tamanho: "Média", sabores: ["4 Queijos"], esperado: 46 },
  { tamanho: "Média", sabores: ["4 Queijos", "Calabresa"], esperado: 46 },
  { tamanho: "Média", sabores: ["4 Queijos", "Doritos"], esperado: 52 },
  { tamanho: "Média", sabores: ["Doritos", "Tomate Seco"], esperado: 62 },
  { tamanho: "Média", sabores: ["Banoffe"], esperado: 52 },
  { tamanho: "Média", sabores: ["Banoffe", "Prestígio"], esperado: 62 },
  { tamanho: "Grande", sabores: ["Doritos", "Tomate Seco"], esperado: 72 },
  { tamanho: "Família", sabores: ["Doritos", "Tomate Seco", "4 Queijos"], esperado: 82 },
  { tamanho: "Família", sabores: ["4 Queijos", "Calabresa", "Portuguesa"], esperado: 66 },
  { tamanho: "Grande", sabores: ["4 Queijos", "Calabresa"], esperado: 56 },
  { tamanho: "Família", sabores: ["Doritos", "Tomate Seco", "Filé na Chapa"], esperado: 92 },
];

async function main() {
  const args = process.argv.slice(2);
  const schema = args.find((a) => a.startsWith("--schema="))?.split("=")[1] ?? "tenant_disk_pizza_rozeno";
  const refPath = args.find((a) => a.startsWith("--ref="))?.split("=")[1];

  const ref: RefEntry[] = refPath
    ? (JSON.parse(readFileSync(refPath, "utf8")) as RefEntry[])
    : REF_PADRAO;

  const client = new Client(conexaoString());
  await client.connect();
  try {
    const tamRows = await client.query(
      `select nome, "maxSabores" from ${schema}."Tamanho" order by nome`
    );
    const maxSabores: Record<string, number> = {};
    tamRows.rows.forEach((r: any) => (maxSabores[r.nome] = Number(r.maxSabores)));

    // sabores: produto que participa de ProdutoSabor
    const sabRows = await client.query(`
      select sb.id as "saborId", p.nome as sabor, sb.tipo as tipo, t.nome as tamanho, pt.valor as preco
      from ${schema}."ProdutoSabor" ps
      join ${schema}."Produto" p on p.id = ps."produtoId"
      join ${schema}."Sabor" sb on sb.id = ps."saborId"
      join ${schema}."PrecoTamanho" pt on pt."produtoId" = p.id
      join ${schema}."Tamanho" t on t.id = pt."tamanhoId"`);
    const precoSabor: Record<string, Record<string, number>> = {};
    const tipoSabor: Record<string, string> = {};
    const idSabor: Record<string, string> = {};
    sabRows.rows.forEach((r: any) => {
      precoSabor[r.sabor] = precoSabor[r.sabor] ?? {};
      precoSabor[r.sabor][r.tamanho] = Number(r.preco);
      tipoSabor[r.sabor] = r.tipo;
      idSabor[r.sabor] = r.saborId;
    });

    // config pizza
    let acrescimo = 10;
    let misturar = true;
    const cfgRow = await client.query(
      `select valor from ${schema}."Configuracao" where chave = 'pizza'`
    );
    if (cfgRow.rows.length) {
      const cfg = JSON.parse(cfgRow.rows[0].valor);
      acrescimo = Number(cfg.acrescimoPorSaborPremium ?? cfg.precoEspecialSegundoSabor ?? 10);
      misturar = cfg.permitirMisturarDoceSalgada ?? true;
    } else {
      console.log("⚠ Configuração 'pizza' AUSENTE no banco — usando acréscimo=10, misturar doce/salgada=true (padrão).\n");
    }

    console.log(`Conferência de preços — schema ${schema} (acrésimo=${acrescimo}, maxSabores=${JSON.stringify(maxSabores)})\n`);
    console.log("TAMANHO | SABORES | CALCULADO | ESPERADO | OK?");
    console.log("-".repeat(80));
    let divergencias = 0;
    for (const e of ref) {
      const sabores: SaborPreco[] = e.sabores.map((n) => ({
        saborId: idSabor[n] ?? "",
        tipo: tipoSabor[n] ?? "tradicional",
        precoNoTamanho: precoSabor[n]?.[e.tamanho] ?? 0,
      }));
      const r = calcularPrecoItem({
        sabores,
        adicionais: [],
        quantidade: 1,
        acrescimoPorSaborPremium: acrescimo,
        maxSabores: maxSabores[e.tamanho] ?? 1,
      });
      const recusou = "erro" in r;
      const calc = recusou ? "RECUSA" : Number(r.precoUnitario).toFixed(2);
      const esp = e.esperado != null ? e.esperado.toFixed(2) : "-";
      const ok = recusou
        ? e.esperado == null
          ? "recusa✓"
          : "RECUSA!"
        : e.esperado == null
          ? "-"
          : Number(r.precoUnitario) === e.esperado
            ? "ok"
            : "DIVERGE";
      if (ok === "DIVERGE" || ok === "RECUSA!") divergencias++;
      console.log(`${e.tamanho} | ${e.sabores.join("+")} | ${calc} | ${esp} | ${ok}${recusou ? " (" + (r as { erro: string }).erro + ")" : ""}`);
    }
    console.log("-".repeat(80));
    console.log(divergencias === 0 ? "✔ Nenhuma divergência." : `✖ ${divergencias} divergência(s) — conferir com o dono.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("Falha na conferência:", e);
  process.exit(1);
});
