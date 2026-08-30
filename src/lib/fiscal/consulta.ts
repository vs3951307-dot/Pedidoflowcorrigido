/**
 * Consulta e cancelamento de NFC-e (PEDIDO 19) — sempre através do
 * provedor; o banco é atualizado com a resposta real da SEFAZ.
 */

import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/acesso";
import { consultarNoProvedor, cancelarNoProvedor } from "@/lib/fiscal/provedor";
import { statusConfiguracaoFiscal } from "@/lib/fiscal/config";
import type { ResultadoCancelamento, ResultadoConsulta } from "@/lib/fiscal/tipos";

export interface ResultadoConsultaComDocumento {
  resultado: ResultadoConsulta;
  documentoId: string;
}

/** Consulta o status do documento no provedor e atualiza o banco. */
export async function consultarDocumentoFiscal(
  empresaId: string,
  documentoId: string,
  usuario?: { id: string; nome: string } | null
): Promise<ResultadoConsultaComDocumento> {
  const documento = await prisma.documentoFiscal.findFirst({ where: { id: documentoId, empresaId } });
  if (!documento) {
    throw new Error("Documento fiscal não encontrado.");
  }
  if (!documento.chave) {
    return {
      resultado: {
        status: documento.status as ResultadoConsulta["status"],
        erro: "Documento sem chave de acesso — ainda não autorizado.",
      },
      documentoId,
    };
  }

  const configurado = await statusConfiguracaoFiscal(empresaId);
  if (!configurado.configurado) {
    return {
      resultado: {
        status: documento.status as ResultadoConsulta["status"],
        erro: `Consulta indisponível: configuração fiscal incompleta (${configurado.faltando.join("; ")}).`,
      },
      documentoId,
    };
  }

  const resultado = await consultarNoProvedor(empresaId, documento.chave);
  const dados = resultado.dados as ResultadoConsulta | undefined;

  const atualizado = await prisma.documentoFiscal.update({
    where: { id: documentoId },
    data: {
      status: resultado.status,
      cStat: dados?.cStat ?? resultado.cStat ?? documento.cStat,
      xMotivo: dados?.xMotivo ?? resultado.xMotivo ?? documento.xMotivo,
      protocolo: dados?.protocolo ?? documento.protocolo,
      xml: dados?.xml ?? documento.xml,
      danfeUrl: dados?.danfeUrl ?? documento.danfeUrl,
      qrcodeUrl: dados?.qrcodeUrl ?? documento.qrcodeUrl,
      qrcodeTexto: dados?.qrcodeTexto ?? documento.qrcodeTexto,
      erro: resultado.erro
        ? JSON.stringify({ motivo: "Consulta", detalhe: resultado.erro })
        : documento.erro,
    },
  });

  registrarAuditoria(
    "fiscal_consulta",
    `Consulta NFC-e ${documento.chave}: ${resultado.status}${resultado.xMotivo ? ` — ${resultado.xMotivo}` : ""}`,
    usuario,
    undefined,
    empresaId
  ).catch(() => null);

  return {
    resultado: {
      status: resultado.status,
      protocolo: dados?.protocolo,
      cStat: dados?.cStat,
      xMotivo: dados?.xMotivo,
      xml: dados?.xml,
      danfeUrl: dados?.danfeUrl,
      qrcodeUrl: dados?.qrcodeUrl,
      qrcodeTexto: dados?.qrcodeTexto,
      erro: resultado.erro,
    },
    documentoId: atualizado.id,
  };
}

export interface ResultadoCancelamentoComDocumento {
  resultado: ResultadoCancelamento;
  documentoId: string;
}

/** Cancela uma NFC-e autorizada (justificativa de 15+ caracteres). */
export async function cancelarDocumentoFiscal(
  empresaId: string,
  documentoId: string,
  justificativa: string,
  usuario?: { id: string; nome: string } | null
): Promise<ResultadoCancelamentoComDocumento> {
  const documento = await prisma.documentoFiscal.findFirst({ where: { id: documentoId, empresaId } });
  if (!documento) {
    throw new Error("Documento fiscal não encontrado.");
  }
  const motivo = justificativa.trim();
  if (motivo.length < 15) {
    throw new Error("Justificativa de cancelamento precisa de pelo menos 15 caracteres.");
  }
  if (documento.status !== "autorizado") {
    throw new Error(`Só é possível cancelar documento autorizado (atual: ${documento.status}).`);
  }
  if (!documento.chave) {
    throw new Error("Documento sem chave de acesso — não é possível cancelar.");
  }

  const configurado = await statusConfiguracaoFiscal(empresaId);
  if (!configurado.configurado) {
    return {
      resultado: {
        status: "erro",
        erro: `Cancelamento indisponível: configuração fiscal incompleta (${configurado.faltando.join("; ")}).`,
      },
      documentoId,
    };
  }

  const resultado = await cancelarNoProvedor(empresaId, documento.chave, motivo);
  const dados = resultado.dados as ResultadoCancelamento | undefined;
  const statusFinal = resultado.status === "cancelado" ? "cancelado" : "erro";

  const atualizado = await prisma.documentoFiscal.update({
    where: { id: documentoId },
    data: {
      status: statusFinal,
      cStat: dados?.cStat ?? resultado.cStat ?? documento.cStat,
      xMotivo: dados?.xMotivo ?? resultado.xMotivo ?? documento.xMotivo,
      protocolo: dados?.protocolo ?? documento.protocolo,
      canceladaEm: statusFinal === "cancelado" ? new Date() : documento.canceladaEm,
      motivoCancelamento: statusFinal === "cancelado" ? motivo : documento.motivoCancelamento,
      erro: resultado.erro
        ? JSON.stringify({ motivo: "Cancelamento", detalhe: resultado.erro })
        : documento.erro,
    },
  });

  registrarAuditoria(
    "fiscal_cancelamento",
    `Cancelamento NFC-e ${documento.chave}: ${statusFinal}${resultado.xMotivo ? ` — ${resultado.xMotivo}` : ""}`,
    usuario,
    undefined,
    empresaId
  ).catch(() => null);

  return {
    resultado: {
      status: statusFinal,
      protocolo: dados?.protocolo,
      cStat: dados?.cStat,
      xMotivo: dados?.xMotivo,
      erro: resultado.erro,
    },
    documentoId: atualizado.id,
  };
}
