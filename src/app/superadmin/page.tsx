import { exigirSuperAdmin } from "@/lib/super-admin/auth";
import { PainelSuperAdmin } from "./_components/painel";

export default async function SuperAdminPage() {
  const superAdmin = await exigirSuperAdmin();
  return <PainelSuperAdmin nomeSuperAdmin={superAdmin.nome} />;
}
