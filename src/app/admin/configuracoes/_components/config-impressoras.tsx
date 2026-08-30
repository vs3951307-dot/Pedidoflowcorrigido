"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Printer, PrinterCheck, Trash2, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api, useApi } from "@/lib/api-cliente";
import { VisualizacaoImpressao } from "@/components/impressao/visualizacao-impressao";
import { EmptyState } from "@/components/patterns/empty-state";

type DestinoImpressora =
  | "cozinha" | "caixa" | "balcao" | "retirada" | "delivery"
  | "mesa" | "fechamento_caixa" | "cupom_nao_fiscal" | "outros";

const DESTINOS: { valor: DestinoImpressora; rotulo: string }[] = [
  { valor: "cozinha", rotulo: "Cozinha" },
  { valor: "caixa", rotulo: "Caixa" },
  { valor: "balcao", rotulo: "Balcão" },
  { valor: "retirada", rotulo: "Retirada" },
  { valor: "delivery", rotulo: "Delivery" },
  { valor: "mesa", rotulo: "Comanda de mesa" },
  { valor: "fechamento_caixa", rotulo: "Fechamento de caixa" },
  { valor: "cupom_nao_fiscal", rotulo: "Cupom não fiscal" },
  { valor: "outros", rotulo: "Outros documentos" },
];

const TIPOS_CONEXAO: { valor: string; rotulo: string }[] = [
  { valor: "windows", rotulo: "Instalada no Windows" },
  { valor: "usb_agente", rotulo: "USB (via agente local)" },
  { valor: "rede_ip", rotulo: "Rede / IP" },
  { valor: "escpos_agente", rotulo: "ESC/POS (via agente local)" },
];

const FABRICANTES_SUGERIDOS = ["Elgin", "Epson", "Bematech", "Daruma", "Outra"];

interface Impressora {
  id: string;
  nome: string;
  modelo: string | null;
  fabricante: string | null;
  tipoConexao: string;
  nomeWindows: string | null;
  enderecoIp: string | null;
  porta: string | null;
  larguraPapel: string;
  vias: number;
  impressaoAutomatica: boolean;
  destinos: DestinoImpressora[];
  computadorVinculado: string | null;
  ultimaComunicacaoEm: string | null;
  statusOnline: boolean;
  ativa: boolean;
}

interface ImpressorasApi {
  impressoras: Impressora[];
}

interface ComputadorDetectado {
  computador: string;
  impressoras: string[];
  online: boolean;
}

interface FormularioImpressora {
  nome: string;
  modelo: string;
  fabricante: string;
  tipoConexao: string;
  nomeWindows: string;
  enderecoIp: string;
  porta: string;
  larguraPapel: string;
  vias: string;
  impressaoAutomatica: boolean;
  destinos: DestinoImpressora[];
  computadorVinculado: string;
}

const FORM_VAZIO: FormularioImpressora = {
  nome: "",
  modelo: "",
  fabricante: "",
  tipoConexao: "windows",
  nomeWindows: "",
  enderecoIp: "",
  porta: "9100",
  larguraPapel: "80mm",
  vias: "1",
  impressaoAutomatica: true,
  destinos: [],
  computadorVinculado: "",
};

function paraFormulario(i: Impressora): FormularioImpressora {
  return {
    nome: i.nome,
    modelo: i.modelo ?? "",
    fabricante: i.fabricante ?? "",
    tipoConexao: i.tipoConexao,
    nomeWindows: i.nomeWindows ?? "",
    enderecoIp: i.enderecoIp ?? "",
    porta: i.porta ?? "",
    larguraPapel: i.larguraPapel,
    vias: String(i.vias),
    impressaoAutomatica: i.impressaoAutomatica,
    destinos: i.destinos,
    computadorVinculado: i.computadorVinculado ?? "",
  };
}

