"use client";

import { useRouter } from "next/navigation";
import { Construction } from "lucide-react";

import { EmptyState } from "@/components/patterns/empty-state";

/**
 * Módulos ainda não construídos (Entregador, Administrador) apontam para
 * cá em vez de cair num 404. Quando o módulo existir, basta trocar o href
 * no seletor da home (`src/app/page.tsx`).
 */
export default function EmBrevePage() {
  const router = useRouter();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-xl">
        <EmptyState
          icon={Construction}
          title="Módulo em construção"
          description="Este módulo ainda não está disponível. Volte ao início para escolher outra opção."
          actionLabel="Voltar ao início"
          onAction={() => router.push("/")}
        />
      </div>
    </main>
  );
}
