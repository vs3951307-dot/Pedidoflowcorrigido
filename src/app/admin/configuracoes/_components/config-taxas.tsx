"use client";

import * as React from "react";
import { toast } from "sonner";
import { Bike, Percent, Plus, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBRL } from "@/lib/utils";
import { api, useApi } from "@/lib/api-cliente";
import {
  TAXAS_PAGAMENTO,
  TAXA_ENTREGA,
  type TaxaConfiguracao,
  type TaxaEntregaConfig,
} from "@/lib/configuracoes";

interface ConfiguracoesApi {
  // GET /api/configuracoes devolve um objeto plano de chaves/valor; a chave
  // "taxas" pode vir agrupada (dados.config.taxas) ou plana (dados.taxas).
  config?: {
    taxas?: {
      formas: TaxaConfiguracao[];
      taxaEntrega: TaxaEntregaConfig;
    };
  };
  taxas?: {
    formas: TaxaConfiguracao[];
    taxaEntrega: TaxaEntregaConfig;
  };
  [chave: string]: unknown;
}

/**
 * Taxas — percentuais e valores fixos por forma de pagamento (o caixa
 * usa estas taxas nos cálculos) e taxa de entrega por regras
 * configuráveis (PEDIDO 17): fixa ou por bairro, com entrega grátis
 * acima de um subtotal. Dados de `GET /api/configuracoes`, com fallback
 * em `src/lib/configuracoes.ts`; alternâncias e o salvar via `PUT`.
 */
