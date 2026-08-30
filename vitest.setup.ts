import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Carrega o `.env` do projeto para o processo de teste.
 *
 * O Vitest não lê `.env` sozinho (isso é feito pelo Next.js e pela CLI
 * do Prisma), e as suítes de banco precisam de `DATABASE_URL` para
 * apontar ao PostgreSQL de TESTE. Sem isso elas falhariam por
 * configuração, e é justamente o tipo de falha que a auditoria pediu
 * para não confundir com "teste pulado".
 *
 * Variáveis já definidas no ambiente têm precedência — rodar
 * `DATABASE_URL=... npm test` continua funcionando.
 */
function carregarEnv(arquivo: string) {
  const caminho = resolve(process.cwd(), arquivo);
  if (!existsSync(caminho)) return;
  for (const linha of readFileSync(caminho, "utf-8").split("\n")) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#")) continue;
    const separador = limpa.indexOf("=");
    if (separador < 0) continue;
    const chave = limpa.slice(0, separador).trim();
    let valor = limpa.slice(separador + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    if (process.env[chave] === undefined) process.env[chave] = valor;
  }
}

carregarEnv(".env.test");
carregarEnv(".env");
