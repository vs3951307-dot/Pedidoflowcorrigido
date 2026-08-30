"use client";

import { toast } from "sonner";
import { CloudUpload, Database, DatabaseBackup, Download, History } from "lucide-react";

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
import { cn } from "@/lib/utils";
import { api, useApi } from "@/lib/api-cliente";
import { type RegistroBackup, type StatusBackup } from "@/lib/configuracoes";

interface UltimoBackupApi {
  data: string;
  hora: string;
  tamanho: string;
  destino: string;
}

interface BackupsApi {
  ultimoBackup: UltimoBackupApi | null;
  backups: RegistroBackup[];
}

const STATUS_BACKUP_CONFIG: Record<StatusBackup, { label: string; classes: string; dot: string }> =
  {
    concluido: {
      label: "Concluído",
      classes: "bg-status-free-bg text-status-free border-status-free-border",
      dot: "bg-status-free",
    },
    falhou: {
      label: "Falhou",
      classes: "bg-status-occupied-bg text-status-occupied border-status-occupied-border",
      dot: "bg-status-occupied",
    },
    em_andamento: {
      label: "Em andamento",
      classes: "bg-status-waiting-bg text-status-waiting border-status-waiting-border",
      dot: "bg-status-waiting",
    },
  };

/**
 * Backup — cópia de segurança dos dados. `GET /api/backups` lista os
 * registros reais da empresa; o botão gera uma cópia real (snapshot JSON
 * em prisma/backups/) via `POST` e recarrega a lista. Sem registros, a
 * tela mostra estado vazio de verdade.
 */
export function ConfigBackup() {
  const { dados, recarregar } = useApi<BackupsApi>("/api/backups", {
    ultimoBackup: null,
    backups: [],
  });
  const ultimoBackup = dados.ultimoBackup ?? null;

  const fazerBackup = async () => {
    try {
      await api("/api/backups", { method: "POST" });
      toast.success("Backup gerado com sucesso.");
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao gerar backup");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Database className="h-5 w-5 text-primary" aria-hidden="true" />
            Último backup
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-6 pt-4 sm:flex-row sm:items-center sm:justify-between sm:p-7 sm:pt-4">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-status-free-bg text-status-free">
              <DatabaseBackup className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              {ultimoBackup ? (
                <>
                  <p className="font-semibold tabular">
                    {ultimoBackup.data} às {ultimoBackup.hora}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {ultimoBackup.tamanho} · {ultimoBackup.destino}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum backup realizado ainda. Gere o primeiro agora.
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={fazerBackup}>
              <CloudUpload className="h-4 w-4" aria-hidden="true" />
              Fazer backup agora
            </Button>
            <Button
              variant="outline"
              onClick={() => toast.info("Restauração não disponível no momento.")}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Restaurar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <History className="h-5 w-5 text-primary" aria-hidden="true" />
            Histórico
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Backups manuais (cópia real do banco em prisma/backups/) e registros anteriores.
          </p>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Hora</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Tamanho</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.backups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhum backup registrado ainda.
                  </TableCell>
                </TableRow>
              )}
              {dados.backups.map((backup) => {
                const cfg = STATUS_BACKUP_CONFIG[backup.status];
                return (
                  <TableRow key={`${backup.data}-${backup.hora}`}>
                    <TableCell className="font-medium tabular">{backup.data}</TableCell>
                    <TableCell className="text-right tabular">{backup.hora}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{backup.tipo}</TableCell>
                    <TableCell className="text-right tabular">{backup.tamanho}</TableCell>
                    <TableCell className="text-muted-foreground">{backup.destino}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
                          cfg.classes
                        )}
                      >
                        <span className={cn("h-2 w-2 rounded-full", cfg.dot)} aria-hidden="true" />
                        {cfg.label}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
