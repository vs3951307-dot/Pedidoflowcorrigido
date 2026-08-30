import { NextRequest, NextResponse } from "next/server";
import { receberMensagemWhatsApp } from "@/lib/atendente/motor";
import {
  carregarConfiguracaoWhatsApp,
  encontrarEmpresaPorPhoneNumberId,
  enviarMensagemWhatsApp,
  verificarAssinaturaWebhook,
  verificarTokenWebhook,
  baixarMidiaWhatsApp,
} from "@/lib/atendente/whatsapp-api";
import { eventoJaProcessado } from "@/lib/atendente/deduplicador";
import { verificarLimite, ipDaRequisicao } from "@/lib/rate-limit";
import { logErro } from "@/lib/api-erro";
import { plataformaPrisma, prisma } from "@/lib/prisma";
import { ativarTenant } from "@/lib/tenant-db";
import {
  classificarAnexo,
  guardarAnexo,
  interpretarNotaFiscalPorTexto,
  interpretarNotaFiscalPorImagem,
  transcreverAudioAnexo,
  extrairTextoDoPdf,
  montarPropostaNotaFiscal,
  type AnexoRecebido,
  type DadosNotaFiscal,
} from "@/lib/copiloto/anexos";
import {
  criarPropostaOperacional,
  encontrarPropostaWhatsAppPendente,
  confirmarPropostaOperacionalWhatsApp,
  rotuloDaAcao,
} from "@/lib/copiloto/acoes";
import { parseModulos } from "@/lib/modulos";

const TAMANHO_MAXIMO_CORPO = 1_000_000; // payloads da Meta são pequenos (KB)
const TAMANHO_MAXIMO_TEXTO = 4096; // mesmo limite da API oficial ao enviar

/**
 * Webhook do WhatsApp Business Cloud API (Meta) — PEDIDO 18, multiempresa.
 *
 * - `GET`  → verificação do webhook (hub.verify_token/challenge).
 * - `POST` → recebe mensagens (entries → changes → value.messages) e
 *   responde pelo mesmo motor do atendimento.
 *
 * ISOLAMENTO ENTRE EMPRESAS: a Meta não informa a empresa — só o
 * `phone_number_id` do número que recebeu a mensagem (em
 * `value.metadata.phone_number_id`). Para CADA mensagem, resolvemos a
 * empresa dona daquele número (`encontrarEmpresaPorPhoneNumberId`) ANTES
 * de processar — uma mensagem recebida pelo número da Empresa A NUNCA é
 * processada pelo motor/atendente da Empresa B.
 *
 * Requer variáveis de ambiente OU configuração no painel por empresa
 * (veja .env.example e src/lib/atendente/whatsapp-api.ts).
 * Sem configuração, retorna 501 com instruções — o sistema segue
 * funcionando em modo simulação (painel de atendimento).
 */