export function ConfigTaxas() {
  const fallback = useApi<ConfiguracoesApi>("/api/configuracoes", { config: { taxas: { formas: TAXAS_PAGAMENTO, taxaEntrega: TAXA_ENTREGA } } });
  const taxas = fallback.dados.config?.taxas ?? fallback.dados.taxas ?? { formas: TAXAS_PAGAMENTO, taxaEntrega: TAXA_ENTREGA };

  const [ativoPorForma, setAtivoPorForma] = React.useState<Record<string, boolean>>(
    Object.fromEntries(taxas.formas.map((taxa) => [taxa.forma, taxa.ativo]))
  );
  const [taxaEntregaAtiva, setTaxaEntregaAtiva] = React.useState(true);
  const [regra, setRegra] = React.useState<TaxaEntregaConfig["regra"]>(taxas.taxaEntrega.regra);
  const [valorFixo, setValorFixo] = React.useState(String(taxas.taxaEntrega.valorFixo ?? ""));
  const [valorPadrao, setValorPadrao] = React.useState(String(taxas.taxaEntrega.valorPadrao ?? ""));
  const [gratisAcima, setGratisAcima] = React.useState(String(taxas.taxaEntrega.gratisAcima ?? ""));
  const [bairros, setBairros] = React.useState<{ bairro: string; valor: string }[]>(
    (taxas.taxaEntrega.bairros ?? []).map((b) => ({ bairro: b.bairro, valor: String(b.valor) }))
  );

  const persistir = (taxaEntrega: TaxaEntregaConfig) => {
    api("/api/configuracoes", {
      method: "PUT",
      body: JSON.stringify({
        chave: "taxas",
        valor: { formas: taxas.formas, taxaEntrega },
      }),
    }).catch((erro) =>
      toast.error(erro instanceof Error ? erro.message : "Falha ao salvar taxas")
    );
  };

  const salvar = async () => {
    try {
      const taxaEntrega: TaxaEntregaConfig = {
        regra,
        valorFixo: Number(valorFixo) || 0,
        valorPadrao: Number(valorPadrao) || 0,
        gratisAcima: Number(gratisAcima) || 0,
        bairros: bairros
          .filter((b) => b.bairro.trim())
          .map((b) => ({ bairro: b.bairro.trim(), valor: Number(b.valor) || 0 })),
      };
      await api("/api/configuracoes", {
        method: "PUT",
        body: JSON.stringify({
          chave: "taxas",
          valor: {
            formas: taxas.formas.map((taxa) => ({ ...taxa, ativo: ativoPorForma[taxa.forma] })),
            taxaEntrega,
          },
        }),
      });
      toast.success("Taxas salvas.");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao salvar taxas");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Percent className="h-5 w-5 text-primary" aria-hidden="true" />
            Formas de pagamento
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Descontos/encargos aplicados na cobrança de cada forma no caixa.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-6 pt-4 sm:p-7 sm:pt-4">
          {taxas.formas.length === 0 && (
<p className="text-sm text-muted-foreground">
            Nenhuma forma de pagamento cadastrada ainda. As formas vêm da
            configuração salva desta empresa (chave &#39;taxas&#39; em
            /api/configuracoes).
          </p>
          )}
          {taxas.formas.map((taxa) => (
            <div
              key={taxa.forma}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border p-4"
            >
              <div className="flex items-center gap-3">
                <Switch
                  checked={ativoPorForma[taxa.forma]}
                  onCheckedChange={(ligado) => {
                    setAtivoPorForma((atual) => ({ ...atual, [taxa.forma]: ligado }));
                    persistir(taxas.taxaEntrega);
                  }}
                  aria-label={`Ativar taxa de ${taxa.rotulo}`}
                />
                <div>
                  <p className="font-semibold">{taxa.rotulo}</p>
                  <p className="text-sm text-muted-foreground">
                    {taxa.prazo} ·{" "}
                    {taxa.valorFixo > 0 && `${formatBRL(taxa.valorFixo)} + `}
                    {taxa.taxaPct.toFixed(2).replace(".", ",")}%
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-24">
                  <Label className="text-xs text-muted-foreground">% taxa</Label>
                  <Input
                    type="number"
                    step="0.01"
                    defaultValue={taxa.taxaPct}
                    aria-label={`Percentual ${taxa.rotulo}`}
                  />
                </div>
                <div className="w-28">
                  <Label className="text-xs text-muted-foreground">Valor fixo (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    defaultValue={taxa.valorFixo}
                    aria-label={`Valor fixo ${taxa.rotulo}`}
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Bike className="h-5 w-5 text-primary" aria-hidden="true" />
            Taxa de entrega
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Regras calculadas pelo próprio sistema (sem geolocalização) — usadas
            no novo pedido de delivery e validadas no servidor.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-6 pt-4 sm:p-7 sm:pt-4">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              <Switch
                checked={taxaEntregaAtiva}
                onCheckedChange={(ligado) => {
                  setTaxaEntregaAtiva(ligado);
                  if (!ligado) persistir({ ...taxas.taxaEntrega, regra, valorFixo: 0, valorPadrao: 0, gratisAcima: 0, bairros: [] });
                }}
                aria-label="Ativar taxa de entrega"
              />
              <div>
                <p className="font-semibold">Cobrar taxa em pedidos de delivery</p>
                <p className="text-sm text-muted-foreground">
                  {taxaEntregaAtiva
                    ? "Ativa — aplicada no total do pedido."
                    : "Desativada — pedidos de delivery sem taxa."}
                </p>
              </div>
            </div>
          </div>

          {taxaEntregaAtiva && (
            <>
              <div className="flex flex-wrap items-end gap-4 rounded-xl border border-border p-4">
                <div className="flex flex-col gap-2">
                  <Label>Regra de cálculo</Label>
                  <Select value={regra} onValueChange={(v) => setRegra(v as TaxaEntregaConfig["regra"])}>
                    <SelectTrigger className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bairro">Por bairro (com padrão)</SelectItem>
                      <SelectItem value="fixa">Valor fixo para todos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-xs text-muted-foreground">
                    {regra === "bairro" ? "Valor para bairros não listados (R$)" : "Valor fixo (R$)"}
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="w-36"
                    value={regra === "bairro" ? valorPadrao : valorFixo}
                    onChange={(e) =>
                      regra === "bairro" ? setValorPadrao(e.target.value) : setValorFixo(e.target.value)
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-xs text-muted-foreground">Entrega grátis acima de (R$) — 0 desliga</Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="w-36"
                    value={gratisAcima}
                    onChange={(e) => setGratisAcima(e.target.value)}
                  />
                </div>
              </div>

              {regra === "bairro" && (
                <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">Valores por bairro</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setBairros((atual) => [...atual, { bairro: "", valor: "" }])}
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar bairro
                    </Button>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {bairros.map((b, indice) => (
                      <li key={indice} className="flex items-end gap-2">
                        <div className="flex flex-1 flex-col gap-1">
                          <Label className="text-xs text-muted-foreground">Bairro</Label>
                          <Input
                            placeholder="Ex.: Centro"
                            value={b.bairro}
                            onChange={(e) =>
                              setBairros((atual) =>
                                atual.map((x, i) => (i === indice ? { ...x, bairro: e.target.value } : x))
                              )
                            }
                          />
                        </div>
                        <div className="flex w-32 flex-col gap-1">
                          <Label className="text-xs text-muted-foreground">Taxa (R$)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0,00"
                            value={b.valor}
                            onChange={(e) =>
                              setBairros((atual) =>
                                atual.map((x, i) => (i === indice ? { ...x, valor: e.target.value } : x))
                              )
                            }
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setBairros((atual) => atual.filter((_, i) => i !== indice))}
                          aria-label={`Remover bairro ${b.bairro}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          <div className="flex justify-end">
            <Button onClick={salvar}>
              <Save className="h-4 w-4" aria-hidden="true" />
              Salvar taxas
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
