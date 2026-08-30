"use client";

import * as React from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatBRL } from "@/lib/utils";
import { useApi } from "@/lib/api-cliente";
import {
  Banknote,
  Bike,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Loader2,
  MapPin,
  Wallet,
  QrCode,
} from "lucide-react";

interface DetalheEntrega {
  id: string;
  numeroPedido: number;
  cliente: string | null;
  valor: number;
  forma: string | null;
  status: string;
  troco: number;
  repassadoAoCaixa: boolean;
  criadoEm: string;
}

interface TotaisPorForma {
  dinheiro: number;
  cartao: number;
  pix: number;
  total: number;
}

interface EntregadorPagamento {
  id: string;
  nome: string;
  statusHoje: string;
  ativo: boolean;
  entregas: number;
  recebido: TotaisPorForma;
  aConferir: TotaisPorForma;
  detalhes: DetalheEntrega[];
}

interface RespostaRelatorio {
  periodo: string;
  rotulo: string;
  recebido: TotaisPorForma;
  aConferir: TotaisPorForma;
  entregadores: EntregadorPagamento[];
  totalEntregas: number;
  resumo: { cadastrados: number; ativos: number; emAtividade: number };
}

const FALLBACK: RespostaRelatorio = {
  periodo: "hoje",
  rotulo: "Hoje",
  recebido: { dinheiro: 0, cartao: 0, pix: 0, total: 0 },
  aConferir: { dinheiro: 0, cartao: 0, pix: 0, total: 0 },
  entregadores: [],
  totalEntregas: 0,
  resumo: { cadastrados: 0, ativos: 0, emAtividade: 0 },
};

const PERIODOS = [
  { chave: "hoje", rotulo: "Hoje" },
  { chave: "7dias", rotulo: "7 dias" },
  { chave: "30dias", rotulo: "30 dias" },
  { chave: "90dias", rotulo: "90 dias" },
];

const ROTULO_FORMA: Record<string, string> = {
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  pix: "Pix",
};

function formatarData(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) +
    " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formaLegivel(forma: string | null) {
  if (!forma) return { rotulo: "—", icone: null as React.ReactNode };
  const f = forma.toLowerCase();
  if (f === "dinheiro") return { rotulo: "Dinheiro", icone: <Banknote className="h-3.5 w-3.5" aria-hidden="true" /> };
  if (f === "pix") return { rotulo: "Pix", icone: <QrCode className="h-3.5 w-3.5" aria-hidden="true" /> };
  return { rotulo: "Cartão", icone: <CreditCard className="h-3.5 w-3.5" aria-hidden="true" /> };
}

function statusLegivel(status: string) {
  if (status === "confirmado") return { rotulo: "Confirmado", classe: "text-green-600" };
  if (status === "divergente") return { rotulo: "Divergente", classe: "text-yellow-600" };
  if (status === "pendente") return { rotulo: "Pendente", classe: "text-red-600" };
  return { rotulo: "Sem pagamento", classe: "text-muted-foreground" };
}

function statusEntregador(statusHoje: string, ativo: boolean) {
  if (!ativo) return { rotulo: "Inativo", classe: "text-muted-foreground" };
  if (statusHoje === "rota") return { rotulo: "Na rota", classe: "text-green-600" };
  if (statusHoje === "folga") return { rotulo: "Folga", classe: "text-muted-foreground" };
  return { rotulo: "Ativo", classe: "text-blue-600" };
}