function instrucoesConfiguracao() {
  return {
    erro: "WhatsApp real não configurado. Defina o token de acesso e o phone number ID no painel (Configurações → WhatsApp) ou no .env (WHATSAPP_WEBHOOK_VERIFY_TOKEN, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID).",
    simulacao:
      "Enquanto isso, o atendimento funciona em modo simulação em /admin/atendimento.",
  };
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  // A verificação do webhook é feita 1x por número cadastrado na Meta.
  // ANTES disto, qualquer valor não-vazio em hub.verify_token passava —
  // o token nunca era comparado com nada configurado. Agora só responde
  // ao challenge se o token bater com alguma empresa configurada (ou o
  // fallback `.env`) — o valor em si não expõe dado de empresa nenhuma,
  // por isso "aceitar se bater com QUALQUER empresa" é seguro aqui.
  if (mode === "subscribe" && token && challenge) {
    const valido = await verificarTokenWebhook(token);
    if (!valido) {
      return NextResponse.json({ erro: "Verificação inválida." }, { status: 403 });
    }
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ erro: "Verificação inválida." }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const limite = verificarLimite({ chave: `whatsapp:${ipDaRequisicao(req)}`, maximo: 30, janelaMs: 60_000 });
  if (!limite.permitido) {
    return NextResponse.json(
      { erro: "Muitas requisições em pouco tempo. Tente novamente em instantes." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limite.reiniciaEm / 1000)) } }
    );
  }

  // Corpo CRU (texto) — a assinatura HMAC da Meta é calculada sobre os
  // bytes exatos recebidos, então nunca passamos pelo req.json() antes.
  const corpoCru = await req.text().catch(() => "");
  if (!corpoCru || corpoCru.length > TAMANHO_MAXIMO_CORPO) {
    return NextResponse.json({ erro: "Corpo inválido ou grande demais." }, { status: 400 });
  }
  let corpo: any = null;
  try {
    corpo = JSON.parse(corpoCru);
  } catch {
    corpo = null;
  }
  if (!corpo) {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  // Resolve o primeiro phone_number_id do payload — é a chave que
  // identifica QUAL empresa é dona do número (e, portanto, qual App
  // Secret validar a assinatura). A Meta sempre envia pelo menos um em
  // payloads reais de mensagem.
  let primeiroPhoneNumberId = "";
  for (const entry of corpo.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const pid = String(value.metadata?.phone_number_id ?? "");
      if (pid) {
        primeiroPhoneNumberId = pid;
        break;
      }
    }
    if (primeiroPhoneNumberId) break;
  }

  // ---- SEGURANÇA (CRÍTICO): validação de X-Hub-Signature-256 ----
  // Sem isso, qualquer requisição HTTP era tratada como vinda da Meta —
  // um atacante poderia forjar mensagens e criar pedidos reais.
  const assinatura = req.headers.get("x-hub-signature-256");
  let appSecret = process.env.WHATSAPP_APP_SECRET ?? "";
  if (primeiroPhoneNumberId) {
    const empresaId = await encontrarEmpresaPorPhoneNumberId(primeiroPhoneNumberId);
    if (empresaId) {
      const empresa = await plataformaPrisma.empresa.findUnique({
        where: { id: empresaId },
        select: { id: true, schemaBanco: true, databaseUrlSecreta: true, slug: true },
      });
      if (empresa) ativarTenant(empresa);
      const config = await carregarConfiguracaoWhatsApp(empresaId);
      if (config?.appSecret) appSecret = config.appSecret;
    }
  }
  if (!verificarAssinaturaWebhook(corpoCru, assinatura, appSecret)) {
    return NextResponse.json(
      {
        erro: "Assinatura do webhook inválida ou não configurada. Configure o App Secret do app da Meta (variável WHATSAPP_APP_SECRET ou no painel Configurações → WhatsApp) para que a plataforma consiga validar os POSTs da Meta.",
      },
      { status: 403 }
    );
  }

  // Agrupa itens por phone_number_id (cada `value` traz o número que recebeu)
  // para resolver a empresa dona de cada uma. Texto e mídia são tratados
  // juntos: cada item carrega o `wamid` (id) para idempotência.
  const porNumero = new Map<string, ItemWhatsApp[]>();
  try {
    for (const entry of corpo.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        const phoneNumberId = String(value.metadata?.phone_number_id ?? "");
        if (!phoneNumberId) continue;
        for (const msg of value.messages ?? []) {
          const from = String(msg.from ?? "");
          if (!from) continue;
          const wamid = typeof msg.id === "string" ? msg.id : undefined;
          if (msg.type === "text" && msg.text?.body) {
            const lista = porNumero.get(phoneNumberId) ?? [];
            lista.push({ from, texto: String(msg.text.body), id: wamid });
            porNumero.set(phoneNumberId, lista);
          }
          if (["image", "audio", "document"].includes(msg.type) && msg[msg.type]?.id) {
            const tipoAnexo = classificarAnexo(msg[msg.type].mime_type ?? "application/octet-stream");
            const lista = porNumero.get(phoneNumberId) ?? [];
            lista.push({ from, mediaId: String(msg[msg.type].id), mime: String(msg[msg.type].mime_type ?? ""), tipoAnexo, id: wamid });
            porNumero.set(phoneNumberId, lista);
          }
        }
      }
    }
  } catch {
    /* estrutura inesperada → ack sem processar */
  }

  let processadas = 0;
  for (const [phoneNumberId, itens] of porNumero) {
    const empresaId = await encontrarEmpresaPorPhoneNumberId(phoneNumberId);
    if (!empresaId) {
      console.warn(`Webhook WhatsApp: phone_number_id ${phoneNumberId} não pertence a nenhuma empresa cadastrada.`);
      continue;
    }

    // Ativa o tenant desta empresa ANTES de acessar modelos de tenant.
    const empresa = await plataformaPrisma.empresa.findUnique({
      where: { id: empresaId },
      select: { id: true, schemaBanco: true, databaseUrlSecreta: true, slug: true },
    });
    if (!empresa) {
      console.warn(`Webhook WhatsApp: empresa ${empresaId} não encontrada na plataforma.`);
      continue;
    }
    ativarTenant(empresa);

    const config = await carregarConfiguracaoWhatsApp(empresaId);
    if (!config) continue;

    // Módulo Copiloto ativo (leitura no tenant já ativado).
    const empresaTenant = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { modulos: true } });
    const copilatoAtivo = parseModulos(empresaTenant?.modulos ?? "[]").includes("copiloto");

    for (const item of itens) {
      if (item.id && eventoJaProcessado(`whatsapp:${item.id}`)) continue;

      // CORREÇÃO (falha silenciosa): antes, uma exceção ao processar UMA
      // mensagem derrubava o POST inteiro. Como o deduplicador marca a
      // mensagem ANTES de processar, o reenvio da Meta era descartado —
      // o cliente mandava a mensagem e simplesmente nunca era respondido,
      // sem nada no log dizendo por quê. Agora cada mensagem é isolada.
      try {
      // Confirmação de proposta Copilato (sim / "1,3" / confirmar) — só
      // quando houver proposta pendente deste telefone. Caso contrário,
      // deixa o atendimento FSM tratar normalmente.
      if (item.texto) {
        const proposta = await encontrarPropostaWhatsAppPendente(empresaId, item.from);
        const confirmacao = parseConfirmacao(item.texto);
        if (proposta && confirmacao !== null) {
          const { ok, motivo, resultados } = await confirmarPropostaOperacionalWhatsApp(
            proposta.id,
            empresaId,
            item.from,
            confirmacao
          );
          const resposta = ok
            ? (resultados ?? []).map((r) => r.mensagem).join("\n") || "Alterações aplicadas."
            : `Não foi possível aplicar: ${motivo}`;
          await enviarMensagemWhatsApp(empresaId, item.from, resposta.slice(0, TAMANHO_MAXIMO_TEXTO));
          continue;
        }
      }

      // Mídia (foto/áudio/PDF) — só o Copiloto interpreta.
      if (item.mediaId) {
        const midia = await baixarMidiaWhatsApp(empresaId, item.mediaId);
        if (!midia) {
          await enviarMensagemWhatsApp(
            empresaId,
            item.from,
            "Recebi seu arquivo, mas não consegui baixar da Meta. Tente de novo ou envie pelo painel."
          );
          continue;
        }
        if (!copilatoAtivo) {
          // Sem o módulo Copilato: guarda o anexo e avisa, mas não interpreta.
          const caminho = await guardarAnexo(empresaId, {
            nome: midia.nome,
            tipo: midia.mime,
            bytes: midia.bytes,
          });
          await enviarMensagemWhatsApp(
            empresaId,
            item.from,
            `Recebi seu arquivo (${midia.nome}) e o guardei. Para interpretar notas fiscais, ative o módulo Copiloto no plano da sua empresa.`
          );
          void caminho;
          continue;
        }
        await processarMidiaWhatsApp(empresaId, item.from, midia, item.tipoAnexo ?? "documento");
        continue;
      }

      // Texto sem proposta pendente: atendimento FSM normal.
      if (item.texto) {
        const texto = item.texto.slice(0, TAMANHO_MAXIMO_TEXTO);
        const resultado = await receberMensagemWhatsApp(empresaId, item.from, texto, "whatsapp");
        if (resultado.resposta) {
          await enviarMensagemWhatsApp(empresaId, item.from, resultado.resposta);
        }
        processadas += 1;
      }
      } catch (erro) {
        logErro("whatsapp.webhook.mensagem", erro, {
          empresaId,
          phoneNumberId,
          wamid: item.id,
          tipo: item.mediaId ? "midia" : "texto",
        });
        // Avisa o cliente para ele não ficar no vácuo. Se o próprio
        // envio falhar, o erro original já está no log acima.
        await enviarMensagemWhatsApp(
          empresaId,
          item.from,
          "Tive um problema técnico ao processar sua mensagem. 😕 Pode mandar de novo em instantes?"
        ).catch(() => {});
      }
    }
  }

  if (porNumero.size === 0) {
    // CORREÇÃO: aqui devolvíamos 501. Só que a Meta manda MUITO mais do
    // que mensagens neste mesmo webhook — `statuses` (enviada/entregue/
    // lida), `errors`, mudanças de template. Nenhum desses traz
    // `value.messages`, então TODOS caíam neste ramo e recebiam 501. A
    // Meta trata qualquer resposta fora do 2xx como falha e reenfileira,
    // o que gera retry infinito, enche o log e chega a desabilitar a
    // assinatura do webhook.
    //
    // Quem chega até esta linha JÁ passou pela validação de assinatura —
    // ou seja, é a Meta de verdade. Confirmamos o recebimento com 200.
    return NextResponse.json({ ok: true, recebidas: 0, ignorado: "sem mensagens no payload" });
  }

  // Sempre ack 200 — a Meta reenviaria em caso de erro.
  return NextResponse.json({ ok: true, recebidas: processadas });
}

