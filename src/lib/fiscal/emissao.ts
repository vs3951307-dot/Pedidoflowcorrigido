/**
 * Emissão da NFC-e (PEDIDO 19) — orquestra: validação dos dados fiscais →
 * payload → provedor → registro `DocumentoFiscal` vinculado ao pedido.
 *
 * Regras de integridade:
 *  - Sem configuração/credenciais → documento fica `nao_configurado` com
 *    o motivo — a venda NÃO é apresentada como fiscalizada.
 *  - Rejeição da SEFAZ → documento `rejeitado` com cStat/xMotivo.
 *  - `autorizado` somente com protocolo retornado pelo provedor.
 */

import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/acesso";
import { montarPayloadNFCe, ehErroValidacao } from "@/lib/fiscal/payload";
import { emitirNoProvedor } from "@/lib/fiscal/provedor";
import { ambienteEfetivo, statusConfiguracaoFiscal } from "@/lib/fiscal/config";
import type {
  RetornoEmissao,
  ResultadoEmissao,
  StatusDocumentoFiscal,
} from "@/lib/fiscal/tipos";

export interface ResultadoEmissaoComDocumento {
  resultado: ResultadoEmissao;
  documentoId: string;
}

/** Busca (ou cria) o documento fiscal da venda, sempre escopado à empresa dona do pedido. */
export async function documentoDoPedido(empresaId: string, pedidoId: string) {
  const existente = await prisma.documentoFiscal.findFirst({ where: { pedidoId, empresaId } });
  if (existente) return existente;
  const efetivo = await ambienteEfetivo(empresaId);
  return prisma.documentoFiscal.create({
    data: { empresaId, pedidoId, status: "pendente", ambiente: efetivo.ambiente },
  });
}

function resumirErro(erro: unknown): string {
  if (ehErroValidacao(erro)) {
    return `Dados fiscais incompletos: ${erro.campos.join("; ")}`;
  }
  const msg = erro instanceof Error ? erro.message : String(erro ?? "");
  // Nunca ecoar segredos (tokens/paths) nas mensagens persistidas.
  return msg.replace(/Bearer\s+\S+/gi, "Bearer ***").slice(0, 500);
}

/**
 * Emite a NFC-e de um pedido. Idempotente por pedido (reutiliza o
 * documento existente; re-envio em "pendente/erro/nao_configurado").
 */
export async function emitirNFCeParaPedido(
  empresaId: string,
  pedidoId: string,
  opcoes: { manual?: boolean; usuario?: { id: string; nome: string } | null } = {}
): Promise<ResultadoEmissaoComDocumento> {
  const documento = await documentoDoPedido(empresaId, pedidoId);
  if (["autorizado", "cancelado"].includes(documento.status)) {
    return { resultado: { status: documento.status as StatusDocumentoFiscal }, documentoId: documento.id };
  }

  const status = await statusConfiguracaoFiscal(empresaId);
  if (!status.configurado) {
    const faltando = status.faltando.join("; ");
    const atualizado = await prisma.documentoFiscal.update({
      where: { id: documento.id },
      data: {
        status: "nao_configurado",
        ambiente: status.ambiente,
        provedor: status.provedor || null,
        tentativas: { increment: 1 },
        erro: JSON.stringify({ motivo: "Configuração fiscal incompleta", faltando: status.faltando }),
        emitidaEm: documento.emitidaEm ?? new Date(),
      },
    });
    return {
      resultado: {
        status: "nao_configurado",
        erro: `Emissão fiscal não configurada: ${faltando}`,
      },
      documentoId: atualizado.id,
    };
  }

  // Valida dados (empresa, produtos, pagamento) — nada é enviado se faltar.
  let payload;
  try {
    payload = await montarPayloadNFCe(empresaId, pedidoId);
  } catch (erro) {
    const atualizado = await prisma.documentoFiscal.update({
      where: { id: documento.id },
      data: {
        status: "pendente",
        ambiente: status.ambiente,
        provedor: status.provedor || null,
        tentativas: { increment: 1 },
        erro: JSON.stringify({ motivo: "Validação fiscal", detalhe: resumirErro(erro) }),
      },
    });
    return {
      resultado: { status: "pendente", erro: resumirErro(erro) },
      documentoId: atualizado.id,
    };
  }

  // Envia ao provedor (nunca simula sucesso).
  const resultado = await emitirNoProvedor(empresaId, payload);
  const retorno = resultado.dados as RetornoEmissao | undefined;

  const dadosAtualizar: Record<string, unknown> = {
    status: resultado.status,
    ambiente: status.ambiente,
    provedor: status.provedor || null,
    tentativas: { increment: 1 },
    emitidaEm: new Date(),
    erro: resultado.erro
      ? JSON.stringify({ motivo: "Provedor fiscal", detalhe: resumirErro(resultado.erro) })
      : null,
  };
  if (retorno) {
    if (retorno.chave) dadosAtualizar.chave = retorno.chave;
    if (retorno.numero !== undefined) dadosAtualizar.numero = retorno.numero;
    if (retorno.serie !== undefined) dadosAtualizar.serie = retorno.serie;
    if (retorno.protocolo) dadosAtualizar.protocolo = retorno.protocolo;
    if (retorno.cStat) dadosAtualizar.cStat = retorno.cStat;
    if (retorno.xMotivo) dadosAtualizar.xMotivo = retorno.xMotivo;
    if (retorno.xml) dadosAtualizar.xml = retorno.xml;
    if (retorno.danfeUrl) dadosAtualizar.danfeUrl = retorno.danfeUrl;
    if (retorno.qrcodeUrl) dadosAtualizar.qrcodeUrl = retorno.qrcodeUrl;
    if (retorno.qrcodeTexto) dadosAtualizar.qrcodeTexto = retorno.qrcodeTexto;
  } else if (resultado.cStat) {
    dadosAtualizar.cStat = resultado.cStat;
  }
  if (resultado.xMotivo && !dadosAtualizar.xMotivo) {
    dadosAtualizar.xMotivo = resultado.xMotivo;
  }
  if (resultado.status === "autorizado") {
    dadosAtualizar.autorizadaEm = new Date();
  }

  const atualizado = await prisma.documentoFiscal.update({
    where: { id: documento.id },
    data: dadosAtualizar,
  });

  registrarAuditoria(
    "fiscal_emissao",
    `NFC-e do pedido ${pedidoId}: ${resultado.status}${resultado.xMotivo ? ` — ${resultado.xMotivo}` : ""}${opcoes.manual ? " (manual)" : ""}`,
    opcoes.usuario,
    undefined,
    empresaId
  ).catch(() => null);

  return {
    resultado: {
      status: resultado.status,
      retorno,
      erro: resultado.erro,
    },
    documentoId: atualizado.id,
  };
}
