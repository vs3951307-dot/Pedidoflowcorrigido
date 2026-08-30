"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pizza, Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-cliente";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";

/**
 * Login em DUAS ETAPAS (PEDIDO 4):
 *   1) PedidoFlow → e-mail → resolve a empresa dona daquele e-mail e
 *      mostra "Bem-vindo, {empresa}" (identidade visual da empresa,
 *      quando personalizada — ver src/lib/system-builder.ts).
 *   2) Senha → autentica normalmente (mesma API de sempre,
 *      /api/auth/login) e abre a sessão daquele usuário/empresa.
 *
 * A etapa 1 é só uma camada de UX/identificação — a autenticação REAL
 * (que decide se a senha está certa) continua sendo inteiramente feita
 * na etapa 2, exatamente como antes. Mesmo que a etapa 1 não encontre
 * a empresa (e-mail digitado errado, por exemplo), a etapa 2 aparece
 * do mesmo jeito — não revelamos se um e-mail existe ou não na
 * plataforma através de uma mensagem diferente.
 */

interface EmpresaBoasVindas {
  nome: string;
  logoUrl: string | null;
  corPrimaria: string | null;
}

export default function LoginPage() {
  const router = useRouter();

  const [etapa, setEtapa] = React.useState<1 | 2>(1);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [remember, setRemember] = React.useState(true);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<{ email?: string; password?: string }>({});
  const [empresa, setEmpresa] = React.useState<EmpresaBoasVindas | null>(null);

  async function avancarParaSenha(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      setErrors({ email: "Digite um e-mail válido." });
      return;
    }
    setErrors({});
    setIsLoading(true);
    try {
      const resposta = await fetch("/api/auth/empresa-por-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const corpo = await resposta.json().catch(() => ({ encontrada: false }));
      setEmpresa(corpo.encontrada ? corpo.empresa : null);
    } catch {
      setEmpresa(null);
    } finally {
      setIsLoading(false);
      setEtapa(2);
    }
  }

  function voltarParaEmail() {
    setEtapa(1);
    setPassword("");
    setErrors({});
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      setErrors({ password: "Informe sua senha." });
      return;
    }

    setIsLoading(true);
    try {
      // Autenticação real: valida as credenciais no banco e abre a sessão
      // (cookie httpOnly com expiração de 7 dias) — ver /api/auth/login.
      const result = await api<{ ok: boolean }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, senha: password }),
      });

      if (result.ok) {
        toast.success("Login realizado com sucesso!");
        router.push("/");
      } else {
        toast.error("E-mail ou senha incorretos.");
        setErrors({ password: "E-mail ou senha incorretos." });
      }
    } catch {
      toast.error("E-mail ou senha incorretos.");
      setErrors({ password: "E-mail ou senha incorretos." });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md">
        {/* Marca */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft overflow-hidden"
            style={etapa === 2 && empresa?.corPrimaria ? { backgroundColor: empresa.corPrimaria } : undefined}
          >
            {etapa === 2 && empresa?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={empresa.logoUrl} alt={empresa.nome} className="h-full w-full object-cover" />
            ) : (
              <Pizza className="h-8 w-8" aria-hidden="true" />
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.01em] text-foreground">PedidoFlow</h1>
            <p className="text-base text-muted-foreground">
              {etapa === 2 && empresa ? `Sistemas de ${empresa.nome}` : "Seu sistema, do seu jeito."}
            </p>
          </div>
        </div>

        {etapa === 1 ? (
          <Card>
            <CardHeader className="pb-2">
              <h2 className="text-xl font-semibold tracking-[-0.01em] text-foreground">Entrar</h2>
              <p className="text-sm text-muted-foreground">Digite o e-mail da sua conta para continuar.</p>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-5" onSubmit={avancarParaSenha} noValidate>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? "email-error" : undefined}
                    disabled={isLoading}
                    autoFocus
                  />
                  {errors.email && (
                    <p id="email-error" className="text-sm text-destructive">
                      {errors.email}
                    </p>
                  )}
                </div>
                <Button type="submit" size="lg" className="mt-2 w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : "Continuar"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <button
                type="button"
                onClick={voltarParaEmail}
                className="mb-1 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Trocar e-mail
              </button>
              <h2 className="text-xl font-semibold tracking-[-0.01em] text-foreground">
                {empresa ? `Bem-vindo, ${empresa.nome}` : "Entrar"}
              </h2>
              <p className="text-sm text-muted-foreground">Digite sua senha para acessar.</p>
            </CardHeader>

            <CardContent>
              <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Senha</Label>
                    <a
                      href="/login/recuperar"
                      className="text-sm font-medium text-primary hover:underline underline-offset-4"
                    >
                      Esqueci minha senha
                    </a>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="pr-14"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      aria-invalid={Boolean(errors.password)}
                      aria-describedby={errors.password ? "password-error" : undefined}
                      disabled={isLoading}
                      autoFocus
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
                  {errors.password && (
                    <p id="password-error" className="text-sm text-destructive">
                      {errors.password}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/50 px-4 py-3">
                  <Label htmlFor="remember" className="cursor-pointer font-medium">
                    Manter-me conectado
                  </Label>
                  <Switch id="remember" checked={remember} onCheckedChange={setRemember} disabled={isLoading} />
                </div>

                <Button type="submit" size="lg" className="mt-2 w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                      Entrando...
                    </>
                  ) : (
                    "Entrar"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Precisa de ajuda? Fale com o suporte da sua unidade.
        </p>
      </div>
    </main>
  );
}