/** Itens de mensagem do WhatsApp agrupados — texto ou mídia. */
interface ItemWhatsApp {
  from: string;
  texto?: string;
  id?: string;
  mediaId?: string;
  mime?: string;
  tipoAnexo?: "imagem" | "audio" | "pdf" | "documento";
}

/**
 * Usuário responde "sim"/"confirmar" (confirma tudo) ou "1,3" (índices das
 * ações que quer aplicar). Retorna `null` quando NÃO é confirmação.
 */
function parseConfirmacao(texto: string): number[] | null {
  const t = texto.trim().toLowerCase();
  if (/^(sim|confirmar|confirmo|confirmado|ok|pode|fechar|tudo certo|certo|claro|com certeza)$/.test(t)) {
    return []; // [] = confirma todas (semântica do executor)
  }
  const numeros = t
    .split(/[,;\s]+/)
    .map((p) => Number(p))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (numeros.length > 0) {
    // WhatsApp responde 1-based → converte para 0-based.
    return numeros.map((n) => n - 1).filter((n) => n >= 0);
  }
  return null;
}

/**
 * Processa uma mídia (foto/áudio/PDF) recebida via WhatsApp pelo mesmo
 * motor do anexo do Copiloto: salva no bucket privado, interpreta e cria
 * uma PRÉVIA (proposta pendente) vinculada ao telefone. Responde ao cliente
 * com um resumo para confirmar respondendo "sim" (ou "1,3" para subconjunto).
 */
