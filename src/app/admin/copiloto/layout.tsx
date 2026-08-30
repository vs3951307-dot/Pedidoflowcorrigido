import { redirect } from "next/navigation";
import { exigirRota } from "@/lib/acesso";

/**
 * Guarda de módulo — mesma correção do estoque/fiscal (PEDIDO 34): sem
 * isto, `/admin/copiloto` renderizaria mesmo sem o módulo Copiloto
 * contratado (o layout pai só checa `admin`, que não exige módulo).
 */
export default async function CopilotoLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirRota("admin");
  if (!usuario.modulosAtivos.includes("copiloto")) {
    redirect("/admin");
  }
  return children;
}
