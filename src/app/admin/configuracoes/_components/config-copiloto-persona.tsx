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

type TomCopiloto = keyof typeof TOMS;

interface PersonaCopiloto {
  nome: string;
  tom: TomCopiloto;
  apresentacao: string;
  regras: string;
}

const PADRAO: PersonaCopiloto = { nome: "", tom: "simpatico", apresentacao: "", regras: "" };

interface ConfiguracoesApi {
  copiloto_empresa?: PersonaCopiloto;
  [chave: string]: unknown;
}

function previewSaudacao(persona: PersonaCopiloto): string {
  const apelido = persona.nome.trim() || "Copiloto";
  const empresa = "sua empresa";
  const usuario = "você";
  if (persona.apresentacao) {
    return persona.apresentacao
      .replace("{usuario}", usuario)
      .replace("{empresa}", empresa)
      .replace("{copiloto}", apelido);
  }
  switch (persona.tom) {
    case "formal":
      return `Bom dia, ${usuario}. Sou o ${apelido} da ${empresa}. Como posso ajudar?`;
    case "profissional":
      return `Olá, ${usuario}! Sou o ${apelido} da ${empresa}. Pergunte sobre vendas, pedidos, estoque ou operação do dia a dia.`;
    case "descontraido":
      return `E aí, ${usuario}! 👋 Sou o ${apelido} da ${empresa}. Manda a dúvida que eu resolvo!`;
    default:
      return `Olá, ${usuario}! 😊 Sou o ${apelido} da ${empresa}. Pergunte sobre vendas, pedidos, estoque, caixa e entregas — ou dê comandos do dia a dia, que eu proponho e você confirma.`;
  }
}

/**
 * Configuração do Copiloto da Persona — o assistente IA que o dono/admin
 * conversa dentro do painel. Nome, tom de voz, apresentação e regras.
 */
export function ConfigCopilotoPersona() {
  const { dados, recarregar } = useApi<ConfiguracoesApi>("/api/configuracoes", { copiloto_empresa: PADRAO });
  const salvo = dados?.copiloto_empresa ?? PADRAO;

  const [formulario, setFormulario] = React.useState<PersonaCopiloto>(PADRAO);
  const [carregou, setCarregou] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);

  React.useEffect(() => {
    if (!carregou && dados?.copiloto_empresa) {
      setFormulario(dados.copiloto_empresa);
      setCarregou(true);
    }
  }, [dados, carregou]);

  function campo<K extends keyof PersonaCopiloto>(chave: K) {
    return (valor: PersonaCopiloto[K]) =>
      setFormulario((f) => ({ ...f, [chave]: valor }));
  }

  const salvar = async () => {
    setSalvando(true);
    try {
      await api("/api/configuracoes", {
        method: "PUT",
        body: JSON.stringify({ chave: "copiloto_empresa", valor: formulario }),
      });
      toast.success("Copiloto salvo.");
      await recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao salvar o copiloto");
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
          <strong>Quem é o copiloto?</strong> Aqui você define o nome, o tom de voz e as
          regras do assistente IA que conversa com você dentro do painel.
          O copiloto usa esses dados na primeira mensagem e no estilo das respostas.
        </p>
      </div>

      <Card>
        <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Bot className="h-5 w-5 text-primary" aria-hidden="true" />
            Identidade do copiloto
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Nome e tom de voz usados na apresentação e nas respostas dentro do painel.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 p-6 pt-4 sm:grid-cols-2 sm:p-7 sm:pt-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-muted-foreground">
              Nome do copiloto (ex.: Copiloto Rozeno)
            </Label>
            <Input
              value={formulario.nome}
              onChange={(e) => campo("nome")(e.target.value)}
              placeholder="Ex.: Copiloto Rozeno"
              maxLength={80}
              aria-label="Nome do copiloto"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-muted-foreground">Tom de voz</Label>
            <Select value={formulario.tom} onValueChange={(v) => campo("tom")(v as TomCopiloto)}>
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
            Apresentação e regras
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Personalize a primeira mensagem e como o copiloto se comporta no dia a dia.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 p-6 pt-4 sm:p-7 sm:pt-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-muted-foreground">
              Apresentação personalizada (opcional)
            </Label>
            <Textarea
              value={formulario.apresentacao}
              onChange={(e) => campo("apresentacao")(e.target.value)}
              placeholder={`Olá, {usuario}! Sou o {copiloto} da {empresa}. Pergunte sobre vendas, pedidos, estoque — ou dê comandos do dia a dia, que eu proponho e você confirma.`}
              maxLength={1000}
              className="min-h-24"
              aria-label="Apresentação personalizada"
            />
            <p className="text-xs text-muted-foreground">
              Use {"{usuario}"} para o nome do usuário, {"{empresa}"} para o nome da empresa, {"{copiloto}"} para o nome do copiloto.
              Deixe vazio para usar a saudação padrão.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-muted-foreground">Regras de comportamento</Label>
            <Textarea
              value={formulario.regras}
              onChange={(e) => campo("regras")(e.target.value)}
              placeholder={
                "Ex.:\n- Sempre seja direto e responda em no máximo 3 linhas\n- Nunca invente dados, sempre cite a fonte\n- Se não souber, diga que vai verificar"
              }
              maxLength={4000}
              className="min-h-36"
              aria-label="Regras de comportamento"
            />
            <p className="text-xs text-muted-foreground">
              Uma regra por linha. O copiloto usa isso para guiar suas respostas.
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
