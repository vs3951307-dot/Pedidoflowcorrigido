import { exigirRota } from "@/lib/acesso";
import { CopilotoEmpresa } from "./_components/copiloto-empresa";

export default async function AdminCopilotoPage() {
  const usuario = await exigirRota("admin");
  return <CopilotoEmpresa nomeUsuario={usuario.nome} empresaNome={usuario.empresaNome} />;
}
