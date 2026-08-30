"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api-cliente";

/**
 * "Alterar senha" — qualquer usuário logado (Administrador, Caixa,
 * Garçom, Cozinha, Entregador) troca a própria senha, sem precisar de
 * permissão administrativa. Ver `PATCH /api/auth/senha`.
 */
export function AlterarSenhaDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [senhaAtual, setSenhaAtual] = React.useState("");
  const [novaSenha, setNovaSenha] = React.useState("");
  const [confirmarSenha, setConfirmarSenha] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);

  function limpar() {
    setSenhaAtual("");
    setNovaSenha("");
    setConfirmarSenha("");
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (novaSenha !== confirmarSenha) {
      toast.error("A confirmação não bate com a nova senha.");
      return;
    }
    if (novaSenha.length < 8) {
      toast.error("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    setEnviando(true);
    try {
      await api("/api/auth/senha", {
        method: "PATCH",
        body: JSON.stringify({ senhaAtual, novaSenha }),
      });
      toast.success("Senha alterada com sucesso.");
      limpar();
      onOpenChange(false);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível alterar a senha.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) limpar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar senha</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={enviar}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="senha-atual">Senha atual</Label>
            <Input
              id="senha-atual"
              type="password"
              autoComplete="current-password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nova-senha">Nova senha</Label>
            <Input
              id="nova-senha"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmar-senha">Confirmar nova senha</Label>
            <Input
              id="confirmar-senha"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Ao confirmar, você continua logado neste aparelho; os demais precisam entrar de novo com a senha nova.
          </p>
          <Button type="submit" disabled={enviando} className="mt-1">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salvar nova senha
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
