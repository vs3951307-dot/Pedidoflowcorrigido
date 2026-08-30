/**
 * Cliente do provedor fiscal (PEDIDO 19) — API REST compatível com NFC-e.
 *
 * CONTRATO (documentado no README — seção "PEDIDO 19 · Provedor fiscal"):
 *   POST {urlBase}/nfce                          → emite uma NFC-e (body = payload)
 *   GET  {urlBase}/nfce/{chave}                  → consulta o documento
 *   POST {urlBase}/nfce/{chave}/cancelamento     → cancela (body { justificativa })
 *   GET  {urlBase}/status                        → status do serviço (conectividade)
 *
 * Autenticação: header `Authorization: Bearer <NFCe_TOKEN>`.
 *
 * Este cliente NUNCA fabrica sucesso: sem URL/token ou com resposta que
 * não seja de autorização, o resultado é erro/rejeição real — o documento
 * fica pendente/rejeitado e a interface informa exatamente o motivo.
 */

import { configProvedorDoEnv, tokenEfetivo } from "@/lib/fiscal/config";
import type {
  PayloadEmissaoNFCe,
  ResultadoCancelamento,
  ResultadoConsulta,
  ResultadoProvedor,
  RetornoEmissao,
} from "@/lib/fiscal/tipos";

function primeiroValor(obj: Record<string, unknown>, chaves: string[]): string | undefined {
  for (const chave of chaves) {
    const valor = obj[chave];
    if (typeof valor === "string" && valor.trim()) return valor.trim();
    if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  }
  return undefined;
}

/** Interpreta o campo de status da resposta (tolerante a variações). */
function lerStatusResposta(obj: Record<string, unknown>): {
  status: ResultadoProvedor["status"];
  cStat?: string;
  xMotivo?: string;
} {
  const status =
    primeiroValor(obj, ["status", "statusNfe", "situacao", "situacao_nfe", "estado"]) ?? "";
  const cStat = primeiroValor(obj, ["cStat", "cstat", "codigo_status", "codigo"]) ?? undefined;
  const xMotivo =
    primeiroValor(obj, ["xMotivo", "motivo", "motivoRejeicao", "mensagem", "erro", "descricao"]) ??
    undefined;

  const s = status.toLowerCase();
  if (s.includes("autoriz") || s === "aprovado" || s === "100" || cStat === "100") {
    return { status: "autorizado", cStat, xMotivo };
  }
  if (s.includes("rejei") || s.includes("reprov") || s.includes("recus") || /^2\d\d$/.test(cStat ?? "")) {
    return { status: "rejeitado", cStat, xMotivo };
  }
  if (s.includes("cancel") || s === "cancelled") {
    return { status: "cancelado", cStat, xMotivo };
  }
  if (s.includes("process") || s.includes("enviad") || s.includes("pendente") || s === "101") {
    return { status: "enviado", cStat, xMotivo };
  }
  if (s.includes("erro") || s.includes("falh")) {
    return { status: "erro", cStat, xMotivo };
  }
  // Status desconhecido: trata como falha técnica (nunca como sucesso).
  return {
    status: "erro",
    cStat,
    xMotivo:
      xMotivo ??
      `Resposta do provedor sem status reconhecido ("${status || "vazio"}").`,
  };
}

function lerRetornoEmissao(obj: Record<string, unknown>): RetornoEmissao {
  const chave = primeiroValor(obj, ["chave", "chaveAcesso", "chave_acesso", "chaveAcessoNfe"]);
  return {
    chave,
    numero: (() => {
      const n = primeiroValor(obj, ["numero", "nNF", "numero_nf"]);
      return n !== undefined && /^\d+$/.test(n) ? Number(n) : undefined;
    })(),
    serie: (() => {
      const s = primeiroValor(obj, ["serie"]);
      return s !== undefined && /^\d+$/.test(s) ? Number(s) : undefined;
    })(),
    protocolo: primeiroValor(obj, ["protocolo", "protocoloAutorizacao", "nProt", "protocolo_nfe"]),
    cStat: primeiroValor(obj, ["cStat", "cstat", "codigo_status", "codigo"]),
    xMotivo:
      primeiroValor(obj, ["xMotivo", "motivo", "motivoRejeicao", "mensagem", "descricao", "erro"]) ??
      undefined,
    xml: primeiroValor(obj, ["xml", "xmlNfe", "xml_nfe"]),
    danfeUrl: primeiroValor(obj, ["danfe", "danfeUrl", "danfe_url", "danfe_pdf", "pdf", "urlDanfe"]),
    qrcodeUrl: primeiroValor(obj, ["qrcode", "qrcodeUrl", "qrcode_url", "qrCode", "qr_code", "qrcodeImagem"]),
    qrcodeTexto: primeiroValor(obj, ["qrcodeTexto", "qrcode_texto", "qrcodeLink", "urlConsulta", "urlQrCode"]),
  };
}

