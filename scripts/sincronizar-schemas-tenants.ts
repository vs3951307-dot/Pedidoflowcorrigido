/**
 * Sincroniza TODOS os schemas de tenant já existentes com o
 * `schema.prisma` atual — SEM APAGAR NADA (tabelas/colunas/índices que
 * faltam são criados; nada existente é removido, truncado ou
 * sobrescrito).
 *
 * Use isto depois de atualizar o código em produção (ou em qualquer
 * ambiente com empresas/dados reais que você não quer perder) — ao
 * contrário de `npm run db:seed` (que apaga e recria os dados de
 * demonstração), este comando preserva tudo.
 *
 * IMPORTANTE (item 5 da auditoria): este script NÃO roda mais durante o
 * `npm run build`. Build não toca em banco. Ele faz parte do passo
 * explícito de deploy — ver `npm run deploy:migrar` e o DEPLOY.md.
 *
 * PENDÊNCIAS (itens 3 e 4): o que não pôde ser aplicado com segurança
 * (coluna obrigatória sem default numa tabela com linhas, UNIQUE que os
 * dados atuais violam, FK com linhas órfãs, DEFAULT '' herdado) NÃO é
 * forçado. Sai impresso no fim, com o SQL de diagnóstico e o de reparo,
 * e é gravado em `pendencias-tenants.json` para revisão.
 *
 * Uso:
 *   npm run db:sync-tenants              # aplica o que é seguro e reporta o resto
 *   npm run db:sync-tenants -- --strict  # sai com código 2 se houver pendência
 */
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { sincronizarSchemaEmpresa, type Pendencia, type Aviso } from "@/lib/tenant-provisionamento";

const ARQUIVO_PENDENCIAS = "pendencias-tenants.json";

function imprimirPendencia(p: Pendencia, indice: number) {
  console.log(`\n  [${indice}] ${p.tipo} — ${p.schema}.${p.tabela} (${p.colunas.join(", ")})`);
  console.log(`      ${p.motivo}`);
  if (p.sqlDiagnostico) {
    console.log(`      SQL de diagnóstico (só leitura):`);
    for (const linha of p.sqlDiagnostico.split("\n")) console.log(`        ${linha}`);
  }
  console.log(`      SQL de reparo (revise antes de rodar):`);
  for (const linha of p.sqlReparo) console.log(`        ${linha}`);
}

async function main() {
  const estrito = process.argv.includes("--strict");

  // DDL prefere a conexão DIRETA (Neon/Supabase usam pooler para a app).
  const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL não configurada.");
    process.exit(1);
  }

  const plataforma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const todasPendencias: Pendencia[] = [];
  const todosAvisos: Aviso[] = [];

  try {
    const empresas = await plataforma.empresa.findMany({
      select: { id: true, nome: true, schemaBanco: true, databaseUrlSecreta: true },
    });

    if (empresas.length === 0) {
      console.log("Nenhuma empresa cadastrada — nada para sincronizar.");
      return;
    }

    console.log(`Sincronizando ${empresas.length} empresa(s)...\n`);
    let totalTabelas = 0;
    let totalColunas = 0;
    let totalUnicos = 0;

    for (const empresa of empresas) {
      if (!empresa.schemaBanco) {
        console.log(`- ${empresa.nome}: ainda sem schema provisionado — pulando.`);
        continue;
      }
      if (empresa.databaseUrlSecreta) {
        console.log(
          `- ${empresa.nome}: usa banco dedicado (fora deste servidor) — sincronize manualmente apontando para o banco dela.`
        );
        continue;
      }
      const resultado = await sincronizarSchemaEmpresa(databaseUrl, empresa.schemaBanco);
      totalTabelas += resultado.tabelasCriadas.length;
      totalColunas += resultado.colunasAdicionadas.length;
      totalUnicos += resultado.unicosCriados.length;
      todasPendencias.push(...resultado.pendencias);
      todosAvisos.push(...resultado.avisos);

      console.log(
        `- ${empresa.nome} (${resultado.schema}): ${resultado.tabelasCriadas.length} tabela(s) nova(s), ` +
          `${resultado.colunasAdicionadas.length} coluna(s) nova(s), ` +
          `${resultado.unicosCriados.length} índice(s) único(s) novo(s)` +
          (resultado.colunasAdicionadas.length > 0
            ? ` [${resultado.colunasAdicionadas.map((c) => `${c.tabela}.${c.coluna}`).join(", ")}]`
            : "") +
          (resultado.pendencias.length > 0 ? ` — ${resultado.pendencias.length} PENDÊNCIA(S)` : "")
      );
    }

    console.log(
      `\nConcluído: ${totalTabelas} tabela(s), ${totalColunas} coluna(s) e ${totalUnicos} índice(s) único(s) adicionados no total.`
    );
    console.log("Nenhum dado existente foi apagado, truncado ou sobrescrito.");

    if (todosAvisos.length > 0) {
      console.log(`\n--- AVISOS (${todosAvisos.length}) — informativo, nada bloqueado ---`);
      for (const a of todosAvisos) {
        console.log(`  · ${a.schema}.${a.tabela}.${a.coluna}: ${a.mensagem}`);
      }
    }

    if (todasPendencias.length > 0) {
      console.log(
        `\n=================== ${todasPendencias.length} PENDÊNCIA(S) ===================\n` +
          `Estes itens NÃO foram aplicados porque aplicá-los agora poderia\n` +
          `corromper ou perder dado existente. Nada foi alterado por eles.`
      );
      todasPendencias.forEach(imprimirPendencia);
      writeFileSync(ARQUIVO_PENDENCIAS, JSON.stringify(todasPendencias, null, 2), "utf-8");
      console.log(`\n  → Detalhes gravados em ${ARQUIVO_PENDENCIAS}`);
      console.log("======================================================\n");
      if (estrito) {
        console.error("--strict ativo: saindo com código 2 por causa das pendências acima.");
        process.exitCode = 2;
      }
    } else {
      console.log("\nNenhuma pendência: schema.prisma e PostgreSQL estão alinhados em todos os tenants.");
    }
  } finally {
    await plataforma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Falha ao sincronizar tenants:", e);
  process.exit(1);
});
