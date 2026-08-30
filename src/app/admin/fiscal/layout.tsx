import { exigirRota } from "@/lib/acesso";

/**
 * Guarda de módulo (PEDIDO 34) — mesma correção do
 * `src/app/admin/estoque/layout.tsx`: sem isto, `/admin/fiscal`
 * renderizava mesmo sem o módulo Fiscal contratado.
 */
export default async function FiscalLayout({ children }: { children: React.ReactNode }) {
  await exigirRota("fiscal");
  return children;
}