async function requisição(
  empresaId: string,
  metodo: string,
  caminho: string,
  corpo?: unknown
): Promise<ResultadoProvedor> {
  const config = configProvedorDoEnv();
  const token = await tokenEfetivo(empresaId);
  if (!config.urlBase) {
    return {
      ok: false,
      status: "nao_configurado",
      erro: "NFCe_PROVEDOR_URL não definida (variável de ambiente).",
    };
  }
  if (!token) {
    return {
      ok: false,
      status: "nao_configurado",
      erro: "NFCe_TOKEN não definida (variável de ambiente).",
    };
  }

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), config.timeoutMs);
  try {
    const resposta = await fetch(`${config.urlBase}${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal: controlador.signal,
      cache: "no-store",
    });

    const texto = await resposta.text();
    let dados: Record<string, unknown> | null = null;
    if (texto.trim()) {
      try {
        const parsed: unknown = JSON.parse(texto);
        dados = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
      } catch {
        dados = null;
      }
    }

    if (!resposta.ok) {
      const motivo = dados
        ? primeiroValor(dados, ["erro", "mensagem", "message", "detalhe", "detail", "xMotivo", "motivo"])
        : undefined;
      return {
        ok: false,
        status: "erro",
        cStat: resposta.status >= 500 ? "900" : undefined,
        xMotivo: motivo ?? `HTTP ${resposta.status} do provedor fiscal.`,
        erro: `Requisição falhou (HTTP ${resposta.status}).`,
      };
    }

    if (!dados) {
      return {
        ok: false,
        status: "erro",
        erro: "Resposta do provedor sem corpo JSON válido.",
      };
    }

    const interpretado = lerStatusResposta(dados);
    return {
      ok: interpretado.status === "autorizado",
      status: interpretado.status,
      cStat: interpretado.cStat,
      xMotivo: interpretado.xMotivo,
      dados,
    };
  } catch (e) {
    const nome = e instanceof Error ? e.name : "";
    const mensagem = e instanceof Error ? e.message : "Falha desconhecida";
    return {
      ok: false,
      status: "erro",
      xMotivo: nome === "AbortError" ? "Tempo de resposta do provedor excedido." : mensagem,
      erro: nome === "AbortError" ? `Timeout após ${config.timeoutMs}ms.` : mensagem,
    };
  } finally {
    clearTimeout(temporizador);
  }
}

/** Emite a NFC-e. Retorna autorizado SOMENTE com retorno real do provedor. */
export async function emitirNoProvedor(
  empresaId: string,
  payload: PayloadEmissaoNFCe
): Promise<ResultadoProvedor<RetornoEmissao>> {
  const resultado = await requisição(empresaId, "POST", "/nfce", payload);
  if (!resultado.ok || resultado.status !== "autorizado") {
    return {
      ok: false,
      status: resultado.status,
      cStat: resultado.cStat,
      xMotivo: resultado.xMotivo,
      erro: resultado.erro,
    };
  }
  return {
    ok: true,
    status: "autorizado",
    cStat: resultado.cStat,
    xMotivo: resultado.xMotivo,
    dados: lerRetornoEmissao((resultado.dados ?? {}) as Record<string, unknown>),
  };
}

/** Consulta o documento por chave de acesso. */
export async function consultarNoProvedor(
  empresaId: string,
  chave: string
): Promise<ResultadoProvedor<ResultadoConsulta>> {
  const resultado = await requisição(empresaId, "GET", `/nfce/${encodeURIComponent(chave)}`);
  if (!resultado.ok) {
    return {
      ok: false,
      status: resultado.status,
      cStat: resultado.cStat,
      xMotivo: resultado.xMotivo,
      erro: resultado.erro,
    };
  }
  const dados = (resultado.dados ?? {}) as Record<string, unknown>;
  const retorno = lerRetornoEmissao(dados);
  return {
    ok: true,
    status: resultado.status,
    cStat: resultado.cStat,
    xMotivo: resultado.xMotivo,
    dados: {
      status: resultado.status,
      protocolo: retorno.protocolo,
      cStat: retorno.cStat,
      xMotivo: retorno.xMotivo,
      xml: retorno.xml,
      danfeUrl: retorno.danfeUrl,
      qrcodeUrl: retorno.qrcodeUrl,
      qrcodeTexto: retorno.qrcodeTexto,
    },
  };
}

/** Cancela um documento autorizado (justificativa obrigatória). */
export async function cancelarNoProvedor(
  empresaId: string,
  chave: string,
  justificativa: string
): Promise<ResultadoProvedor<ResultadoCancelamento>> {
  const resultado = await requisição(empresaId, "POST", `/nfce/${encodeURIComponent(chave)}/cancelamento`, {
    justificativa,
  });
  const dados = (resultado.dados ?? {}) as Record<string, unknown>;
  return {
    ok: resultado.ok,
    status: resultado.status,
    cStat: resultado.cStat,
    xMotivo: resultado.xMotivo,
    erro: resultado.erro,
    dados: {
      status: resultado.status,
      protocolo:
        primeiroValor(dados, ["protocolo", "protocoloCancelamento", "nProt"]) ?? undefined,
      cStat: resultado.cStat,
      xMotivo: resultado.xMotivo,
      erro: resultado.erro,
    },
  };
}

/** Teste de conectividade com o provedor (não emite documento). */
export async function statusDoProvedor(empresaId: string): Promise<ResultadoProvedor<{ mensagem?: string }>> {
  const config = configProvedorDoEnv();
  if (!config.urlBase) {
    return {
      ok: false,
      status: "nao_configurado",
      erro: "NFCe_PROVEDOR_URL não definida (variável de ambiente).",
    };
  }
  const resultado = await requisição(empresaId, "GET", "/status");
  return {
    ok: resultado.ok,
    status: resultado.status,
    cStat: resultado.cStat,
    xMotivo: resultado.xMotivo,
    erro: resultado.erro,
    dados: resultado.dados
      ? { mensagem: primeiroValor(resultado.dados as Record<string, unknown>, ["mensagem", "message", "status"]) }
      : undefined,
  };
}
