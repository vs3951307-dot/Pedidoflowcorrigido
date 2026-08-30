"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Pizza, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { api } from "@/lib/api-cliente";

/**
 * Redefinição de senha com o token de recuperação (uso único, 30 min).
 * Após redefinir, todas as sessões do usuário são revogadas.
 */
export default function RedefinirSenhaPage() {
  return (
    <React.Suspense fallback={null}>
      <RedefinirSenha />
    </React.Suspense>
  );
}

function RedefinirSenha() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenInicial = searchParams.get("token") ?? "";

  const [token, setToken] = React.useState(tokenInicial);
  const [novaSenha, setNovaSenha] = React.useState("");
  const [confirmacao, setConfirmacao] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) {
      toast.error("Informe o token de recuperação.");
      return;
    }
    if (novaSenha.length < 8) {
      toast.error("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (novaSenha !== confirmacao) {
      toast.error("As senhas não conferem.");
      return;
    }

    setIsLoading(true);
    try {
      await api("/api/auth/redefinir", {
        method: "POST",
        body: JSON.stringify({ token: token.trim(), novaSenha }),
      });
      toast.success("Senha redefinida com sucesso!");
      router.push("/login");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível redefinir a senha.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
            <Pizza className="h-8 w-8" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.01em] text-foreground">PedidoFlow</h1>
            <p className="text-base text-muted-foreground">Redefinir senha</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-foreground">
              Definir nova senha
            </h2>
            <p className="text-sm text-muted-foreground">
              Informe o token recebido e a nova senha (mínimo 8 caracteres).
            </p>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
              <div className="flex flex-col gap-2">
                <Label htmlFor="token">Token de recuperação</Label>
                <Input
                  id="token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Cole o token recebido"
                  disabled={isLoading}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="novaSenha">Nova senha</Label>
                <div className="relative">
                  <Input
                    id="novaSenha"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="pr-14"
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute inset-y-0 right-0 flex w-14 items-center justify-center text-muted-foreground transition-colors duration-150 hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <Eye className="h-5 w-5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="confirmacao">Confirmar nova senha</Label>
                <Input
                  id="confirmacao"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <p>
                  Ao redefinir, todas as sessões abertas deste usuário serão encerradas.
                </p>
              </div>

              <Button type="submit" size="lg" className="mt-2 w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    Salvando...
                  </>
                ) : (
                  "Redefinir senha"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary hover:underline underline-offset-4">
            Voltar para o login
          </Link>
        </p>
      </div>
    </main>
  );
}
