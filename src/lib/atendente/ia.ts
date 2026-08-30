/**
 * IA opcional do atendente (PEDIDO 8/9) — apenas entendimento de
 * linguagem, via camada de provedor configurável (padrão Gemini —
 * ver src/lib/ai-provider.ts).
 *
 * Quando `IA_ATENDENTE_API_KEY` está configurada, um LLM é usado para
 * *normalizar* a mensagem do cliente: corrige erros de digitação,
 * sinônimos e mapeia os termos para os nomes EXATOS do cadastro. O
 * resultado vira texto normalizado que o motor (FSM) processa com as
 * mesmas validações do banco.
 *
 * O LLM NUNCA decide valores: não recebe autoridade para preço, taxa,
 * disponibilidade ou forma de pagamento — tudo continua validado contra
 * o banco em `motor.ts`. Sem a chave, o atendimento funciona 100% com o
 * interpretador determinístico (regras).
 */

import { registrarUsoIA, limiteIaExcedido, estimarTokens } from "@/lib/uso-ia";
import { chamarIA } from "@/lib/ai-provider";
import type { PersonaAtendente } from "@/lib/atendente/persona";

export function iaDisponivel(): boolean {
  return Boolean(process.env.IA_ATENDENTE_API_KEY);
}

interface ContextoInterpretacao {
  empresaId: string;
  etapa: string;
  mensagem: string;
  catalogo: unknown;
  estadoResumo: string;
  persona?: PersonaAtendente;
}

interface ContextoEmbelezamento {
  empresaId: string;
  etapa: string;
  respostaBase: string;
  estadoResumo: string;
  persona?: PersonaAtendente;
  /** Nome do cliente, se soubermos. */
  clienteNome?: string | null;
  /** Item que está sendo montado agora (produto + escolhas parciais), se houver. */
  itemAtual?: string | null;
  /** Nome da loja/pizzaria. */
  loja?: string | null;
  /** Resumo em português de tudo que já foi decidido na conversa. */
  historico?: string | null;
}

/**
 * Normaliza a mensagem com o LLM. Em qualquer falha (sem chave, timeout,
 * resposta inválida, LIMITE DE IA DA EMPRESA ESGOTADO) devolve o texto
 * original — o fluxo nunca quebra, só deixa de usar a IA (o
 * interpretador determinístico assume a partir do texto original).
 */
export async function interpretarMensagem(ctx: ContextoInterpretacao): Promise<string> {
  if (!iaDisponivel()) return ctx.mensagem;
  if (await limiteIaExcedido(ctx.empresaId).catch(() => false)) return ctx.mensagem;

  const prompt = [
    "Você é o normalizador de mensagens do atendente WhatsApp de uma pizzaria.",
    "Você recebe: a etapa atual do atendimento, a mensagem do cliente e o cardápio REAL do banco.",
    'Tarefa: responder APENAS com JSON {"texto": "..."}.',
    "O 'texto' deve ser a mensagem do cliente REESCRITA de forma clara, corrigindo erros de digitação e",
    "substituindo termos livres/apelidos pelos nomes EXATOS do cardápio fornecido (produtos, sabores, tamanhos, adicionais).",
    "REGRAS OBRIGATÓRIAS:",
    "- NUNCA invente nomes, preços, tamanhos, sabores, adicionais ou valores: use somente o que está no cardápio fornecido.",
    "- RECONHEÇA apelidos comuns e mapeie para o nome exato do cardápio: 'coca'/'coca-cola'/'coca cola' → o refrigerante do cardápio, 'guarana'/''guaraná' → o guaraná, 'fanta' → a fanta, 'torre' → a porção Torre, 'batata' → Batata Frita, 'frango' → a pizza/produto de frango, etc.",
    "- Se a mensagem pede MAIS DE UM item (separados por 'e', 'com', ',' ou 'mais'), reescreva mantendo os DOIS nomes exatos separados por ' e ' (ex.: 'torre e coca' → 'Torre e Refrigerante 2L').",
    "- Se o pedido do cliente não existir no cardápio, mantenha o texto original (o motor vai lidar com isso).",
    "- Se a mensagem contém escolha numérica (ex.: 'o número 2'), mantenha o número.",
    "- Responda somente o JSON, sem comentários.",
    "",
    `Etapa atual: ${ctx.etapa}`,
    `Estado da conversa (resumo): ${ctx.estadoResumo}`,
    `Cardápio real (banco): ${JSON.stringify(ctx.catalogo)}`,
    "",
    "Identidade do atendente:",
    `- Nome: ${ctx.persona?.nome?.trim() || "atendente virtual"}`,
    `- Tom de voz: ${ctx.persona?.tom ?? "simpatico"}`,
    `- Regras de negócio: ${ctx.persona?.regras?.trim() || "nenhuma regra informada"}`,
    `- Horário de funcionamento: ${ctx.persona?.horario?.trim() || "não informado"}`,
    "",
    `Mensagem do cliente: "${ctx.mensagem}"`,
  ].join("\n");

  const resposta = await chamarIA("whatsapp", { prompt, temperatura: 0, json: true, timeoutMs: 8000 });
  if (!resposta) return ctx.mensagem;

  try {
    const json = JSON.parse(resposta.texto) as { texto?: unknown };
    const texto = typeof json.texto === "string" ? json.texto.trim() : "";

    registrarUsoIA(ctx.empresaId, "atendimento", {
      tokensEntrada: resposta.tokensEntrada || estimarTokens(prompt),
      tokensSaida: resposta.tokensSaida || estimarTokens(resposta.texto),
    }).catch(() => null);

    return texto.length >= 1 && texto.length <= 500 ? texto : ctx.mensagem;
  } catch {
    return ctx.mensagem;
  }
}

