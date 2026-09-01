/**
 * Agente WhatsApp com tool calling (Fase 5).
 *
 * Substitui o fluxo FSM como camada PRIMÁRIA de processamento.
 * O LLM decide QUAL tool chamar; o código executa, valida e mantém
 * o estado. Se a IA falhar ou não estiver disponível, o FSM
 * determinístico (motor.ts) assume como fallback seguro.
 *
 * LOOP:
 *   1. Monta prompt com persona + tools + estado + contexto
 *   2. Chama LLM (JSON mode) com retry (2 tentativas)
 *   3. Se resposta tem tool_calls → executa, atualiza estado, repete (max 3x)
 *   4. Se resposta tem texto → retorna ao cliente
 *   5. Se falha → cai no FSM
 */

import { chamarIA } from "@/lib/ai-provider";
import { registrarUsoIA, limiteIaExcedido, estimarTokens } from "@/lib/uso-ia";
import { carregarPersonaAtendente, RESTRICOES_FLUXO, type PersonaAtendente } from "@/lib/atendente/persona";
import {
  TOOL_DEFINITIONS,
  executarTool,
  type NomeTool,
  type ContextoTool,
  type ResultadoTool,
} from "@/lib/atendente/tools";
import { nomeFantasia } from "@/lib/atendente/catalogo";

/* --------------------------------- Tipos ---------------------------------- */

interface ToolCallLLM {
  name: string;
  params: Record<string, unknown>;
}

interface RespostaAgente {
  texto: string;
  toolCallsExecutados: string[];
  estado: ContextoTool["estado"];
}

/* --------------------------------- Prompt --------------------------------- */

const MAX_ITERACOES = 3;
const MAX_TENTATIVAS_CHAMADA = 2; // retry em caso de falha da IA
const TIMEOUT_MS = 15_000; // 15s (era 10s)

/**
 * Extrai JSON de uma resposta que pode ter texto antes/depois do JSON.
 * Tenta encontrar o primeiro { ... } ou [ ... ] na resposta.
 */
function extrairJSON(texto: string): Record<string, unknown> | null {
  // Tenta parse direto primeiro
  try {
    return JSON.parse(texto);
  } catch {
    // prossegue
  }

  // Tenta extrair JSON de um bloco de código markdown
  const matchCodeBlock = texto.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (matchCodeBlock) {
    try {
      return JSON.parse(matchCodeBlock[1].trim());
    } catch {
      // prossegue
    }
  }

  // Tenta encontrar o primeiro { ... } balanceado
  const startObj = texto.indexOf("{");
  if (startObj >= 0) {
    let depth = 0;
    for (let i = startObj; i < texto.length; i++) {
      if (texto[i] === "{") depth++;
      else if (texto[i] === "}") depth--;
      if (depth === 0) {
        try {
          return JSON.parse(texto.slice(startObj, i + 1));
        } catch {
          // tenta o próximo
        }
      }
    }
  }

  return null;
}

/**
 * Monta o system prompt completo para o agente.
 * Inclui persona, tools disponíveis, estado atual e restrições.
 */
