import { NextRequest, NextResponse } from "next/server";
import { autorizar, registrarAuditoria } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { verificarLimite, ipDaRequisicao } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { parseModulos } from "@/lib/modulos";
import { CONSULTAS, listarConsultasDisponiveis, sanitizarParametros } from "@/lib/copiloto/consultas";
import { escolherConsulta } from "@/lib/copiloto/interpretador";
import {
  interpretarOperacaoPorTexto,
  criarPropostaOperacional,
  confirmarPropostaOperacional,
  rotuloDaAcao,
} from "@/lib/copiloto/acoes";
import { bloquearPerguntaProibida } from "@/lib/copiloto/guardas";
import {
  classificarAnexo,
  guardarAnexo,
  interpretarNotaFiscalPorTexto,
  interpretarNotaFiscalPorImagem,
  transcreverAudioAnexo,
  extrairTextoDoPdf,
  descreverImagem,
  montarPropostaNotaFiscal,
  type AnexoRecebido,
  type DadosNotaFiscal,
} from "@/lib/copiloto/anexos";

/** O Copiloto é um módulo contratável: sem ele, nem o menu aparece. */
async function moduloCopilotoAtivo(empresaId: string): Promise<boolean> {
  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { modulos: true } });
  return parseModulos(empresa?.modulos ?? "[]").includes("copiloto");
}

/** Limite do anexo (PDF/áudio são pesados; imagem do WhatsApp chega comprimida). */
const TAMANHO_MAXIMO_ANEXO_BYTES = 15 * 1024 * 1024;
const MIMES_PERMITIDOS = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/amr",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/opus",
  "audio/webm",
]);

export const GET = comTratamentoDeErro("copiloto.GET", async () => {
  // Lista as consultas disponíveis — útil pra montar sugestões na tela.
  const acesso = await autorizar("admin");
  if (!acesso.ok) return acesso.resposta;
  if (!(await moduloCopilotoAtivo(acesso.empresaId))) {
    return NextResponse.json({ erro: "O módulo Copiloto não está disponível no plano desta empresa." }, { status: 402 });
  }
  return NextResponse.json({ consultas: listarConsultasDisponiveis() });
});

/**
 * Copiloto da Empresa — quatro modos, sempre com `empresaId` da SESSÃO
 * (nunca do corpo da requisição, nunca do prompt, nunca do anexo):
 *
 *  1. `{ confirmar: true, actionId, selecionados? }` → executa as ações
 *     JÁ PROPOSTAS e confirmadas pelo usuário. `selecionados` (índices
 *     das checkboxes da prévia) filtra QUAIS ações aplicar.
 *  2. `{ pergunta }` que descreve uma OPERAÇÃO ("chegaram 10 cocas",
 *     "acabou calabresa") → devolve uma PRÉVIA + `actionId`; não
 *     altera nada ainda.
 *  3. `{ pergunta }` de CONSULTA → responde com dados reais do banco.
 *  4. `{ pergunta?, anexo: { nome, tipo, base64 } }` (foto, áudio, PDF/
 *     nota fiscal) → o arquivo é guardado no bucket PRIVADO, interpretado
 *     e devolve PRÉVIA + `actionId` (mesma confirmação explícita de 1/2).
 */
export const POST = comTratamentoDeErro("copiloto.POST", async (req: NextRequest) => {
  // Só Administrador por padrão — ajuste o recurso se quiser liberar pra outro papel.
  const acesso = await autorizar("admin");
  if (!acesso.ok) return acesso.resposta;
  if (!(await moduloCopilotoAtivo(acesso.empresaId))) {
    return NextResponse.json({ erro: "O módulo Copiloto não está disponível no plano desta empresa." }, { status: 402 });
  }
  const ip = ipDaRequisicao(req);
  const limite = verificarLimite({ chave: `copiloto:${acesso.usuario.id}`, maximo: 20, janelaMs: 60_000 });
  if (!limite.permitido) {
    return NextResponse.json({ erro: "Muitas perguntas em pouco tempo. Aguarde um instante." }, { status: 429 });
  }

  const corpo = await req.json().catch(() => ({}));

  // ---- Modo 1: confirmação de uma ação operacional já proposta ----
  if (corpo.confirmar && typeof corpo.actionId === "string") {
    const selecionados = Array.isArray(corpo.selecionados)
      ? corpo.selecionados.map((s: unknown) => Number(s)).filter((n: number) => Number.isInteger(n) && n >= 0)
      : undefined;
    const resultado = await confirmarPropostaOperacional(corpo.actionId, acesso.empresaId, acesso.usuario, selecionados);
    if (!resultado.ok) {
      return NextResponse.json({ erro: resultado.motivo }, { status: 400 });
    }
    const mensagens = (resultado.resultados ?? []).map((r) => r.mensagem);
    return NextResponse.json({ modo: "aplicado", mensagens, resultados: resultado.resultados });
  }

  // ---- Modo 4: anexo multimídia (foto / áudio / PDF / documento) ----
  if (corpo.anexo && typeof corpo.anexo === "object") {
    return processarAnexo(acesso.empresaId, acesso.usuario, ip, corpo.anexo, String(corpo.pergunta ?? "").trim());
  }

  const pergunta = String(corpo.pergunta ?? "").trim();
  if (!pergunta) {
    return NextResponse.json({ erro: "Digite uma pergunta." }, { status: 400 });
  }
  if (pergunta.length > 300) {
    return NextResponse.json({ erro: "Pergunta muito longa." }, { status: 400 });
  }

  return tratarPergunta(acesso.empresaId, acesso.usuario, ip, pergunta);
});

