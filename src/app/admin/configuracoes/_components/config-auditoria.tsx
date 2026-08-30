"use client";

import { toast } from "sonner";
import { ScrollText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { useApi } from "@/lib/api-cliente";

interface RegistroAuditoria {
  id: string;
  criadoEm: string;
  acao: string;
  detalhe: string | null;
  usuarioNome: string | null;
  ip: string | null;
}

const ACAO_ROTULO: Record<string, string> = {
  login: "Login",
  login_falha: "Tentativa de login falhou",
  logout: "Logout",
  senha_recuperada: "Recuperação de senha",
  senha_redefinida: "Senha redefinida",
  senha_alterada: "Senha alterada (admin)",
  usuario_criado: "Usuário criado",
  usuario_atualizado: "Usuário atualizado",
  usuario_ativado: "Usuário ativado",
  usuario_desativado: "Usuário desativado",
  usuario_excluido: "Usuário excluído",
  permissao_alterada: "Permissão alterada",
};

function formatarData(valor: string): string {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  const dia = data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `${dia} · ${hora}`;
}

/**
 * Auditoria (PEDIDO 14): trilha de eventos de autenticação e ações
 * administrativas — `GET /api/auditoria` (somente Administrador).
 */
export function ConfigAuditoria() {
  const { dados, recarregar } = useApi<{ registros: RegistroAuditoria[] }>(
    "/api/auditoria",
    { registros: [] }
  );

  const registros = dados.registros;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {registros.length} eventos registrados (mais recentes primeiro).
        </p>
        <Button variant="outline" size="sm" onClick={recarregar}>
          Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <ScrollText className="h-5 w-5 text-primary" aria-hidden="true" />
            Eventos de autenticação e administração
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Logins, logouts, recuperação de senha e ações administrativas.
          </p>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead className="hidden sm:table-cell">Detalhe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registros.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum evento registrado ainda.
                  </TableCell>
                </TableRow>
              ) : (
                registros.map((registro) => (
                  <TableRow key={registro.id}>
                    <TableCell className="whitespace-nowrap tabular text-muted-foreground">
                      {formatarData(registro.criadoEm)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {ACAO_ROTULO[registro.acao] ?? registro.acao}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {registro.usuarioNome ?? "—"}
                    </TableCell>
                    <TableCell className="hidden max-w-xs truncate text-sm text-muted-foreground sm:table-cell">
                      {registro.detalhe ?? "—"}
                      {registro.ip ? ` (IP ${registro.ip})` : ""}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