function montarSystemPrompt(
  persona: PersonaAtendente,
  loja: string | null,
  estado: ContextoTool["estado"],
  etapa: string
): string {
  const nome = persona.nome.trim() || "atendente";
  const lojaFinal = loja || "a pizzaria";

  const estadoResumo = [
    estado.itens.length > 0
      ? `Itens no carrinho: ${estado.itens.map((i) => `${i.quantidade}x ${i.nome}${i.tamanho ? ` (${i.tamanho})` : ""}`).join(", ")}`
      : "Carrinho vazio",
    estado.canal ? `Canal: ${estado.canal}` : "",
    estado.endereco ? `Endereco: ${estado.endereco.rua} - ${estado.endereco.bairro}` : "",
    estado.formaPagamento ? `Pagamento: ${estado.formaPagamento}` : "",
    estado.cliente?.nome ? `Cliente: ${estado.cliente.nome}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const toolsDisponiveis = Object.keys(TOOL_DEFINITIONS)
    .filter((nome) => {
      switch (etapa) {
        case "saudacao":
        case "identificacao":
          return ["listar_cardapio", "buscar_produto", "ver_preco", "ver_disp", "ver_status_pedido"].includes(nome);
        case "intencao":
          return true;
        case "produto":
          return ["listar_cardapio", "buscar_produto", "ver_preco", "ver_disp", "selecionar_produto"].includes(nome);
        case "tamanho":
          return ["escolher_tamanho"].includes(nome);
        case "sabores":
          return ["escolher_sabor"].includes(nome);
        case "adicionais":
          return ["escolher_adicional"].includes(nome);
        case "quantidade":
          return ["definir_quantidade"].includes(nome);
        case "mais_itens":
          return ["listar_cardapio", "buscar_produto", "ver_total", "remover_item", "escolher_canal"].includes(nome);
        case "entrega_retirada":
          return ["escolher_canal"].includes(nome);
        case "endereco":
          return ["definir_endereco"].includes(nome);
        case "pagamento":
          return ["escolher_pagamento", "ver_total", "remover_item"].includes(nome);
        case "resumo":
          return ["confirmar_pedido", "ver_total", "remover_item", "listar_cardapio", "buscar_produto"].includes(nome);
        default:
          return false;
      }
    })
    .map((n) => {
      const def = TOOL_DEFINITIONS[n as NomeTool];
      return `  - ${n}: ${def.descricao}\n    Parametros: ${def.parametros}`;
    })
    .join("\n");

  return [
    `Voce e ${nome}, atendente de WhatsApp da ${lojaFinal}.`,
    "Atende como um garcom humano: simples, natural, atencioso e sem rodeios.",
    "",
    "COMO RESPONDER:",
    "Responda APENAS com JSON valido. Duas opcoes:",
    "",
    '1. Para CHAMAR UMA TOOL (executar uma acao):',
    '   {"tool_calls": [{"name": "nome_da_tool", "params": {parametros}}]}',
    '   Exemplo: {"tool_calls": [{"name": "buscar_produto", "params": {"termo": "calabresa"}}]}',
    "",
    '2. Para RESPONDER AO CLIENTE (texto direto):',
    '   {"texto": "sua mensagem aqui"}',
    '   Exemplo: {"texto": "Ola! Como posso te ajudar?"}',
    "",
    "REGRAS CRITICAS DE INTERPRETACAO:",
    "- NUNCA trate palavras genericas como nome de produto.",
    '  Palavras como "pizza", "pizzas", "pedido", "quero pedir", "cardapio", "comida", "lanche" sao INTENCOES, nao produtos.',
    '  Se o cliente diz "pizza" -> NAO chame buscar_produto. Responda oferecendo sabores ou cardapio.',
    '  Se o cliente diz "quero pedir" -> inicie o fluxo de pedido, nao busque "quero pedir" no cardapio.',
    '  Se o cliente diz "pedido" -> pergunte se quer ver cardapio ou ja sabe o que quer.',
    '  Se o cliente diz "cardapio" -> chame listar_cardapio.',
    '  Se o cliente diz "promocao" -> responda sobre promocoes.',
    '  Se o cliente diz algo vago no contexto ("essa", "pode ser", "quero", "sim") -> interprete pelo contexto da conversa.',
    '  So use buscar_produto quando o cliente informar um NOME ESPECIFICO (ex: "calabresa", "4 queijos", "frango").',
    '  NUNCA responda "Nao encontrei" quando o cliente usa palavra generica ou demonstra intencao de fazer pedido.',
    "",
    "REGRAS:",
    "- Voce TEM tools disponiveis. Use-as quando precisar buscar dados reais (preco, produto, disponibilidade).",
    "- NUNCA invente precos, produtos, sabores ou qualquer dado. Tudo vem das tools.",
    "- Uma mensagem pode conter VARIAS tool_calls (array). O sistema executa todas de uma vez.",
    "- Depois de executar tools, o resultado aparece como 'Resultado da tool: ...' na conversa.",
    "- Use o resultado das tools para formular sua resposta ao cliente.",
    "- Se o cliente quer fazer um pedido, comece chamando 'buscar_produto' ou 'listar_cardapio'.",
    "- Se o cliente pergunta preco, chame 'ver_preco'.",
    "- Se o cliente quer verificar disponibilidade, chame 'ver_disp'.",
    "- IMPORTANTE: Responda SEMPRE com JSON valido. NUNCA responda com texto puro fora do JSON.",
    "",
    RESTRICOES_FLUXO,
    "",
    `Etapa atual do fluxo: ${etapa}`,
    "",
    `Estado da conversa:\n${estadoResumo}`,
    "",
    "Tools disponiveis:",
    toolsDisponiveis || "  (nenhuma tool disponivel para esta etapa - responda com texto)",
  ].join("\n");
}

/* --------------------------------- Agente --------------------------------- */

/**
 * Chama a IA com retry (até MAX_TENTATIVAS_CHAMADA tentativas).
 * Retorna a resposta ou null se todas falharem.
 */
async function chamarIAComRetry(
  systemPrompt: string,
  mensagemCliente: string,
  contextoExtra: string
): Promise<ReturnType<typeof chamarIA> extends Promise<infer R> ? R : never> {
  const prompt = [
    systemPrompt,
    "",
    `Mensagem do cliente: "${mensagemCliente}"`,
    contextoExtra,
  ]
    .filter(Boolean)
    .join("\n");

  for (let tentativa = 0; tentativa < MAX_TENTATIVAS_CHAMADA; tentativa++) {
    const resposta = await chamarIA("whatsapp", {
      prompt,
      temperatura: 0.2,
      json: true,
      timeoutMs: TIMEOUT_MS,
    });
    if (resposta) return resposta;
    // Pequena pausa antes de retry (evita rate limit)
    if (tentativa < MAX_TENTATIVAS_CHAMADA - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return null;
}

/**
 * Processa uma mensagem usando o agente com tool calling.
 *
 * @returns Resposta ao cliente, ou `null` se o agente não conseguiu
 * processar (fallback para FSM).
 */
export async function agenteProcessar(
  empresaId: string,
  telefone: string,
  texto: string,
  etapa: string,
  estado: ContextoTool["estado"]
): Promise<RespostaAgente | null> {
  // Pré-condições: IA disponível e sem limite excedido.
  const { iaDisponivel } = await import("@/lib/atendente/ia");
  if (!iaDisponivel()) return null;
  if (await limiteIaExcedido(empresaId).catch(() => false)) return null;

  const persona = await carregarPersonaAtendente(empresaId);
  const loja = await nomeFantasia(empresaId);
  const systemPrompt = montarSystemPrompt(persona, loja, estado, etapa);

  const ctx: ContextoTool = { empresaId, telefone, estado };
  const toolCallsExecutados: string[] = [];
  let estadoAtual = { ...estado };
  let historicoToolResults: string[] = []; // Acumula resultados das tools

  for (let iter = 0; iter < MAX_ITERACOES; iter++) {
    // Contexto extra: resultados das tools das iterações anteriores
    const contextoExtra = historicoToolResults.length > 0
      ? "\nResultados das tools chamadas anteriormente:\n" + historicoToolResults.join("\n\n")
      : "";

    const resposta = await chamarIAComRetry(systemPrompt, texto, contextoExtra);

    if (!resposta) return null;

    // Registra uso de IA (fire and forget).
    registrarUsoIA(empresaId, "atendimento", {
      tokensEntrada: resposta.tokensEntrada || estimarTokens(texto),
      tokensSaida: resposta.tokensSaida || estimarTokens(resposta.texto),
    }).catch(() => null);

    // Parseia a resposta JSON (com extração robusta).
    const parsed = extrairJSON(resposta.texto) as { tool_calls?: ToolCallLLM[]; texto?: string } | null;

    if (!parsed) {
      // Se temos tool results acumulados, o LLM pode estar tentando
      // dar uma resposta final em texto puro sem JSON.
      // Tenta usar o texto cru como resposta.
      const textoLimpo = resposta.texto.trim();
      if (textoLimpo.length > 5 && textoLimpo.length < 500 && !textoLimpo.startsWith("{")) {
        return { texto: textoLimpo, toolCallsExecutados, estado: estadoAtual };
      }
      return null;
    }

    // Resposta com texto final → retorna ao cliente.
    if (typeof parsed.texto === "string" && parsed.texto.trim().length > 0) {
      return {
        texto: parsed.texto.trim(),
        toolCallsExecutados,
        estado: estadoAtual,
      };
    }

    // Resposta com tool_calls → executa cada uma.
    if (Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
      const resultados: string[] = [];

      for (const tc of parsed.tool_calls) {
        const nome = tc.name as NomeTool;
        if (!TOOL_DEFINITIONS[nome]) {
          resultados.push(`Tool "${tc.name}" nao existe.`);
          continue;
        }

        const resultado: ResultadoTool = await executarTool(nome, tc.params ?? {}, {
          ...ctx,
          estado: estadoAtual,
        });

        toolCallsExecutados.push(nome);
        resultados.push(`${nome}: ${resultado.mensagem}`);

        // Atualiza estado parcialmente.
        if (resultado.estadoAtualizado) {
          estadoAtual = { ...estadoAtual, ...resultado.estadoAtualizado };
        }
      }

      // Acumula resultados para que o LLM veja nas próximas iterações.
      historicoToolResults.push(...resultados);
      continue;
    }

    // Nem texto nem tool_calls → fallback.
    return null;
  }

  // Máximo de iterações atingido → fallback.
  return null;
}
