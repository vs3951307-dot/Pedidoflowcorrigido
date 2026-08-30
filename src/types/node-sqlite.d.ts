// Declaração mínima do módulo `node:sqlite` (nativo do Node 22+), usada
// pelo script de migração única `scripts/migrar-sqlite-para-postgres.ts`.
// O @types/node na versão do projeto (^20) ainda não traz esse módulo;
// esta declaração cobre só o que o script usa (leitura).
declare module "node:sqlite" {
  export interface StatementSync {
    all(...params: unknown[]): unknown[];
  }
  export interface DatabaseSync {
    prepare(sql: string): StatementSync;
    close(): void;
  }
  export const DatabaseSync: new (
    path: string,
    options?: { readOnly?: boolean }
  ) => DatabaseSync;
}