async function processarMidiaWhatsApp(
  empresaId: string,
  from: string,
  midia: { bytes: Buffer; mime: string; nome: string },
  tipoAnexo: "imagem" | "audio" | "pdf" | "documento"
) {
  const anexo: AnexoRecebido = { nome: midia.nome, tipo: midia.mime, bytes: midia.bytes };
  let caminho: string;
  try {
    caminho = await guardarAnexo(empresaId, anexo);
  } catch (erro) {
    await enviarMensagemWhatsApp(empresaId, from, "Recebi seu arquivo, mas não consegui guardá-lo. Tente de novo.");
    return;
  }
  const documento = { caminho, mime: midia.mime, nome: midia.nome };

  if (tipoAnexo === "pdf") {
    let texto = "";
    try {
      texto = await extrairTextoDoPdf(midia.bytes);
    } catch {
      await enviarMensagemWhatsApp(
        empresaId,
        from,
        "Recebi seu PDF, mas não consegui extrair o texto. Envie uma foto ou cadastre a nota pelo painel."
      );
      return;
    }
    const dados = await interpretarNotaFiscalPorTexto(empresaId, texto);
    if (dados) return await responderPropostaNotaWhatsApp(empresaId, from, "pdf", dados, documento);
    await enviarMensagemWhatsApp(
      empresaId,
      from,
      "Recebi seu PDF e o guardei com segurança, mas não consegui identificar os dados da nota. Cadastre a nota pelo painel (Admin → Estoque → Notas fiscais)."
    );
    return;
  }

  if (tipoAnexo === "imagem") {
    const dados = await interpretarNotaFiscalPorImagem(empresaId, midia.bytes, midia.mime);
    if (dados) return await responderPropostaNotaWhatsApp(empresaId, from, "imagem", dados, documento);
    await enviarMensagemWhatsApp(
      empresaId,
      from,
      "Recebi sua foto e a guardei. A interpretação automática da nota exige a chave de IA configurada. Envie o PDF da nota por alternativa."
    );
    return;
  }

  if (tipoAnexo === "audio") {
    const texto = await transcreverAudioAnexo(empresaId, midia.bytes, midia.mime);
    if (texto) {
      const roteiroBase = texto;
      // O áudio transcrito é tratado pelo interpretador de texto do Copiloto
      // (mesmo do painel): operação → prévia, senão consulta.
      const { interpretarOperacaoPorTexto } = await import("@/lib/copiloto/acoes");
      const proposta = interpretarOperacaoPorTexto(roteiroBase);
      if (proposta.acoes.length > 0) {
        const actionId = await criarPropostaOperacional(
          empresaId,
          `whatsapp:${from.replace(/\D/g, "")}`,
          `Áudio: ${roteiroBase}`,
          proposta.acoes,
          { origem: "whatsapp" }
        );
        const rot = proposta.rotulos.map((r, i) => `${i + 1}. ${r}`).join("\n");
        const msg = `Ouvir: "${roteiroBase.slice(0, 300)}"\n\n${rot}\n\nResponda *sim* para aplicar tudo ou os números (ex.: 1,3).`;
        await enviarMensagemWhatsApp(empresaId, from, msg.slice(0, TAMANHO_MAXIMO_TEXTO));
        return;
      }
      await enviarMensagemWhatsApp(
        empresaId,
        from,
        `Transcrevi seu áudio:\n"${roteiroBase.slice(0, 800)}"\n\nSe quiser, mande a dúvida por texto que eu respondo. 😉`
      );
      return;
    }
    await enviarMensagemWhatsApp(
      empresaId,
      from,
      "Recebi seu áudio e o guardei, mas não consegui transcrever (transcrição por IA não está configurada)."
    );
  }

  await enviarMensagemWhatsApp(
    empresaId,
    from,
    "Recebi seu arquivo e o guardei com segurança, mas não sei interpretar este formato. Envie como PDF ou foto."
  );
}

