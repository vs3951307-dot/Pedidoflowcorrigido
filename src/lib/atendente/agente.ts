/**
 * Agente WhatsApp com tool calling (Fase 5).
 *
 * Substitui o fluxo FSM como camada PRIMÁRIA de processamento.
 * O LLM decide QUAL tool chamar; o código executa, valida e mantém
 * o estado. Se a IA falhar ou não estiver disponível, o FSM
 * determinístico (motor.ts) assume como fallback seguro.
 *
 * LOOP:
 *   1. Monta prompt com persona + tools + estado + histórico
 *   2. Chama LLM (JSON mode)
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
const MAX_HISTORICO = 6; // últimas N mensagens (pares pergunta/resposta)

/**
 * Monta o system prompt completo para o agente.
 * Inclui persona, tools disponíveis (como JSON), estado atual e restrições.
 */
function montarSystemPrompt(
  persona: PersonaAtendente,
  loja: string | null,
  estado: ContextoTool["estado"],
  etapa: string
): string {
  const nome = persona.nome.trim() || "atendente";
  const lojaFinal = loja || "a pizzaria";

  const toolsJson = Object.entries(TOOL_DEFINITIONS)
    .map(([nome, def]) => `  - ${nome}: ${def.descricao}\n    Parâmetros: ${def.parametros}`)
    .join("\n");

  const estadoResumo = [
    estado.itens.length > 0
      ? `Itens no carrinho: ${estado.itens.map((i) => `${i.quantidade}× ${i.nome}${i.tamanho ? ` (${i.tamanho})` : ""}`).join(", ")}`
      : "Carrinho vazio",
    estado.canal ? `Canal: ${estado.canal}` : "",
    estado.endereco ? `Endereço: ${estado.endereco.rua} — ${estado.endereco.bairro}` : "",
    estado.formaPagamento ? `Pagamento: ${estado.formaPagamento}` : "",
    estado.cliente?.nome ? `Cliente: ${estado.cliente.nome}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const toolsDisponiveis = Object.keys(TOOL_DEFINITIONS)
    .filter((nome) => {
      // Filtra tools por etapa (regra de permissões embutida)
      switch (etapa) {
        case "saudacao":
        case "identificacao":
          return ["listar_cardapio", "buscar_produto", "ver_preco", "ver_disp", "ver_status_pedido"].includes(nome);
        case "intencao":
          return true; // todas
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
      return `  - ${n}: ${def.descricao}\n    Parâmetros: ${def.parametros}`;
    })
    .join("\n");

  return [
    `Você é ${nome}, atendente de WhatsApp da ${lojaFinal}.`,
    "Atende como um garçom humano: simples, natural, atencioso e sem rodeios.",
    "",
    "FORMA DE RESPOSTA:",
    "Responda APENAS com JSON válido. Duas opções:",
    "",
    '1. Para CHAMAR UMA TOOL (executar uma ação):',
    '   {"tool_calls": [{"name": "nome_da_tool", "params": {parâmetros}}]',
    "   Exemplo: {\"tool_calls\": [{\"name\": \"buscar_produto\", \"params\": {\"termo\": \"calabresa\"}}]}",
    "",
    '2. Para RESPONDER AO CLIENTE (texto direto):',
    '   {"texto": "sua mensagem aqui"}',
    "   Exemplo: {\"texto\": \"Olá! Como posso te ajudar?\"}",
    "",
    "REGRAS CRÍTICAS DE INTERPRETAÇÃO:",
    "- NUNCA trate palavras genéricas como nome de produto.",
    '  Palavras como "pizza", "pizzas", "pedido", "quero pedir", "cardápio", "comida", "lanche" são INTENÇÕES, não produtos.',
    '  Se o cliente diz "pizza" → NÃO chame buscar_produto. Em vez disso, responda oferecendo sabores ou cardápio.',
    '  Se o cliente diz "quero pedir" → inicie o fluxo de pedido, não busque "quero pedir" no cardápio.',
    '  Se o cliente diz "pedido" → perguntar se quer ver cardápio ou já sabe o que quer.',
    '  Se o cliente diz "cardápio" → chame listar_cardapio.',
    '  Se o cliente diz "promoção" → responda sobre promoções.',
    '  Se o cliente diz algo vago no contexto ("essa", "pode ser", "quero", "sim") → interprete pelo contexto da conversa.',
    "  Só use buscar_produto quando o cliente informar um NOME ESPECÍFICO (ex: \"calabresa\", \"4 queijos\", \"frango\").",
    "  NUNCA responda \"Não encontrei\" quando o cliente usa palavra genérica ou demonstra intenção de fazer pedido.",
    "",
    "REGRAS:",
    "- Você TEM tools disponíveis. Use-as quando precisar buscar dados reais (preço, produto, disponibilidade, etc.).",
    "- NUNCA invente preços, produtos, sabores ou qualquer dado. Tudo vem das tools.",
    "- Uma mensagem pode conter VÁRIAS tool_calls (array). O sistema executa todas de uma vez.",
    "- Depois de executar tools, o resultado aparece como 'Resultado da tool: ...' na conversa.",
    "- Use o resultado das tools para formular sua resposta ao cliente.",
    "- Se o cliente quer fazer um pedido, comece chamando 'buscar_produto' ou 'listar_cardapio'.",
    "- Se o cliente pergunta preço, chame 'ver_preco'.",
    "- Se o cliente quer verificar disponibilidade, chame 'ver_disp'.",
    "",
    RESTRICOES_FLUXO,
    "",
    `Etapa atual do fluxo: ${etapa}`,
    "",
    `Estado da conversa:\n${estadoResumo}`,
    "",
    "Tools disponíveis:",
    toolsDisponiveis || "  (nenhuma tool disponível para esta etapa — responda com texto)",
  ].join("\n");
}

/* --------------------------------- Agente --------------------------------- */

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

  for (let iter = 0; iter < MAX_ITERACOES; iter++) {
    // Monta o prompt completo com histórico da conversa.
    const prompt = [
      systemPrompt,
      "",
      `Mensagem do cliente: "${texto}"`,
    ].join("\n");

    const resposta = await chamarIA("whatsapp", {
      prompt,
      temperatura: 0.2,
      json: true,
      timeoutMs: 10_000,
    });

    if (!resposta) return null;

    // Registra uso de IA (fire and forget).
    registrarUsoIA(empresaId, "atendimento", {
      tokensEntrada: resposta.tokensEntrada || estimarTokens(prompt),
      tokensSaida: resposta.tokensSaida || estimarTokens(resposta.texto),
    }).catch(() => null);

    // Parseia a resposta JSON.
    let parsed: { tool_calls?: ToolCallLLM[]; texto?: string };
    try {
      parsed = JSON.parse(resposta.texto);
    } catch {
      // Resposta não é JSON válido → fallback.
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
          resultados.push(`Tool "${tc.name}" não existe.`);
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

      // Monta contexto para a próxima iteração do LLM.
      const resultadoConcat = resultados.join("\n\n");
      // Adiciona o resultado das tools como contexto para a próxima chamada.
      (ctx as { _resultadoTool?: string })._resultadoTool = resultadoConcat;
      continue;
    }

    // Nem texto nem tool_calls → fallback.
    return null;
  }

  // Máximo de iterações atingido → fallback.
  return null;
}
