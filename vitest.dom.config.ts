import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vite 8 lê o bloco `oxc` em runtime (parser/oxc) para fazer o JSX transform
 * do ambiente happy-dom — mas a tipagem de UserConfig ainda não declara `oxc`.
 * Anexamos via `Object.assign` para NÃO usar `any`/cast (que quebraria o
 * `next build` com @typescript-eslint/no-explicit-any) e NÃO sofrer excess
 * property check. Funciona no runtime e passa no type-check do build.
 */
export default Object.assign(
  defineConfig({
    test: {
      environment: "happy-dom",
      globals: true,
      setupFiles: [],
      include: ["src/**/*.dom.test.tsx"],
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }),
  {
    oxc: {
      jsx: "automatic",
      jsxImportSource: "react",
    },
  }
);
