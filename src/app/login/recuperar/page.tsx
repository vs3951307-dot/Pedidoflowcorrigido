"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { KeyRound, Loader2, MailCheck, Pizza } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { api } from "@/lib/api-cliente";

interface RespostaRecuperar {
  ok: boolean;
  mensagem: string;
  token?: string;
  link?: string;
  expiraEmMinutos?: number;
}

/**
 * Recuperação de senha (PEDIDO 14). Sem envio de e-mail na unidade, o
 * token gerado é exibido na tela (fluxo de demonstração) para abrir o
 * link de redefinição.
 */
export default function RecuperarSenhaPage() {
  const [email, setEmail] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [resultado, setResultado] = React.useState<RespostaRecuperar | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      toast.error("Digite um e-mail válido.");
      return;
    }
    setIsLoading(true);
    try {
      const dados = await api<RespostaRecuperar>("/api/auth/recuperar", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setResultado(dados);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível solicitar a recuperação.");
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
            <p className="text-base text-muted-foreground">Recuperar senha</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-foreground">
              Recuperar senha
            </h2>
            <p className="text-sm text-muted-foreground">
              Informe seu e-mail para receber um link de redefinição.
            </p>
          </CardHeader>
          <CardContent>
            {!resultado ? (
              <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <Button type="submit" size="lg" className="mt-2 w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                      Enviando...
                    </>
                  ) : (
                    "Enviar instruções"
                  )}
                </Button>
              </form>
            ) : (
              <div className="flex flex-col gap-5">
                <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/50 p-4">
                  <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <div className="flex flex-col gap-1 text-sm">
                    <p className="text-foreground">{resultado.mensagem}</p>
                    {resultado.token ? (
                      <>
                        <p className="text-muted-foreground">
                          Link de redefinição (válido por {resultado.expiraEmMinutos ?? 30} min):
                        </p>
                        <a
                          href={resultado.link}
                          className="break-all font-medium text-primary hover:underline underline-offset-4"
                        >
                          {resultado.link}
                        </a>
                      </>
                    ) : null}
                  </div>
                </div>
                <Button size="lg" variant="outline" className="w-full" onClick={() => setResultado(null)}>
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                  Solicitar novamente
                </Button>
              </div>
            )}
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