/**
 * Reescreve a resposta validada do motor de forma natural e amigável.
 *
 * Diferente de `interpretarMensagem` (que só corrige a fala do cliente),
 * esta função recebe a resposta PRONTA que o motor determinístico gerou
 * (com preços, opções, etapas, resumo do pedido — tudo JÁ validado contra
 * o banco) e pede ao LLM para reescrevê-la com uma linguagem mais humana,
 * fiel ao tom da persona, SEM inventar, omitir ou mudar nenhum dado.
 *
 * Segurança: a IA nunca define o conteúdo — apenas melhora o texto. Se
 * faltar a resposta em JSON, ela for vazia, muito curta ou muito longa,
 * devolve a resposta base do motor intacta (nunca quebra o atendimento).
 */
export async function embelezarResposta(ctx: ContextoEmbelezamento): Promise<string | null> {
  if (!iaDisponivel()) return null;
  if (await limiteIaExcedido(ctx.empresaId).catch(() => false)) return null;

  const tom = ctx.persona?.tom ?? "simpatico";
  const nomeCliente = ctx.clienteNome?.trim();
  const loja = ctx.loja?.trim();
  const regras = ctx.persona?.regras?.trim();
  const historico = ctx.historico?.trim();

  const prompt = [
    "Você é um(a) atendente de verdade de uma PIZZARIA atendendo pelo WhatsApp.",
    "Você fala como um garçom ou atendente humano: simples, natural, atencioso e sem rodeios.",
    "",
    `Pizzaria: ${loja || "a pizzaria"}`,
    `Atendendo: ${nomeCliente || "um cliente"}`,
    `Tom esperado: ${tom}`,
    regras ? `Regras do negócio (respeite se o assunto envolver): ${regras}` : "",
    "",
    "O SISTEMA JÁ decidiu o que responder e validou tudo contra o cadastro real (preços, opções, produtos).",
    "Sua tarefa é REESCREVER essa resposta com a forma que UM ATENDENTE HUMANO falaria, mantendo SEMPRE:",
    "- TODOS os dados exatos: preços (R$), nomes de produtos/sabores/tamanhos, opções listadas, quantidades, resumo do pedido e palco da conversa (o que está sendo perguntado).",
    "- O MESMO objetivo da resposta original: se ela pergunta o tamanho, pergunte o tamanho; se lista opções, liste as MESMAS opções; se pede confirmação, peça a confirmação.",
    "",
    "Como falar como um atendente humano (IMPORTANTE):",
    "- Escreva como quem conversa no WhatsApp: frases curtas, pontuação natural, sem burocracia.",
    "- Use a chama o cliente pelo nome de vez em quando (ex.: 'Beleza, *José*!').",
    "- Não transforme isso num formulário; soe como conversa. Mas NÃO pule etapas nem junte perguntas que o sistema separa.",
    "- Emojis com moderação (pedidos de pizza podem ter 1 ou 2).",
    "- Use asteriscos (*) apenas para destacar nomes de produtos, valores e opções.",
    "",
    "O QUE NÃO FAZER (jamais):",
    "- NUNCA invente, adicione, remova ou mude produtos, preços, sabores, tamanhos, adicionais, taxas, formas de pagamento ou qualquer dado.",
    "- NUNCA fale de algo que não existe na resposta original e no contexto fornecido.",
    "- NÃO escreva uma resposta diferente da que o sistema precisa. Mantenha o mesmo número de opções e a mesma pergunta.",
    "- NÃO responda por JSON além do formato pedido.",
    "",
    `Histórico da conversa até aqui (resumo): ${historico || "início do atendimento"}`,
    `Item que o cliente está escolhendo agora: ${ctx.itemAtual || "nenhum em montagem"}`,
    `Carrinho já confirmado: ${ctx.estadoResumo || "vazio"}`,
    `Etapa atual: ${ctx.etapa}`,
    "",
    `Resposta oficial do sistema (reescreva mantendo os DADOS e o OBJETIVO, melhorando só a NATURALIDADE):`,
    `"${ctx.respostaBase}"`,
    "",
    "Responda APENAS com JSON {\"texto\": \"...\"}, sem comentários.",
  ].join("\n");

  const resposta = await chamarIA("whatsapp", { prompt, temperatura: 0.8, json: true, timeoutMs: 8000 });
  if (!resposta) return null;

  try {
    const json = JSON.parse(resposta.texto) as { texto?: unknown };
    const texto = typeof json.texto === "string" ? json.texto.trim() : "";

    registrarUsoIA(ctx.empresaId, "atendimento", {
      tokensEntrada: resposta.tokensEntrada || estimarTokens(prompt),
      tokensSaida: resposta.tokensSaida || estimarTokens(resposta.texto),
    }).catch(() => null);

    // Aceita respostas do tamanho da original (até ~60% maior). Se a IA
    // devolveu algo fora do esperado, mantém a resposta do motor.
    const maximo = Math.max(560, Math.ceil(ctx.respostaBase.length * 1.6));
    return texto.length >= 1 && texto.length <= maximo ? texto : null;
  } catch {
    return null;
  }
}
