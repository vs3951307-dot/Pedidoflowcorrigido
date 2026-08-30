"use client";

import * as React from "react";
import { toast } from "sonner";
import { Palette, Save, Upload, X, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, useApi } from "@/lib/api-cliente";

interface IdentidadeData {
  nome: string;
  logoUrl: string | null;
  tema: {
    corPrimaria?: string;
    corSecundaria?: string;
    mensagemSplash?: string;
    [key: string]: unknown;
  };
}

const PRESET_CORES = [
  "#953C2A",
  "#B45309",
  "#059669",
  "#2563EB",
  "#7C3AED",
  "#DB2777",
  "#DC2626",
  "#0891B2",
  "#4F46E5",
  "#16A34A",
];

const MENSAGEM_PADRAO = "Preparando seu sistema...";

export function ConfigIdentidade() {
  const { dados, recarregar } = useApi<IdentidadeData>("/api/configuracoes/identidade", {
    nome: "",
    logoUrl: null,
    tema: {},
  });

  const [logoUrl, setLogoUrl] = React.useState("");
  const [corPrimaria, setCorPrimaria] = React.useState("#953C2A");
  const [corSecundaria, setCorSecundaria] = React.useState("#953C2A");
  const [mensagemSplash, setMensagemSplash] = React.useState(MENSAGEM_PADRAO);
  const [salvando, setSalvando] = React.useState(false);
  const [carregou, setCarregou] = React.useState(false);
  const [logoErro, setLogoErro] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!carregou && dados.nome) {
      setLogoUrl(dados.logoUrl ?? "");
      setCorPrimaria(dados.tema?.corPrimaria ?? "#953C2A");
      setCorSecundaria(dados.tema?.corSecundaria ?? dados.tema?.corPrimaria ?? "#953C2A");
      setMensagemSplash(dados.tema?.mensagemSplash ?? MENSAGEM_PADRAO);
      setCarregou(true);
    }
  }, [dados, carregou]);

  const iniciais = React.useMemo(() => {
    const words = dados.nome.trim().split(/\s+/);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return (dados.nome || "PF").slice(0, 2).toUpperCase();
  }, [dados.nome]);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Imagem muito grande. Máximo 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoUrl(reader.result as string);
      setLogoErro(false);
    };
    reader.readAsDataURL(file);
  }

  function removerLogo() {
    setLogoUrl("");
    setLogoErro(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function salvar() {
    setSalvando(true);
    try {
      await api("/api/configuracoes/identidade", {
        method: "PUT",
        body: JSON.stringify({
          logoUrl: logoUrl || null,
          corPrimaria,
          corSecundaria,
          mensagemSplash: mensagemSplash.trim() || MENSAGEM_PADRAO,
        }),
      });
      toast.success("Identidade visual salva.");
      setLogoErro(false);
      recarregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <CardHeader className="p-6 pb-2 sm:p-7 sm:pb-2">
        <CardTitle className="flex items-center gap-2 text-xl">
          <Palette className="h-5 w-5 text-primary" aria-hidden="true" />
          Identidade visual
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Logo, cores e mensagem da splash screen.
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 p-6 pt-4 sm:p-7 sm:pt-4">
        {/* Preview */}
        <div className="flex items-center gap-5">
          <div
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold text-white shadow-lg"
            style={{ background: corPrimaria }}
          >
            {logoUrl && !logoErro ? (
              <img
                src={logoUrl}
                alt={dados.nome}
                className="h-full w-full rounded-2xl object-contain"
                onError={() => setLogoErro(true)}
              />
            ) : (
              iniciais
            )}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Preview da splash</p>
            <p className="text-xs text-muted-foreground mt-1">
              {logoUrl && !logoErro ? "Logo configurada" : "Sem logo — mostra iniciais"}
            </p>
          </div>
        </div>

        {/* Upload de logo */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm font-medium text-muted-foreground">Logo da empresa</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              Escolher imagem
            </Button>
            {logoUrl && (
              <Button type="button" variant="ghost" size="sm" onClick={removerLogo}>
                <X className="h-4 w-4" aria-hidden="true" />
                Remover
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Formatos: PNG, JPG, SVG. Máximo 2MB. Se vazio, mostra as iniciais do nome.
          </p>
          {logoUrl && !logoErro && (
            <div className="mt-2 flex items-center gap-2 text-xs text-emerald-600">
              <Check className="h-3.5 w-3.5" />
              Logo carregada com sucesso
            </div>
          )}
        </div>

        {/* Mensagem da splash */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm font-medium text-muted-foreground">Mensagem da splash</Label>
          <Input
            value={mensagemSplash}
            onChange={(e) => setMensagemSplash(e.target.value)}
            placeholder={MENSAGEM_PADRAO}
            maxLength={80}
          />
          <p className="text-xs text-muted-foreground">
            Texto que aparece abaixo do nome na tela de entrada. Máximo 80 caracteres.
          </p>
        </div>

        {/* Cor primária */}
        <div className="flex flex-col gap-2">
          <Label className="text-sm font-medium text-muted-foreground">Cor primária</Label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="color"
              value={corPrimaria}
              onChange={(e) => setCorPrimaria(e.target.value)}
              className="h-10 w-10 cursor-pointer rounded-lg border border-border"
            />
            <Input
              type="text"
              value={corPrimaria}
              onChange={(e) => setCorPrimaria(e.target.value)}
              className="w-28"
              maxLength={7}
            />
            <div className="flex flex-wrap gap-1.5">
              {PRESET_CORES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCorPrimaria(c)}
                  className="h-7 w-7 rounded-full border-2 transition-all"
                  style={{
                    background: c,
                    borderColor: corPrimaria === c ? "white" : "transparent",
                  }}
                  title={c}
                >
                  {corPrimaria === c && <Check className="mx-auto h-3 w-3 text-white" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Cor secundária */}
        <div className="flex flex-col gap-2">
          <Label className="text-sm font-medium text-muted-foreground">Cor secundária (opcional)</Label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="color"
              value={corSecundaria}
              onChange={(e) => setCorSecundaria(e.target.value)}
              className="h-10 w-10 cursor-pointer rounded-lg border border-border"
            />
            <Input
              type="text"
              value={corSecundaria}
              onChange={(e) => setCorSecundaria(e.target.value)}
              className="w-28"
              maxLength={7}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Usada em gradientes da splash. Se igual à primária, funciona normalmente.
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={salvar} disabled={salvando}>
            <Save className="h-4 w-4" aria-hidden="true" />
            Salvar identidade
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
