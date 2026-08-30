/**
 * Camada de provedor de IA (PEDIDO 9) — nenhuma das três IAs da
 * plataforma fica presa a um provedor/modelo fixo no código:
 *
 *   IA do WhatsApp        → padrão Gemini (rápido/econômico, alto volume)
 *   Copiloto da Empresa   → padrão OpenAI (consultas/ferramentas)
 *   Copiloto Supremo      → padrão OpenAI (mais robusto — diagnóstico/planejamento)
 *
 * Troca de provedor é só variável de ambiente — nenhum módulo precisa
 * ser reescrito para trocar OpenAI ↔ Gemini ou de modelo.
 *
 * As chaves de API NUNCA chegam ao frontend — só usadas aqui, no
 * servidor, lidas de variáveis de ambiente.
 */

export type PapelIA = "whatsapp" | "copiloto_empresa" | "copiloto_supremo";
export type NomeProvedor = "openai" | "gemini";

export interface ChamadaIA {
  prompt: string;
  temperatura?: number;
  /** Pede resposta em JSON estrito (suportado nos dois provedores). */
  json?: boolean;
  /** Tempo máximo de espera (ms) — evita travar o fluxo esperando a IA. */
  timeoutMs?: number;
}

export interface RespostaIA {
  texto: string;
  tokensEntrada: number;
  tokensSaida: number;
  provedor: NomeProvedor;
  modelo: string;
}

interface ConfigProvedor {
  provedor: NomeProvedor;
  apiKey: string;
  baseUrl: string;
  modelo: string;
}

const PADRAO_MODELO: Record<NomeProvedor, string> = {
  openai: "gpt-4o-mini",
  gemini: "gemini-1.5-flash",
};

const PADRAO_BASE_URL: Record<NomeProvedor, string> = {
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
};

// Provedor padrão de cada papel (PEDIDO 9) — só entra em uso se a
// variável *_PROVIDER específica não estiver definida.
const PROVEDOR_PADRAO: Record<PapelIA, NomeProvedor> = {
  whatsapp: "gemini",
  copiloto_empresa: "openai",
  copiloto_supremo: "openai",
};

// Nomes de variável de ambiente já usados por cada IA (compatibilidade
// com o que já existia) — a camada de provedor só ACRESCENTA a escolha
// de provedor/modelo, não troca os nomes de variável já documentados.
const PREFIXO_ENV: Record<PapelIA, string> = {
  whatsapp: "IA_ATENDENTE",
  copiloto_empresa: "COPILOTO_IA",
  copiloto_supremo: "IA_ADMIN",
};

function lerConfig(papel: PapelIA): ConfigProvedor | null {
  const prefixo = PREFIXO_ENV[papel];
  const apiKey = process.env[`${prefixo}_API_KEY`];
  if (!apiKey) return null;

  const provedor = (process.env[`${prefixo}_PROVIDER`] as NomeProvedor | undefined) ?? PROVEDOR_PADRAO[papel];
  const modelo = process.env[`${prefixo}_MODEL`] ?? PADRAO_MODELO[provedor];
  const baseUrl = (process.env[`${prefixo}_BASE_URL`] ?? PADRAO_BASE_URL[provedor]).replace(/\/$/, "");

  return { provedor, apiKey, baseUrl, modelo };
}

/** Configuração efetiva de um papel — usada pela Central de IA (Super Admin) para exibir provedor/modelo sem expor a chave. */
export function configuracaoEfetiva(papel: PapelIA): { configurado: boolean; provedor: NomeProvedor; modelo: string } {
  const config = lerConfig(papel);
  if (!config) {
    const provedor = PROVEDOR_PADRAO[papel];
    return { configurado: false, provedor, modelo: PADRAO_MODELO[provedor] };
  }
  return { configurado: true, provedor: config.provedor, modelo: config.modelo };
}