function formatarUltimoContato(iso: string | null): string {
  if (!iso) return "nunca";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

type EstadoTeste = "enviando" | "impresso" | "falha" | "agente_offline" | "impressora_nao_encontrada" | null;

/**
 * Impressoras — CRUD real por empresa (antes: JSON solto, um destino por
 * impressora, sem status). Cada impressora agora pode atender vários
 * destinos ao mesmo tempo (ex.: cozinha cobre balcão+retirada+delivery+
 * mesa), tem status online calculado pelo heartbeat do agente, e pode
 * ser associada a um computador (com as impressoras que o agente detectou
 * naquela máquina, pra não precisar digitar o nome de cabeça).
 */
export function ConfigImpressoras() {
  const { dados, recarregar } = useApi<ImpressorasApi>("/api/impressoras", { impressoras: [] });
  const deteccao = useApi<{ computadores: ComputadorDetectado[] }>("/api/impressoras/deteccao", { computadores: [] });

  const [dialogoAberto, setDialogoAberto] = React.useState(false);
  const [editando, setEditando] = React.useState<Impressora | null>(null);
  const [formulario, setFormulario] = React.useState<FormularioImpressora>(FORM_VAZIO);
  const [enviando, setEnviando] = React.useState(false);
  const [excluindo, setExcluindo] = React.useState<Impressora | null>(null);

  const [teste, setTeste] = React.useState<{ nome: string; conteudo: string } | null>(null);
  const [estadoTeste, setEstadoTeste] = React.useState<Record<string, EstadoTeste>>({});

  // Atualiza a lista de detecção sempre que o diálogo abre — o agente
  // pode ter reportado impressoras novas desde a última visita à tela.
  React.useEffect(() => {
    if (dialogoAberto) deteccao.recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogoAberto]);

  function abrirNovo() {
    setEditando(null);
    setFormulario(FORM_VAZIO);
    setDialogoAberto(true);
  }

  function abrirEdicao(i: Impressora) {
    setEditando(i);
    setFormulario(paraFormulario(i));
    setDialogoAberto(true);
  }

  function alternarDestino(destino: DestinoImpressora) {
    setFormulario((f) => ({
      ...f,
      destinos: f.destinos.includes(destino) ? f.destinos.filter((d) => d !== destino) : [...f.destinos, destino],
    }));
  }

  async function salvar() {
    if (!formulario.nome.trim()) {
      toast.error("Informe o nome da impressora.");
      return;
    }
    if (formulario.destinos.length === 0) {
      toast.error("Selecione ao menos um destino/função.");
      return;
    }
    if (formulario.tipoConexao === "windows" && !formulario.nomeWindows.trim()) {
      toast.error("Informe qual impressora do Windows usar (ou escolha uma detectada abaixo).");
      return;
    }
    if (formulario.tipoConexao === "rede_ip" && !formulario.enderecoIp.trim()) {
      toast.error("Informe o endereço IP da impressora.");
      return;
    }

    const corpo = {
      nome: formulario.nome.trim(),
      modelo: formulario.modelo.trim() || undefined,
      fabricante: formulario.fabricante.trim() || undefined,
      tipoConexao: formulario.tipoConexao,
      nomeWindows: formulario.nomeWindows.trim() || undefined,
      enderecoIp: formulario.enderecoIp.trim() || undefined,
      porta: formulario.porta.trim() || undefined,
      larguraPapel: formulario.larguraPapel,
      vias: Number(formulario.vias) || 1,
      impressaoAutomatica: formulario.impressaoAutomatica,
      destinos: formulario.destinos,
      computadorVinculado: formulario.computadorVinculado.trim() || undefined,
    };

    setEnviando(true);
    try {
      if (editando) {
        await api(`/api/impressoras/${editando.id}`, { method: "PATCH", body: JSON.stringify(corpo) });
        toast.success(`"${corpo.nome}" atualizada.`);
      } else {
        await api("/api/impressoras", { method: "POST", body: JSON.stringify(corpo) });
        toast.success(`"${corpo.nome}" cadastrada.`);
      }
      setDialogoAberto(false);
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar a impressora.");
    } finally {
      setEnviando(false);
    }
  }

  async function excluir() {
    if (!excluindo) return;
    try {
      await api(`/api/impressoras/${excluindo.id}`, { method: "DELETE" });
      toast.success(`"${excluindo.nome}" excluída.`);
      setExcluindo(null);
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível excluir.");
    }
  }

  async function testarImpressao(impressora: Impressora) {
    if (!impressora.statusOnline) {
      setEstadoTeste((s) => ({ ...s, [impressora.id]: "agente_offline" }));
      toast.error(
        `Agente offline para "${impressora.nome}" — o teste será enfileirado, mas só imprime quando o agente reconectar.`
      );
    } else {
      setEstadoTeste((s) => ({ ...s, [impressora.id]: "enviando" }));
    }

    try {
      const resposta = await api<{ ok: boolean; item?: { conteudo?: string }; erro?: string }>("/api/impressao", {
        method: "POST",
        body: JSON.stringify({ tipo: "teste", impressoraId: impressora.id }),
      });
      if (resposta.item?.conteudo) {
        setTeste({ nome: impressora.nome, conteudo: resposta.item.conteudo });
        setEstadoTeste((s) => ({ ...s, [impressora.id]: impressora.statusOnline ? "enviando" : "agente_offline" }));
        if (impressora.statusOnline) {
          toast.success("Teste enfileirado — aguardando confirmação do agente.");
        }
      } else {
        setEstadoTeste((s) => ({ ...s, [impressora.id]: "impressora_nao_encontrada" }));
        toast.error(resposta.erro ?? "Não foi possível enfileirar o teste.");
      }
    } catch (erro) {
      setEstadoTeste((s) => ({ ...s, [impressora.id]: "falha" }));
      toast.error(erro instanceof Error ? erro.message : "Falha ao enfileirar o teste de impressão.");
    }
  }

  const detectadasNoComputador = deteccao.dados.computadores.find(
    (c) => c.computador === formulario.computadorVinculado
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {dados.impressoras.length} impressora(s) cadastrada(s) — atende marcas Elgin, Epson, Bematech, Daruma e
          outras ESC/POS compatíveis.
        </p>
        <Button onClick={abrirNovo}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nova impressora
        </Button>
      </div>

      {dados.impressoras.length === 0 ? (
        <EmptyState
          icon={Printer}
          title="Nenhuma impressora configurada"
          description='Clique em "Nova impressora" para cadastrar. A impressão física acontece através do agente local instalado no computador do estabelecimento (ver scripts/agente-impressao).'
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {dados.impressoras.map((impressora) => {
            const estado = estadoTeste[impressora.id];
            return (
              <Card key={impressora.id}>
                <CardContent className="flex flex-col gap-4 p-6 sm:p-7">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                        <Printer className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold">{impressora.nome}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {[impressora.fabricante, impressora.modelo].filter(Boolean).join(" ") || "—"} ·{" "}
                          {TIPOS_CONEXAO.find((t) => t.valor === impressora.tipoConexao)?.rotulo}
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
                        impressora.statusOnline
                          ? "bg-status-free-bg text-status-free border-status-free-border"
                          : "bg-status-occupied-bg text-status-occupied border-status-occupied-border"
                      )}
                    >
                      <span
                        className={cn("h-2 w-2 rounded-full", impressora.statusOnline ? "bg-status-free" : "bg-status-occupied")}
                        aria-hidden="true"
                      />
                      {impressora.statusOnline ? "Online" : "Offline"}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {impressora.destinos.map((d) => (
                      <span
                        key={d}
                        className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground"
                      >
                        {DESTINOS.find((x) => x.valor === d)?.rotulo ?? d}
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Papel / vias</p>
                      <p className="font-medium">{impressora.larguraPapel} · {impressora.vias} via(s)</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Último contato</p>
                      <p className="font-medium">{formatarUltimoContato(impressora.ultimaComunicacaoEm)}</p>
                    </div>
                  </div>

                  {estado ? (
                    <div
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
                        estado === "impresso" && "border-status-free-border bg-status-free-bg text-status-free",
                        estado === "enviando" && "border-border bg-secondary/50 text-muted-foreground",
                        (estado === "falha" || estado === "impressora_nao_encontrada") &&
                          "border-status-occupied-border bg-status-occupied-bg text-status-occupied",
                        estado === "agente_offline" && "border-status-waiting-border bg-status-waiting-bg text-status-waiting"
                      )}
                    >
                      {estado === "enviando" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      {estado === "agente_offline" && <WifiOff className="h-4 w-4" aria-hidden="true" />}
                      {estado === "enviando" && "Enviando para a fila…"}
                      {estado === "agente_offline" && "Enfileirado — agente offline, aguardando reconexão."}
                      {estado === "falha" && "Falha ao enfileirar o teste."}
                      {estado === "impressora_nao_encontrada" && "Impressora não encontrada."}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                    <Button size="sm" onClick={() => testarImpressao(impressora)}>
                      <PrinterCheck className="h-4 w-4" aria-hidden="true" />
                      Testar impressão
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => abrirEdicao(impressora)}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      Editar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setExcluindo(impressora)}>
                      <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Diálogo criar/editar */}
      <Dialog open={dialogoAberto} onOpenChange={setDialogoAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? `Editar "${editando.nome}"` : "Nova impressora"}</DialogTitle>
            <DialogDescription>
              A impressão física acontece pelo agente local instalado no computador do estabelecimento.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="imp-nome">Nome</Label>
                <Input
                  id="imp-nome"
                  placeholder="Ex.: Cozinha"
                  value={formulario.nome}
                  onChange={(e) => setFormulario((f) => ({ ...f, nome: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="imp-fabricante">Fabricante</Label>
                <Input
                  id="imp-fabricante"
                  list="fabricantes-sugeridos"
                  placeholder="Ex.: Elgin"
                  value={formulario.fabricante}
                  onChange={(e) => setFormulario((f) => ({ ...f, fabricante: e.target.value }))}
                />
                <datalist id="fabricantes-sugeridos">
                  {FABRICANTES_SUGERIDOS.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="imp-modelo">Modelo (opcional)</Label>
              <Input
                id="imp-modelo"
                placeholder="Ex.: i9, TM-T20, MP-4200 TH"
                value={formulario.modelo}
                onChange={(e) => setFormulario((f) => ({ ...f, modelo: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Tipo de conexão</Label>
              <Select
                value={formulario.tipoConexao}
                onValueChange={(v) => setFormulario((f) => ({ ...f, tipoConexao: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_CONEXAO.map((t) => (
                    <SelectItem key={t.valor} value={t.valor}>
                      {t.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(formulario.tipoConexao === "windows" || formulario.tipoConexao === "usb_agente" || formulario.tipoConexao === "escpos_agente") && (
              <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Computador / agente vinculado</Label>
                  <Select
                    value={formulario.computadorVinculado || "_nenhum"}
                    onValueChange={(v) => setFormulario((f) => ({ ...f, computadorVinculado: v === "_nenhum" ? "" : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nenhum computador vinculado ainda" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_nenhum">Nenhum (configurar depois)</SelectItem>
                      {deteccao.dados.computadores.map((c) => (
                        <SelectItem key={c.computador} value={c.computador}>
                          {c.computador} {c.online ? "· online" : "· sem contato recente"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {deteccao.dados.computadores.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Nenhum agente reportou ainda. Rode o agente local no computador da impressora — ele aparece
                      aqui automaticamente.
                    </p>
                  ) : null}
                </div>

                {formulario.tipoConexao === "windows" ? (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="imp-nome-windows">Impressora instalada no Windows</Label>
                    {detectadasNoComputador && detectadasNoComputador.impressoras.length > 0 ? (
                      <Select
                        value={formulario.nomeWindows || "_nenhuma"}
                        onValueChange={(v) => setFormulario((f) => ({ ...f, nomeWindows: v === "_nenhuma" ? "" : v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Escolha a impressora detectada" />
                        </SelectTrigger>
                        <SelectContent>
                          {detectadasNoComputador.impressoras.map((nome) => (
                            <SelectItem key={nome} value={nome}>
                              {nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id="imp-nome-windows"
                        placeholder="Ex.: ELGIN i9"
                        value={formulario.nomeWindows}
                        onChange={(e) => setFormulario((f) => ({ ...f, nomeWindows: e.target.value }))}
                      />
                    )}
                    <p className="text-xs text-muted-foreground">
                      Impressoras virtuais (Microsoft Print to PDF etc.) nunca aparecem na lista automática.
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            {formulario.tipoConexao === "rede_ip" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="imp-ip">Endereço IP</Label>
                  <Input
                    id="imp-ip"
                    placeholder="Ex.: 192.168.0.50"
                    value={formulario.enderecoIp}
                    onChange={(e) => setFormulario((f) => ({ ...f, enderecoIp: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="imp-porta">Porta</Label>
                  <Input
                    id="imp-porta"
                    placeholder="9100"
                    value={formulario.porta}
                    onChange={(e) => setFormulario((f) => ({ ...f, porta: e.target.value }))}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label>Destinos / funções (marque um ou mais)</Label>
              <div className="flex flex-wrap gap-2">
                {DESTINOS.map((d) => {
                  const ativo = formulario.destinos.includes(d.valor);
                  return (
                    <button
                      key={d.valor}
                      type="button"
                      onClick={() => alternarDestino(d.valor)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                        ativo
                          ? "border-primary bg-primary-50 text-primary-700"
                          : "border-border bg-transparent text-muted-foreground hover:bg-secondary"
                      )}
                    >
                      {d.rotulo}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Largura do papel</Label>
                <Select
                  value={formulario.larguraPapel}
                  onValueChange={(v) => setFormulario((f) => ({ ...f, larguraPapel: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="58mm">58mm</SelectItem>
                    <SelectItem value="80mm">80mm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Vias</Label>
                <Select value={formulario.vias} onValueChange={(v) => setFormulario((f) => ({ ...f, vias: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} via{n > 1 ? "s" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">Impressão automática</p>
                <p className="text-xs text-muted-foreground">Imprime sozinha quando um evento do destino acontece.</p>
              </div>
              <Switch
                checked={formulario.impressaoAutomatica}
                onCheckedChange={(v) => setFormulario((f) => ({ ...f, impressaoAutomatica: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogoAberto(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={enviando}>
              {editando ? "Salvar alterações" : "Cadastrar impressora"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!excluindo} onOpenChange={(a) => !a && setExcluindo(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir "{excluindo?.nome}"?</DialogTitle>
            <DialogDescription>
              A fila de impressão já registrada não é afetada — só o cadastro desta impressora é removido.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExcluindo(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={excluir}>
              Sim, excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {teste && (
        <VisualizacaoImpressao
          aberto
          aoFechar={() => setTeste(null)}
          titulo={`Teste de impressão — ${teste.nome}`}
          conteudo={teste.conteudo}
        />
      )}
    </div>
  );
}