/** Interpreta, propõe e guarda um anexo — devolve prévia para confirmação. */
async function processarAnexo(
  empresaId: string,
  usuario: { id: string; nome: string },
  ip: string | undefined,
  anexoBruto: Record<string, unknown>,
  perguntaAcompanhante: string
): Promise<NextResponse> {
  const nome = String(anexoBruto.nome ?? "").trim().slice(0, 200) || "anexo";
  const tipo = String(anexoBruto.tipo ?? "").trim().toLowerCase();
  if (!MIMES_PERMITIDOS.has(tipo)) {
    return NextResponse.json(
      { erro: "Formato não suportado. Envie PDF, foto (JPEG/PNG/WebP) ou áudio." },
      { status: 400 }
    );
  }

  let base64 = String(anexoBruto.base64 ?? "");
  const casamento = base64.match(/^data:[a-z0-9.\/-]+;base64,(.+)$/);
  if (casamento) base64 = casamento[1];
  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, "base64");
  } catch {
    return NextResponse.json({ erro: "Arquivo corrompido — tente enviar de novo." }, { status: 400 });
  }
  if (bytes.length === 0) return NextResponse.json({ erro: "Arquivo vazio." }, { status: 400 });
  if (bytes.length > TAMANHO_MAXIMO_ANEXO_BYTES) {
    return NextResponse.json({ erro: "Arquivo maior que 15MB — escolha um arquivo menor." }, { status: 413 });
  }

  // Sempre guarda o arquivo no bucket PRIVADO antes de qualquer interpretação.
  const anexo: AnexoRecebido = { nome, tipo, bytes };
  let caminho: string;
  try {
    caminho = await guardarAnexo(empresaId, anexo);
  } catch (erro) {
    return NextResponse.json(
      { erro: erro instanceof Error ? erro.message : "Não foi possível guardar o arquivo." },
      { status: 500 }
    );
  }
  await registrarAuditoria("copiloto.anexo", `${tipo} "${nome}" guardado`, usuario, ip, empresaId);
  const documento = { caminho, mime: tipo, nome };

  const tipoAnexo = classificarAnexo(tipo);

  // PDF → extrai texto e interpreta como nota fiscal (IA ou heurística).
  if (tipoAnexo === "pdf") {
    let texto = "";
    try {
      texto = await extrairTextoDoPdf(bytes);
    } catch {
      return anexoGuardadoResposta({ caminho, tipo, tipoAnexo, mensagem: "O PDF foi guardado, mas não consegui extrair o texto dele." });
    }
    const dados = await interpretarNotaFiscalPorTexto(empresaId, texto);
    if (dados) return responderPropostaDeNota(empresaId, usuario.id, "pdf", dados, documento);
    return anexoGuardadoResposta({
      caminho,
      tipo,
      tipoAnexo,
      mensagem: "Recebi o PDF e o guardei com segurança, mas não consegui identificar os dados da nota. Você pode cadastrar pelo próprio Copiloto ou na tela de notas fiscais.",
    });
  }

  // Imagem → tenta visão (sem IA configurada não há como interpretar — guarda e avisa).
  if (tipoAnexo === "imagem") {
    const dados = await interpretarNotaFiscalPorImagem(empresaId, bytes, tipo);
    if (dados) return responderPropostaDeNota(empresaId, usuario.id, "imagem", dados, documento);
    const descricao = await descreverImagem(empresaId, bytes, tipo);
    return anexoGuardadoResposta({
      caminho,
      tipo,
      tipoAnexo,
      mensagem: descricao
        ? `Recebi a imagem (${descricao}). A interpretação automática da nota exige a chave de IA configurada — o arquivo ficou guardado em segurança.`
        : "Recebi a imagem e a guardei com segurança, mas não consegui interpretá-la automaticamente (a visão por IA não está configurada).",
    });
  }

  // Áudio → transcreve; com texto, segue o fluxo normal de pergunta.
  if (tipoAnexo === "audio") {
    const texto = await transcreverAudioAnexo(empresaId, bytes, tipo);
    if (texto) {
      const junta = [perguntaAcompanhante, texto].filter(Boolean).join(" ");
      await registrarAuditoria("copiloto.audio_transcrito", `Áudio transcrito: "${junta}"`, usuario, ip, empresaId);
      return tratarPergunta(empresaId, usuario, ip, junta.slice(0, 4000));
    }
    return anexoGuardadoResposta({
      caminho,
      tipo,
      tipoAnexo,
      mensagem: "Recebi o áudio e o guardei, mas não consegui transcrever (transcrição por IA não está configurada).",
    });
  }

  return anexoGuardadoResposta({
    caminho,
    tipo,
    tipoAnexo,
    mensagem: "Recebi o documento e o guardei com segurança, mas não sei interpretar este formato. Envie como PDF ou foto.",
  });
}