async function chamarOpenAI(config: ConfigProvedor, chamada: ChamadaIA): Promise<RespostaIA | null> {
  const controle = new AbortController();
  const timeout = chamada.timeoutMs ? setTimeout(() => controle.abort(), chamada.timeoutMs) : null;
  try {
    const resposta = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.modelo,
        messages: [{ role: "user", content: chamada.prompt }],
        temperature: chamada.temperatura ?? 0.3,
        ...(chamada.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controle.signal,
    });
    if (!resposta.ok) return null;
    const dados = await resposta.json();
    const texto = dados.choices?.[0]?.message?.content ?? "";
    return {
      texto,
      tokensEntrada: dados.usage?.prompt_tokens ?? 0,
      tokensSaida: dados.usage?.completion_tokens ?? 0,
      provedor: "openai",
      modelo: config.modelo,
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function chamarGemini(config: ConfigProvedor, chamada: ChamadaIA): Promise<RespostaIA | null> {
  const controle = new AbortController();
  const timeout = chamada.timeoutMs ? setTimeout(() => controle.abort(), chamada.timeoutMs) : null;
  try {
    const url = `${config.baseUrl}/models/${config.modelo}:generateContent?key=${config.apiKey}`;
    const resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: chamada.prompt }] }],
        generationConfig: {
          temperature: chamada.temperatura ?? 0.3,
          ...(chamada.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
      signal: controle.signal,
    });
    if (!resposta.ok) return null;
    const dados = await resposta.json();
    const texto = dados.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return {
      texto,
      tokensEntrada: dados.usageMetadata?.promptTokenCount ?? 0,
      tokensSaida: dados.usageMetadata?.candidatesTokenCount ?? 0,
      provedor: "gemini",
      modelo: config.modelo,
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Chama a IA configurada para o papel indicado. Retorna `null` (nunca
 * lança) quando a IA não está configurada ou a chamada falha — quem
 * chama sempre precisa ter um caminho sem IA (determinístico ou "não
 * consegui responder"), nunca depender só da IA funcionar.
 */
export async function chamarIA(papel: PapelIA, chamada: ChamadaIA): Promise<RespostaIA | null> {
  const config = lerConfig(papel);
  if (!config) return null;
  try {
    if (config.provedor === "gemini") return await chamarGemini(config, chamada);
    return await chamarOpenAI(config, chamada);
  } catch {
    return null;
  }
}

export interface ImagemIA {
  mime: string;
  bytes: Buffer;
}

async function chamarOpenAIVisao(config: ConfigProvedor, chamada: ChamadaIA & { imagens: ImagemIA[] }): Promise<RespostaIA | null> {
  const controle = new AbortController();
  const timeout = chamada.timeoutMs ? setTimeout(() => controle.abort(), chamada.timeoutMs) : null;
  try {
    const conteudo: unknown[] = [
      { type: "text", text: chamada.prompt },
      ...chamada.imagens.map((img) => ({
        type: "image_url",
        image_url: { url: `data:${img.mime};base64,${img.bytes.toString("base64")}` },
      })),
    ];
    const resposta = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.modelo,
        messages: [{ role: "user", content: conteudo }],
        temperature: chamada.temperatura ?? 0,
        ...(chamada.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controle.signal,
    });
    if (!resposta.ok) return null;
    const dados = await resposta.json();
    const texto = dados.choices?.[0]?.message?.content ?? "";
    return {
      texto,
      tokensEntrada: dados.usage?.prompt_tokens ?? 0,
      tokensSaida: dados.usage?.completion_tokens ?? 0,
      provedor: "openai",
      modelo: config.modelo,
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function chamarGeminiVisao(config: ConfigProvedor, chamada: ChamadaIA & { imagens: ImagemIA[] }): Promise<RespostaIA | null> {
  const controle = new AbortController();
  const timeout = chamada.timeoutMs ? setTimeout(() => controle.abort(), chamada.timeoutMs) : null;
  try {
    const url = `${config.baseUrl}/models/${config.modelo}:generateContent?key=${config.apiKey}`;
    const partes: unknown[] = [
      { text: chamada.prompt },
      ...chamada.imagens.map((img) => ({ inline_data: { mime_type: img.mime, data: img.bytes.toString("base64") } })),
    ];
    const resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: partes }],
        generationConfig: {
          temperature: chamada.temperatura ?? 0,
          ...(chamada.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
      signal: controle.signal,
    });
    if (!resposta.ok) return null;
    const dados = await resposta.json();
    const texto = dados.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return {
      texto,
      tokensEntrada: dados.usageMetadata?.promptTokenCount ?? 0,
      tokensSaida: dados.usageMetadata?.candidatesTokenCount ?? 0,
      provedor: "gemini",
      modelo: config.modelo,
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Visão: manda uma imagem junto com o prompt para a IA do papel. Retorna
 * `null` sem IA configurada ou em falha — o chamador SEMPRE precisa de um
 * caminho determinístico sem IA (ex.: guardar a imagem e avisar).
 */
export async function chamarIAVisao(
  papel: PapelIA,
  chamada: ChamadaIA & { imagens: ImagemIA[] }
): Promise<RespostaIA | null> {
  const config = lerConfig(papel);
  if (!config || chamada.imagens.length === 0) return null;
  try {
    if (config.provedor === "gemini") return await chamarGeminiVisao(config, chamada);
    return await chamarOpenAIVisao(config, chamada);
  } catch {
    return null;
  }
}

export interface TranscricaoAudio {
  texto: string;
  provedor: NomeProvedor;
  modelo: string;
}

async function transcreverOpenAI(config: ConfigProvedor, chamada: { mime: string; bytes: Buffer; prompt?: string; timeoutMs?: number }): Promise<TranscricaoAudio | null> {
  const controle = new AbortController();
  const timeout = chamada.timeoutMs ? setTimeout(() => controle.abort(), chamada.timeoutMs) : null;
  try {
    const form = new FormData();
    form.append("model", "whisper-1");
    form.append("file", new Blob([new Uint8Array(chamada.bytes)], { type: chamada.mime }), "audio");
    if (chamada.prompt) form.append("prompt", chamada.prompt);
    const resposta = await fetch(`${config.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal: controle.signal,
    });
    if (!resposta.ok) return null;
    const dados = (await resposta.json()) as { text?: string };
    return { texto: dados.text ?? "", provedor: "openai", modelo: "whisper-1" };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function transcreverGemini(config: ConfigProvedor, chamada: { mime: string; bytes: Buffer; prompt?: string; timeoutMs?: number }): Promise<TranscricaoAudio | null> {
  const controle = new AbortController();
  const timeout = chamada.timeoutMs ? setTimeout(() => controle.abort(), chamada.timeoutMs) : null;
  try {
    const url = `${config.baseUrl}/models/${config.modelo}:generateContent?key=${config.apiKey}`;
    const resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: chamada.mime, data: chamada.bytes.toString("base64") } },
              { text: chamada.prompt ?? "Transcreva este áudio para texto. Responda apenas com a transcrição." },
            ],
          },
        ],
        generationConfig: { temperature: 0 },
      }),
      signal: controle.signal,
    });
    if (!resposta.ok) return null;
    const dados = await resposta.json();
    const texto = dados.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return { texto, provedor: "gemini", modelo: config.modelo };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Transcrição de áudio (voz). OpenAI usa o endpoint dedicado `whisper-1`;
 * Gemini recebe o áudio inline. Retorna `null` sem IA configurada ou em
 * falha — nunca lança.
 */
export async function transcreverAudio(
  papel: PapelIA,
  chamada: { mime: string; bytes: Buffer; prompt?: string; timeoutMs?: number }
): Promise<TranscricaoAudio | null> {
  const config = lerConfig(papel);
  if (!config) return null;
  try {
    if (config.provedor === "gemini") return await transcreverGemini(config, chamada);
    return await transcreverOpenAI(config, chamada);
  } catch {
    return null;
  }
}
