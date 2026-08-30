"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Key } from "lucide-react";

interface EmpresaResumo {
  id: string;
  nome: string;
}

/**
 * Reset de senha por EMPRESA.
 *
 * Antes esta tela resetava todos os usuários de todas as empresas e o
 * próprio Super Admin, e já vinha com a senha preenchida — bastava um
 * clique acidental. Agora exige escolher a empresa explicitamente e
 * digitar uma senha de 12+ caracteres; o Super Admin não é afetado.
 */
export default function ResetarSenhasPage() {
  const [empresas, setEmpresas] = React.useState<EmpresaResumo[]>([]);
  const [empresaId, setEmpresaId] = React.useState("");
  const [senha, setSenha] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [resultado, setResultado] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const r = await fetch("/api/superadmin/empresas");
        const c = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(c.erro ?? "Não foi possível carregar as empresas.");
        const lista: EmpresaResumo[] = (c.empresas ?? []).map((e: { id: string; nome: string }) => ({
          id: e.id,
          nome: e.nome,
        }));
        if (!cancelado) setEmpresas(lista);
      } catch (e) {
        if (!cancelado) toast.error(e instanceof Error ? e.message : "Erro ao carregar empresas.");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const empresaEscolhida = empresas.find((e) => e.id === empresaId);
  const podeEnviar = Boolean(empresaId) && senha.length >= 12 && !enviando;

  async function resetar() {
    if (!empresaEscolhida) return;
    const confirmado = window.confirm(
      `Redefinir a senha de TODOS os usuários da empresa "${empresaEscolhida.nome}"?\n\n` +
        "Todas as sessões dessa empresa serão encerradas. Nenhuma outra empresa é afetada."
    );
    if (!confirmado) return;

    setEnviando(true);
    setResultado(null);
    try {
      const r = await fetch("/api/superadmin/resetar-senhas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresaId, senha }),
      });
      const c = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(c.erro ?? "Falha.");
      setResultado(c.mensagem);
      setSenha("");
      toast.success("Senhas redefinidas.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Resetar senhas de uma empresa
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Redefine a senha de todos os usuários da empresa escolhida e encerra as sessões dela. Outras
            empresas e o Super Admin não são afetados.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label>Empresa</Label>
            <Select value={empresaId} onValueChange={setEmpresaId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha a empresa" />
              </SelectTrigger>
              <SelectContent>
                {empresas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Nova senha (mínimo 12 caracteres)</Label>
            <Input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              minLength={12}
              autoComplete="new-password"
            />
          </div>
          <Button onClick={resetar} disabled={!podeEnviar}>
            {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Key className="mr-2 h-4 w-4" />}
            Redefinir senhas desta empresa
          </Button>
          {resultado && (
            <p className="rounded bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              {resultado}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
