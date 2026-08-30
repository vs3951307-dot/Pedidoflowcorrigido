"use client";

import * as React from "react";
import { toast } from "sonner";
import { Bot, RotateCcw, Save, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, useApi } from "@/lib/api-cliente";

const TOMS = {
  simpatico: "Simpático",
  profissional: "Profissional",
  descontraido: "Descontraído",
  formal: "Formal",
} as const;

type TomAtendente = keyof typeof TOMS;

interface PersonaAtendente {
  nome: string;
  tom: TomAtendente;
  regras: string;
  horario: string;
}

const PADRAO: PersonaAtendente = { nome: "", tom: "simpatico", regras: "", horario: "" };

interface ConfiguracoesApi {
  atendente_ia?: PersonaAtendente;
  [chave: string]: unknown;
}

function previewSaudacao(persona: PersonaAtendente): string {
  const apresentacao = persona.nome.trim() ? `Aqui é a ${persona.nome.trim()}.` : null;
  switch (persona.tom) {
    case "formal":
      return `Olá! ${apresentacao ?? "Bem-vindo(a) à nossa pizzaria."} Em que posso ajudar?`;
    case "profissional":
      return `Olá! ${apresentacao ?? "Somos a nossa pizzaria."} Como posso ajudar?`;
    case "descontraido":
      return `Olá! 👋 ${apresentacao ?? "Bora pedir algo?"}`;
    default:
      return `Olá! 😊 ${apresentacao ?? "O que você deseja?"}`;
  }
}

/**
 * Atendente IA — quem é o robô que atende o WhatsApp da empresa (PEDIDO 18).
 *
 * Nome, tom de voz e regras de negócio ficam gravados na Configuração
 * `atendente_ia` (por empresa). São usados na saudação, no horário falado e
 * nas regras respondidas pelo motor; quando uma chave de IA está ativa, a
 * persona também vai no prompt do normalizador.
 */
export function ConfigAtendenteIa() {
  const { dados, recarregar } = useApi<ConfiguracoesApi>("/api/configuracoes", { atendente_ia: PADRAO });
  const salvo = dados?.atendente_ia ?? PADRAO;

  const [formulario, setFormulario] = React.useState<PersonaAtendente>(PADRAO);
  const [carregou, setCarregou] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);

  React.useEffect(() => {
    if (!carregou && dados?.atendente_ia) {
      setFormulario(dados.atendente_ia);
      setCarregou(true);
    }
  }, [dados, carregou]);

  function campo<K extends keyof PersonaAtendente>(chave: K) {
    return (valor: PersonaAtendente[K]) =>
      setFormulario((f) => ({ ...f, [chave]: valor }));
  }

  const salvar = async () => {
    setSalvando(true);
    try {
      await api("/api/configuracoes", {
        method: "PUT",
        body: JSON.stringify({ chave: "atendente_ia", valor: formulario }),
      });
      toast.success("Atendente IA salvo.");
      await recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao salvar o atendente");
    } finally {
      setSalvando(false);
    }
  };

  const restaurar = () => {
    setFormulario(PADRAO);
    toast.success("Campos restaurados — clique em Salvar para limpar a configuração.");
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-status-waiting-border bg-status-waiting-bg p-4 text-sm text-status-waiting">
        <p>
          <strong>Quem atende no WhatsApp?</strong> Aqui você define o nome, o tom de voz e as
          regras da atendente virtual. Se você configurou uma chave de IA (variável{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">IA_ATENDENTE_API_KEY</code>), esses
          dados também guiam o robô nas respostas.
        </p>
      </div>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Bot className="h-5 w-5 text-primary" aria-hidden="true" />
            Identidade da atendente
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Nome e tom de voz usados na saudação e na forma de falar com o cliente.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 p-6 pt-4 sm:grid-cols-2 sm:p-7 sm:pt-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-muted-foreground">
              Nome da atendente (ex.: Ana, Atendente Rozeno)
            </Label>
            <Input
              value={formulario.nome}
              onChange={(e) => campo("nome")(e.target.value)}
              placeholder="Ex.: Ana"
              maxLength={80}
              aria-label="Nome da atendente"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-muted-foreground">Tom de voz</Label>
            <Select value={formulario.tom} onValueChange={(v) => campo("tom")(v as TomAtendente)}>
              <SelectTrigger aria-label="Tom de voz">
                <SelectValue placeholder="Escolha o tom" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TOMS).map(([valor, rotulo]) => (
                  <SelectItem key={valor} value={valor}>
                    {rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
            Regras e horário
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Como a pizzaria funciona — a atendente usa isso para responder pedido mínimo, formas de
            pagamento, entrega e horário.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 p-6 pt-4 sm:p-7 sm:pt-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-muted-foreground">Regras de negócio</Label>
            <Textarea
              value={formulario.regras}
              onChange={(e) => campo("regras")(e.target.value)}
              placeholder={
                "Ex.:\n- Pedido mínimo R$ 20\n- Não entregamos em bairro X\n- Aceitamos Pix, cartão e dinheiro\n- Trocas só em até 30 min"
              }
              maxLength={4000}
              className="min-h-36"
              aria-label="Regras de negócio"
            />
            <p className="text-xs text-muted-foreground">
              Uma regra por linha. Quando o cliente pergunta (ex.: &quot;qual o pedido mínimo?&quot;),
              a atendente responde com estas regras.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-muted-foreground">Horário de funcionamento</Label>
            <Input
              value={formulario.horario}
              onChange={(e) => campo("horario")(e.target.value)}
              placeholder="Ex.: todos os dias, das 18h às 23h"
              maxLength={200}
              aria-label="Horário de funcionamento"
            />
            <p className="text-xs text-muted-foreground">
              Vazio = usa o horário cadastrado na aba Empresa.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-2xl border bg-muted/40 p-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Bot className="h-3.5 w-3.5" aria-hidden="true" />
          Prévia da saudação
        </p>
        <div className="rounded-xl bg-card p-4 text-sm text-foreground">
          <p className="italic">&quot;{previewSaudacao(formulario)}&quot;</p>
          <p className="mt-2 text-xs text-muted-foreground">
            (pode dizer *&quot;pedir&quot;*, *&quot;cardápio&quot;*, *&quot;promoções&quot;* ou *&quot;horário&quot;*)
          </p>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="outline" onClick={restaurar} disabled={salvando} type="button">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Restaurar padrão
        </Button>
        <Button onClick={salvar} disabled={salvando}>
          {salvando ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          Salvar
        </Button>
      </div>
    </div>
  );
}
