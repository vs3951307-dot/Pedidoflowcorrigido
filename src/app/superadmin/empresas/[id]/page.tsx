import { redirect } from "next/navigation";
import { exigirSuperAdmin } from "@/lib/super-admin/auth";
import { DetalheEmpresa } from "@/app/superadmin/_components/detalhe-empresa";

export default async function DetalheEmpresaPage({ params }: { params: { id: string } }) {
  const superAdmin = await exigirSuperAdmin();
  if (!superAdmin) redirect("/superadmin/login");
  return <DetalheEmpresa empresaId={params.id} />;
}
