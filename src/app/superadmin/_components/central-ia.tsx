"use client";

import * as React from "react";
import { toast } from "sonner";
import { Bot, Cpu } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ProvedorInfo {
  configurado: boolean;
  provedor: string;
  modelo: string;
}

interface EmpresaUsoIa {
  empresaId: string;
  empresaNome: string;
  limiteMensal: number | null;
  usoMesAtual: number;
  statusLimite: "sem_limite" | "ok" | "esgotado";
  hoje: { requisicoes: number; tokensEntrada: number; tokensSaida: number; custo: number; porTipo: Record<string, number> };
  mes: { requisicoes: number; tokensEntrada: number; tokensSaida: number; custo: number; porTipo: Record<string, number> };
}

interface CentralIaApi {
  provedores: { whatsapp: ProvedorInfo; copiloto_empresa: ProvedorInfo; copiloto_supremo: ProvedorInfo };
  empresas: EmpresaUsoIa[];
}

const ROTULO_PROVEDOR: Record<string, string> = {
  whatsapp: "IA do WhatsApp",
  copiloto_empresa: "Copiloto da Empresa",
  copiloto_supremo: "Copiloto Supremo",
};

/** Central de IA (PEDIDO 10): provedor/modelo de cada uma das 3 IAs + consumo real por empresa. */
export function CentralDeIa() {
  const [dados, setDados] = React.useState<CentralIaApi | null>(null);

  React.useEffect(() => {
    fetch("/api/superadmin/central-ia")
      .then((r) => r.json())
      .then(setDados)
      .catch(() => toast.error("Falha ao carregar a Central de IA."));
  }, []);

  if (!dados) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {(Object.entries(dados.provedores) as [keyof typeof dados.provedores, ProvedorInfo][]).map(([chave, info]) => (
          <Card key={chave}>
            <CardContent className="flex items-center gap-3 py-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Cpu className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">{ROTULO_PROVEDOR[chave]}</p>
                <p className="text-xs text-muted-foreground">
                  {info.configurado ? `${info.provedor} · ${info.modelo}` : "Não configurada (usa interpretador determinístico)"}
                </p>
              </div>
              <Badge variant={info.configurado ? "default" : "outline"} className="ml-auto">
                {info.configurado ? "Ativa" : "Sem chave"}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 py-6">
          <p className="flex items-center gap-2 font-semibold text-foreground">
            <Bot className="h-5 w-5 text-primary" />
            Consumo por empresa
          </p>
          {dados.empresas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma empresa cadastrada ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Empresa</th>
                    <th className="py-2 pr-3 font-medium">Hoje</th>
                    <th className="py-2 pr-3 font-medium">Este mês</th>
                    <th className="py-2 pr-3 font-medium">Limite mensal</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.empresas.map((e) => (
                    <tr key={e.empresaId} className="border-b border-border/50">
                      <td className="py-2 pr-3 font-medium text-foreground">{e.empresaNome}</td>
                      <td className="py-2 pr-3 tabular">{e.hoje.requisicoes} req.</td>
                      <td className="py-2 pr-3 tabular">{e.mes.requisicoes} req.</td>
                      <td className="py-2 pr-3 tabular">
                        {e.limiteMensal === null ? "Sem limite" : `${e.usoMesAtual} / ${e.limiteMensal}`}
                      </td>
                      <td className="py-2">
                        <Badge variant={e.statusLimite === "esgotado" ? "destructive" : "outline"}>
                          {e.statusLimite === "esgotado" ? "Limite esgotado" : e.statusLimite === "ok" ? "Normal" : "Sem limite"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Para mudar o limite de uma empresa, edite-a na aba &quot;Empresas&quot; (campo &quot;Limite de mensagens de IA&quot;).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
