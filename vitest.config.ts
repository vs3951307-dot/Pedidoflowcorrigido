import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // Testes de DOM (happy-dom) vivem isolados no `vitest.dom.config.ts`;
    // aqui mantemos o ambiente node padrão e ignoramos os *.dom.test.tsx.
    exclude: ["**/node_modules/**", "**/*.dom.test.tsx"],
    // Carrega o `.env` do projeto (DATABASE_URL do banco de TESTE) — as
    // suítes de banco precisam dele e o Vitest não lê `.env` sozinho.
    setupFiles: ["./vitest.setup.ts"],
    // As suítes de banco criam e apagam dados nos MESMOS schemas de
    // tenant (contadores de pedido, caixa, índices únicos). Rodar arquivos
    // em paralelo faria uma suíte enxergar o estado intermediário da
    // outra e produziria falha/aprovação por acidente, não por
    // comportamento. Em série, cada suíte vê só o que ela mesma criou.
    fileParallelism: false,
    // O default de 5s é curto para transações concorrentes reais (uma
    // espera a trava da outra) e para o DDL da sincronização de schema.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
