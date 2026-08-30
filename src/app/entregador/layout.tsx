import { EntregadorCasca } from "@/app/entregador/_components/entregador-casca";
import { exigirRota } from "@/lib/acesso";

/**
 * Casca do módulo Entregador (PEDIDO 14): exige sessão com permissão
 * "entregas" (Entregador/Administrador) e saúda o usuário autenticado.
 */
export default async function EntregadorLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirRota("entregas");

  return <EntregadorCasca greetingName={usuario.nome} empresaNome={usuario.empresaNome} empresaId={usuario.empresaId} empresaLogoUrl={usuario.empresaLogoUrl} empresaTema={usuario.empresaTema}>{children}</EntregadorCasca>;
}