async function responderPropostaNotaWhatsApp(
  empresaId: string,
  from: string,
  tipoAnexo: string,
  dados: DadosNotaFiscal,
  documento: { caminho: string; mime: string; nome: string }
) {
  const { acoes, itensSemEstoque } = await montarPropostaNotaFiscal(empresaId, dados, documento);
  const telefone = from.replace(/\D/g, "");
  const actionId = await criarPropostaOperacional(
    empresaId,
    `whatsapp:${telefone}`,
    "Anexo: nota fiscal",
    acoes,
    { origem: "whatsapp" }
  );
  const linhas = acoes.map((a, i) => `${i + 1}. ${rotuloDaAcao(a)}`);
  const sem = itensSemEstoque.length > 0
    ? `\n\n⚠ ${itensSemEstoque.length} item(ns) da nota não estavam no estoque: ${itensSemEstoque.slice(0, 3).join(", ")}.`
    : "";
  const msg =
    `Recebi sua nota fiscal (${dados.fornecedor} — NF-e ${dados.numero} — R$ ${Number(dados.valor).toFixed(2)}, ${dados.itens.length} itens).\n\n` +
    `O que registrar?\n${linhas.join("\n")}${sem}\n\n` +
    `Responda *sim* para aplicar tudo ou os números (ex.: *1,3*).`;
  await enviarMensagemWhatsApp(empresaId, from, msg.slice(0, TAMANHO_MAXIMO_TEXTO));
}