function CardResumo({ titulo, valor, icone, cor }: { titulo: string; valor: string; icone: React.ReactNode; cor?: string }) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground", cor)}>
            {icone}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{titulo}</p>
            <p className="truncate text-lg font-semibold tabular">{valor}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function EntregadoresPagamentosPage() {
  const [periodo, setPeriodo] = React.useState("hoje");
  const [expansos, setExpansos] = React.useState<Set<string>>(new Set());

  const { dados, carregando } = useApi<RespostaRelatorio>(
    `/api/relatorios/entregadores-pagamentos?periodo=${periodo}`,
    FALLBACK
  );

  const alternarExpanso = (id: string) => {
    setExpansos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  };

  const totalAReceberDinheiro = dados.entregadores.reduce(
    (acc, e) =>
      acc + e.detalhes.filter((d) => d.status === "confirmado" && d.forma === "dinheiro" && !d.repassadoAoCaixa).reduce((s, d) => s + d.valor, 0),
    0
  );

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="p-6 pb-3 sm:p-7 sm:pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Wallet className="h-5 w-5 text-primary" aria-hidden="true" />
                Entregadores - Pagamentos
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Relatório de entregas e pagamentos por entregador. Use para conferir o dinheiro do período.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {PERIODOS.map((p) => (
                <Button
                  key={p.chave}
                  size="sm"
                  variant={periodo === p.chave ? "primary" : "outline"}
                  onClick={() => setPeriodo(p.chave)}
                  aria-pressed={periodo === p.chave}
                >
                  {p.rotulo}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-4 sm:p-7 sm:pt-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <CardResumo
              titulo="Total recebido"
              valor={formatBRL(dados.recebido.total)}
              icone={<Wallet className="h-5 w-5" aria-hidden="true" />}
            />
            <CardResumo
              titulo="Dinheiro"
              valor={formatBRL(dados.recebido.dinheiro)}
              icone={<Banknote className="h-5 w-5" aria-hidden="true" />}
            />
            <CardResumo
              titulo="Cartão"
              valor={formatBRL(dados.recebido.cartao)}
              icone={<CreditCard className="h-5 w-5" aria-hidden="true" />}
            />
            <CardResumo
              titulo="Pix"
              valor={formatBRL(dados.recebido.pix)}
              icone={<QrCode className="h-5 w-5" aria-hidden="true" />}
            />
            <CardResumo
              titulo="A conferir"
              valor={formatBRL(dados.aConferir.total)}
              icone={<Loader2 className="h-5 w-5" aria-hidden="true" />}
              cor="text-amber-600"
            />
          </div>
          {totalAReceberDinheiro > 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <Banknote className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <strong>{formatBRL(totalAReceberDinheiro)}</strong> em dinheiro confirmado ainda não repassado ao caixa.
              </span>
            </div>
          )}
          <div className="mt-4 grid grid-cols-3 gap-3">
            <CardResumo
              titulo="Entregadores na rota hoje"
              valor={String(dados.resumo.emAtividade)}
              icone={<Bike className="h-5 w-5" aria-hidden="true" />}
            />
            <CardResumo
              titulo="Entregadores ativos"
              valor={String(dados.resumo.ativos)}
              icone={<Bike className="h-5 w-5" aria-hidden="true" />}
            />
            <CardResumo
              titulo="Entregas no período"
              valor={String(dados.totalEntregas)}
              icone={<MapPin className="h-5 w-5" aria-hidden="true" />}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Bike className="h-5 w-5 text-primary" aria-hidden="true" />
            Por entregador
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Clique em um entregador para ver cada entrega e o pagamento coletado.
          </p>
        </CardHeader>
        <CardContent className="p-6 pt-4 sm:p-7 sm:pt-4">
          {carregando && dados.entregadores.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando relatório…
            </p>
          ) : dados.entregadores.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum entregador cadastrado.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Entregador</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Entregas</TableHead>
                    <TableHead className="text-right">Dinheiro</TableHead>
                    <TableHead className="text-right">Cartão</TableHead>
                    <TableHead className="text-right">Pix</TableHead>
                    <TableHead className="text-right">Total recebido</TableHead>
                    <TableHead className="text-right">A conferir</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dados.entregadores.map((e) => {
                    const aberto = expansos.has(e.id);
                    const stEntregador = statusEntregador(e.statusHoje, e.ativo);
                    return (
                      <React.Fragment key={e.id}>
                        <TableRow className="cursor-pointer" onClick={() => alternarExpanso(e.id)}>
                          <TableCell>
                            {aberto ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{e.nome}</TableCell>
                          <TableCell>
                            <span className={stEntregador.classe}>{stEntregador.rotulo}</span>
                          </TableCell>
                          <TableCell className="text-right tabular">{e.entregas}</TableCell>
                          <TableCell className="text-right tabular">{formatBRL(e.recebido.dinheiro)}</TableCell>
                          <TableCell className="text-right tabular">{formatBRL(e.recebido.cartao)}</TableCell>
                          <TableCell className="text-right tabular">{formatBRL(e.recebido.pix)}</TableCell>
                          <TableCell className="text-right tabular font-semibold">{formatBRL(e.recebido.total)}</TableCell>
                          <TableCell className="text-right tabular">{formatBRL(e.aConferir.total)}</TableCell>
                        </TableRow>
                        {aberto && (
                          <TableRow>
                            <TableCell colSpan={9} className="bg-muted/30 p-4">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Pedido</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead className="text-right">Data</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                    <TableHead className="text-right">Forma</TableHead>
                                    <TableHead className="text-right">Status</TableHead>
                                    <TableHead>Observação</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {e.detalhes.map((d) => {
                                    const forma = formaLegivel(d.forma);
                                    const st = statusLegivel(d.status);
                                    return (
                                      <TableRow key={d.id}>
                                        <TableCell className="font-medium">#{d.numeroPedido}</TableCell>
                                        <TableCell>{d.cliente ?? "—"}</TableCell>
                                        <TableCell className="text-right tabular">{formatarData(d.criadoEm)}</TableCell>
                                        <TableCell className="text-right tabular">{formatBRL(d.valor)}</TableCell>
                                        <TableCell className="text-right">
                                          <span className="inline-flex items-center gap-1.5">{forma.icone}{forma.rotulo}</span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                          <span className={st.classe}>{st.rotulo}</span>
                                        </TableCell>
                                        <TableCell>
                                          {d.status === "confirmado" && d.forma === "dinheiro" && !d.repassadoAoCaixa ? (
                                            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                                              A repassar ao caixa
                                            </Badge>
                                          ) : d.troco > 0 ? (
                                            <span className="text-xs text-muted-foreground">Troco para: {formatBRL(d.troco)}</span>
                                          ) : null}
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-muted-foreground">
                Confira a soma do dinheiro deste período:{" "}
                <strong className="tabular">{formatBRL(dados.recebido.dinheiro)}</strong> + cartão{" "}
                <strong className="tabular">{formatBRL(dados.recebido.cartao)}</strong> + pix{" "}
                <strong className="tabular">{formatBRL(dados.recebido.pix)}</strong> ={" "}
                <strong className="tabular">{formatBRL(dados.recebido.total)}</strong>.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
