"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

interface LandingConteudo {
  marca: { nome: string; tagline: string; logoUrl: string | null; corPrimaria: string | null; whatsappContato: string | null };
  hero: { eyebrow: string; titulo: string; subtitulo: string; apoio: string; imagemUrl: string | null };
  modulosVitrine: string[];
  segmentos: { id: string; emoji: string; nome: string; descricao: string; recursos: string[] }[];
  segmentosNota: string;
  iaDestaque: string;
  ctaFinal: { titulo: string; descricao: string };
  // Seções do layout comercial, editadas em bloco pelo textarea JSON.
  [secao: string]: unknown;
}

/** Chaves editadas pelo textarea "Seções da página comercial". */
const SECOES_AVANCADAS = [
  "navegacao",
  "heroEstatisticas",
  "recursos",
  "comoFunciona",
  "dispositivos",
  "beneficios",
  "depoimentos",
  "planosSecao",
  "rodape",
] as const;

async function chamar<T>(url: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(corpo.erro ?? "Falha na requisição.");
  return corpo as T;
}

/**
 * Editor da landing page (PEDIDO 27): logo, banner, textos, cores,
 * WhatsApp de contato e segmentos em destaque — tudo sem alterar
 * código. Os planos/preços NÃO são editados aqui (ver aba "Empresas" →
 * planos) — evita duplicar a mesma informação em dois lugares.
 */
