import type { ReactNode } from "react";

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  // A guarda de sessão fica em cada página (exigirSuperAdmin), não aqui,
  // para que /superadmin/login continue acessível sem sessão.
  return <div className="min-h-screen bg-neutral-950 text-neutral-100">{children}</div>;
}