function anexoGuardadoResposta(p: { caminho: string; tipo: string; tipoAnexo: string; mensagem: string }): NextResponse {
  return NextResponse.json({
    modo: "anexo_guardado",
    tipoAnexo: p.tipoAnexo,
    tipo: p.tipo,
    anexoCaminho: p.caminho,
    mensagem: p.mensagem,
  });
}

/** Monta a PRÉVIA (checkbox: nota e/ou entradas) para uma nota fiscal interpretada. */
async function responderPropostaDeNota(
  empresaId: string,
  solicitanteId: string,
  tipoAnexo: string,
  dados: DadosNotaFiscal,
  documento: { caminho: string; mime: string; nome: string }
): Promise<NextResponse> {
  const { acoes, itensSemEstoque } = await montarPropostaNotaFiscal(empresaId, dados, documento);
  const actionId = await criarPropostaOperacional(empresaId, solicitanteId, "Anexo: nota fiscal", acoes);
  return NextResponse.json({
    modo: "confirmacao",
    actionId,
    tipoAnexo,
    anexoCaminho: documento.caminho,
    nota: dados,
    rotulos: acoes.map(rotuloDaAcao),
    itensSemEstoque,
    aviso:
      "Confira os dados da nota e marque o que quer registrar: a nota fiscal, a entrada no estoque (itens que batem com o cadastro) ou ambos. Nada será alterado antes da sua confirmação.",
  });
}

/** Fluxo padrão de pergunta em texto (operação → prévia; senão consulta). */
async function tratarPergunta(
  empresaId: string,
  usuario: { id: string; nome: string },
  ip: string | undefined,
  pergunta: string
): Promise<NextResponse> {
  const bloqueio = bloquearPerguntaProibida(pergunta);
  if (bloqueio) {
    await registrarAuditoria("copiloto.bloqueado", `Comando bloqueado — ${bloqueio} — "${pergunta}"`, usuario, ip, empresaId);
    return NextResponse.json({ modo: "bloqueado", motivo: bloqueio });
  }

  const proposta = interpretarOperacaoPorTexto(pergunta);
  if (proposta.acoes.length > 0) {
    const actionId = await criarPropostaOperacional(empresaId, usuario.id, pergunta, proposta.acoes);
    return NextResponse.json({
      modo: "confirmacao",
      pergunta,
      actionId,
      rotulos: proposta.rotulos,
      aviso: "Confira e confirme antes de eu alterar qualquer coisa.",
    });
  }

  const escolha = await escolherConsulta(empresaId, pergunta);
  if (!escolha || !CONSULTAS[escolha.consulta]) {
    return NextResponse.json(
      {
        erro: "Não consegui identificar essa pergunta entre as consultas disponíveis.",
        consultasDisponiveis: listarConsultasDisponiveis(),
      },
      { status: 200 }
    );
  }
  const definicao = CONSULTAS[escolha.consulta];
  const dados = await definicao.executar(empresaId, sanitizarParametros(definicao, escolha.parametros ?? {}));
  await registrarAuditoria("copiloto.consulta", `${escolha.consulta} — "${pergunta}"`, usuario, ip, empresaId);
  return NextResponse.json({
    modo: "consulta",
    consulta: escolha.consulta,
    pergunta,
    dados,
    resumo: definicao.resumir(dados),
  });
}