export function LandingEditor() {
  const [conteudo, setConteudo] = React.useState<LandingConteudo | null>(null);
  const [segmentosTexto, setSegmentosTexto] = React.useState("");
  const [secoesTexto, setSecoesTexto] = React.useState("");
  const [carregando, setCarregando] = React.useState(true);
  const [salvando, setSalvando] = React.useState(false);

  const carregar = React.useCallback(async () => {
    setCarregando(true);
    try {
      const resp = await chamar<{ conteudo: LandingConteudo }>("/api/superadmin/landing");
      setConteudo(resp.conteudo);
      setSegmentosTexto(JSON.stringify(resp.conteudo.segmentos, null, 2));
      setSecoesTexto(
        JSON.stringify(
          Object.fromEntries(SECOES_AVANCADAS.map((k) => [k, resp.conteudo[k]])),
          null,
          2,
        ),
      );
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao carregar a landing.");
    } finally {
      setCarregando(false);
    }
  }, []);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvar() {
    if (!conteudo) return;
    let segmentos: LandingConteudo["segmentos"];
    try {
      segmentos = JSON.parse(segmentosTexto);
      if (!Array.isArray(segmentos)) throw new Error("deve ser uma lista");
    } catch {
      toast.error("O JSON dos segmentos está inválido — confira a formatação.");
      return;
    }

    let secoes: Record<string, unknown>;
    try {
      secoes = JSON.parse(secoesTexto);
      if (!secoes || typeof secoes !== "object" || Array.isArray(secoes)) {
        throw new Error("deve ser um objeto");
      }
    } catch {
      toast.error("O JSON das seções da página comercial está inválido — confira a formatação.");
      return;
    }

    setSalvando(true);
    try {
      await chamar("/api/superadmin/landing", {
        method: "PUT",
        body: JSON.stringify({ ...conteudo, ...secoes, segmentos }),
      });
      toast.success("Landing page atualizada.");
      carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando || !conteudo) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Carregando conteúdo da landing…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4 py-6">
          <p className="text-sm font-semibold text-foreground">Marca</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Nome</Label>
              <Input value={conteudo.marca.nome} onChange={(e) => setConteudo({ ...conteudo, marca: { ...conteudo.marca, nome: e.target.value } })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Slogan (tagline)</Label>
              <Input value={conteudo.marca.tagline} onChange={(e) => setConteudo({ ...conteudo, marca: { ...conteudo.marca, tagline: e.target.value } })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>URL do logo</Label>
              <Input
                placeholder="https://…"
                value={conteudo.marca.logoUrl ?? ""}
                onChange={(e) => setConteudo({ ...conteudo, marca: { ...conteudo.marca, logoUrl: e.target.value || null } })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Cor primária (hex)</Label>
              <Input
                placeholder="#0ea5e9"
                value={conteudo.marca.corPrimaria ?? ""}
                onChange={(e) => setConteudo({ ...conteudo, marca: { ...conteudo.marca, corPrimaria: e.target.value || null } })}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Link do WhatsApp de contato (ex.: https://wa.me/55...)</Label>
              <Input
                placeholder="https://wa.me/5511999999999"
                value={conteudo.marca.whatsappContato ?? ""}
                onChange={(e) => setConteudo({ ...conteudo, marca: { ...conteudo.marca, whatsappContato: e.target.value || null } })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 py-6">
          <p className="text-sm font-semibold text-foreground">Hero (seção principal)</p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Texto de destaque (eyebrow)</Label>
              <Input value={conteudo.hero.eyebrow} onChange={(e) => setConteudo({ ...conteudo, hero: { ...conteudo.hero, eyebrow: e.target.value } })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Título</Label>
              <Input value={conteudo.hero.titulo} onChange={(e) => setConteudo({ ...conteudo, hero: { ...conteudo.hero, titulo: e.target.value } })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Subtítulo</Label>
              <Textarea value={conteudo.hero.subtitulo} onChange={(e) => setConteudo({ ...conteudo, hero: { ...conteudo.hero, subtitulo: e.target.value } })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Texto de apoio</Label>
              <Textarea value={conteudo.hero.apoio} onChange={(e) => setConteudo({ ...conteudo, hero: { ...conteudo.hero, apoio: e.target.value } })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>URL da imagem/banner principal</Label>
              <Input
                placeholder="https://…"
                value={conteudo.hero.imagemUrl ?? ""}
                onChange={(e) => setConteudo({ ...conteudo, hero: { ...conteudo.hero, imagemUrl: e.target.value || null } })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 py-6">
          <p className="text-sm font-semibold text-foreground">Módulos em destaque</p>
          <div className="flex flex-col gap-1.5">
            <Label>Um por linha, ou separados por vírgula</Label>
            <Textarea
              rows={4}
              value={conteudo.modulosVitrine.join(", ")}
              onChange={(e) =>
                setConteudo({
                  ...conteudo,
                  modulosVitrine: e.target.value.split(/[,\n]/).map((m) => m.trim()).filter(Boolean),
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 py-6">
          <p className="text-sm font-semibold text-foreground">Segmentos de negócio</p>
          <p className="text-xs text-muted-foreground">
            Formato avançado (JSON) — cada item precisa de id, emoji, nome, descricao e recursos (lista de textos).
          </p>
          <Textarea
            rows={12}
            className="font-mono text-xs"
            value={segmentosTexto}
            onChange={(e) => setSegmentosTexto(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <Label>Nota abaixo dos segmentos</Label>
            <Input value={conteudo.segmentosNota} onChange={(e) => setConteudo({ ...conteudo, segmentosNota: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 py-6">
          <p className="text-sm font-semibold text-foreground">IA em destaque e chamada final</p>
          <div className="flex flex-col gap-1.5">
            <Label>Frase de destaque da IA</Label>
            <Input value={conteudo.iaDestaque} onChange={(e) => setConteudo({ ...conteudo, iaDestaque: e.target.value })} />
          </div>
          <Separator />
          <div className="flex flex-col gap-1.5">
            <Label>Título da chamada final</Label>
            <Input value={conteudo.ctaFinal.titulo} onChange={(e) => setConteudo({ ...conteudo, ctaFinal: { ...conteudo.ctaFinal, titulo: e.target.value } })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Descrição da chamada final</Label>
            <Textarea value={conteudo.ctaFinal.descricao} onChange={(e) => setConteudo({ ...conteudo, ctaFinal: { ...conteudo.ctaFinal, descricao: e.target.value } })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 py-6">
          <p className="text-sm font-semibold text-foreground">Seções da página comercial</p>
          <p className="text-xs text-muted-foreground">
            Formato avançado (JSON) — navegação, estatísticas do topo, recursos, passos, dispositivos,
            benefícios, depoimentos, cabeçalho dos planos e rodapé. Os PREÇOS não ficam aqui: eles vêm
            dos planos cadastrados em “Planos”. Se o JSON estiver inválido, nada é salvo.
          </p>
          <Textarea
            rows={16}
            className="font-mono text-xs"
            value={secoesTexto}
            onChange={(e) => setSecoesTexto(e.target.value)}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={salvando}>
          {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar landing page
        </Button>
      </div>
    </div>
  );
}
