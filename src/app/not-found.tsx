"use client";

import { useRouter } from "next/navigation";
import { SearchX } from "lucide-react";

import { EmptyState } from "@/components/patterns/empty-state";

/** 404 padrão do sistema — mesma linguagem visual do restante do produto. */
export default function NotFound() {
  const router = useRouter();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-xl">
        <EmptyState
          icon={SearchX}
          title="Página não encontrada"
          description="O endereço pode ter mudado ou a página não existe mais."
          actionLabel="Voltar ao início"
          onAction={() => router.push("/")}
        />
      </div>
    </main>
  );
}
