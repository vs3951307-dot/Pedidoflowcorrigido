import { createRequire } from "node:module";

/**
 * Extrai texto de um PDF de cardápio. O pacote `pdf-parse` (CommonJS, sem
 * tipos) é carregado por `createRequire` para evitar problemas de
 * resolução de tipos/ESM no bundle do Next; o Buffer é passado direto,
 * então não há leitura de arquivo em disco nem o carregamento do arquivo
 * de teste do pacote.
 *
 * IMPORTANTE: carregamos `pdf-parse/lib/pdf-parse.js` (o módulo interno),
 * NÃO o entrypoint `pdf-parse` (index.js). O index.js tem um bloco de
 * debug que lê `./test/data/05-versions-space.pdf` quando `module.parent`
 * é falsy — e é exatamente isso que acontece no bundle de PRODUÇÃO do
 * Next.js (o módulo é reescrito e `module.parent` fica undefined), o que
 * fazia a extração de PDF dar 500 ("Erro interno") em produção mesmo
 * funcionando em dev. O módulo interno é a mesma função, sem o debug.
 */

export interface ExtrairPdfResultado {
  text: string;
  numpages: number;
  info: Record<string, unknown>;
}

export async function pdfParse(buffer: Buffer): Promise<ExtrairPdfResultado> {
  const require = createRequire(import.meta.url);
  const lerPdf = require("pdf-parse/lib/pdf-parse.js") as (
    dados: Buffer,
    opcoes?: Record<string, unknown>
  ) => Promise<ExtrairPdfResultado>;
  return lerPdf(buffer);
}
