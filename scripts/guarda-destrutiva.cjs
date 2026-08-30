#!/usr/bin/env node
/**
 * Guarda para os comandos DESTRUTIVOS do package.json
 * (`db:reset`, `db:seed`).
 *
 * POR QUE EXISTE: o banco do PedidoFlow é de PRODUÇÃO, com pedidos e
 * clientes reais. `prisma migrate reset --force` APAGA TUDO e recria do
 * zero, sem perguntar. Ele estava a um `npm run db:reset` de distância —
 * e `db:reset` fica na lista logo abaixo de `db:deploy` no autocomplete
 * do terminal. Um Tab errado às 22h de uma sexta-feira apaga a operação
 * inteira da pizzaria.
 *
 * Agora esses comandos exigem uma confirmação explícita e digitada:
 *
 *   PEDIDOFLOW_CONFIRMO_APAGAR=SIM-EU-QUERO-APAGAR npm run db:reset
 *
 * E são recusados de qualquer jeito quando NODE_ENV=production.
 */
const comando = process.argv.slice(2).join(" ");
const FRASE = "SIM-EU-QUERO-APAGAR";

if (process.env.NODE_ENV === "production") {
  console.error(
    `\n❌ "${comando}" é destrutivo e está bloqueado com NODE_ENV=production.\n` +
      `   Se você precisa mesmo recriar um banco, faça isso numa máquina de\n` +
      `   desenvolvimento, nunca no servidor.\n`
  );
  process.exit(1);
}

if (process.env.PEDIDOFLOW_CONFIRMO_APAGAR !== FRASE) {
  console.error(
    `\n❌ "${comando}" APAGA DADOS e foi bloqueado.\n\n` +
      `   Se for isso mesmo, e o banco NÃO for o de produção:\n\n` +
      `     PEDIDOFLOW_CONFIRMO_APAGAR=${FRASE} npm run ${process.env.npm_lifecycle_event ?? "<comando>"}\n\n` +
      `   Confira antes para qual banco a DATABASE_URL está apontando.\n`
  );
  process.exit(1);
}

const { spawnSync } = require("node:child_process");
const r = spawnSync(comando, { shell: true, stdio: "inherit" });
process.exit(r.status ?? 1);
