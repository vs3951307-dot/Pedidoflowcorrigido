import { CONSULTAS } from "./consultas";
import { registrarUsoIA, limiteIaExcedido } from "@/lib/uso-ia";
import { chamarIA } from "@/lib/ai-provider";

export interface EscolhaConsulta {
  consulta: string;
  parametros: Record<string, unknown>;
}

/**
 * Interpreta a pergunta em linguagem natural e escolhe uma consulta do
 * catalogo fechado (`CONSULTAS`). Tenta IA primeiro (se configurada -
 * ver src/lib/ai-provider.ts - e a empresa ainda nao bateu o limite
 * mensal de IA); sem IA, usa correspondencia por palavras-chave - mais
 * limitada, mas 100% previsivel e sem custo de API.
 */
export async function escolherConsulta(empresaId: string, pergunta: string): Promise<EscolhaConsulta | null> {
  if (!(await limiteIaExcedido(empresaId).catch(() => false))) {
    const viaIa = await escolherViaIa(empresaId, pergunta);
    if (viaIa) return viaIa;
  }
  return escolherViaPalavraChave(pergunta);
}

async function escolherViaIa(empresaId: string, pergunta: string): Promise<EscolhaConsulta | null> {
  const catalogo = Object.entries(CONSULTAS)
    .map(([chave, c]) => `- ${chave}: ${c.descricao} (parametros: ${JSON.stringify(c.parametros)})`)
    .join("\n");
  const prompt = `Voce escolhe UMA consulta de um catalogo fixo para responder a pergunta de um dono de restaurante.
Catalogo disponivel:
${catalogo}
Pergunta: "${pergunta}"
Responda APENAS um JSON no formato: {"consulta": "<chave_exata_do_catalogo>", "parametros": {...}}
Se nenhuma consulta do catalogo responder a pergunta, responda {"consulta": null}.
NUNCA invente uma chave que nao esteja no catalogo acima.`;
  try {
    const resposta = await chamarIA("copiloto_empresa", { prompt, temperatura: 0, json: true, timeoutMs: 10000 });
    if (!resposta) return null;
    const limpo = resposta.texto.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(limpo);
    registrarUsoIA(empresaId, "copiloto", {
      tokensEntrada: resposta.tokensEntrada,
      tokensSaida: resposta.tokensSaida,
    }).catch(() => null);
    if (!parsed.consulta || !CONSULTAS[parsed.consulta]) return null;
    return { consulta: parsed.consulta, parametros: parsed.parametros ?? {} };
  } catch {
    return null;
  }
}


function escolherViaPalavraChave(pergunta: string): EscolhaConsulta | null {
  const texto = pergunta.toLowerCase();
  const hoje = texto.includes("hoje") || /\bdia\b/.test(texto) || texto.includes("ontem");
  const semana = texto.includes("semana");
  const mes = /\bmês\b/.test(texto) || /\bmes\b/.test(texto) || texto.includes("mês passado") || texto.includes("mes passado");

  // Comparativo entre períodos ("vs", "comparação", "evolução", "variou")
  if (texto.includes("compar") || texto.includes("comparado") || texto.includes(" vs ") || texto.includes("versus") || /evoluç|variou|diferente do/.test(texto)) {
    return { consulta: "comparativo_periodos", parametros: { dias: semana ? 7 : mes ? 30 : 30 } };
  }
  // Desempenho por entregador
  if (texto.includes("entregador") && /mais|desempenho|melhor|ranking|rapid|quem entregou/.test(texto)) {
    return { consulta: "desempenho_entregadores", parametros: { dias: 30 } };
  }
  // Entregas do período (não confundir com "entregador")
  if ((texto.includes("entrega") || texto.includes("delivery") || texto.includes("motoboy")) && !texto.includes("entregador")) {
    return { consulta: "entregas_do_periodo", parametros: { dias: hoje ? 1 : semana ? 7 : 30 } };
  }
  // Pedidos atrasados / esperando / pendentes na cozinha
  if (texto.includes("atrasad") || texto.includes("esperando") || texto.includes("demoran") || texto.includes("parado") || texto.includes("não saiu") || texto.includes("pendente") || texto.includes("na cozinha")) {
    return { consulta: "pedidos_atrasados", parametros: {} };
  }
  // Situação do caixa aberto
  if (texto.includes("caixa") || texto.includes("vale quanto") || texto.includes("turno aberto")) {
    return { consulta: "caixa_aberto_atual", parametros: {} };
  }
  // Estoque baixo / faltando / acabou / esgotou
  if ((texto.includes("estoque") || texto.includes("produto em falta") || texto.includes("faltand") || texto.includes("esgot") || texto.includes("acabou")) && /baixo|faltand|minimo|abaixo|zerou|esgot|acabou|falta/i.test(texto)) {
    return { consulta: "estoque_baixo", parametros: {} };
  }
  // Produtos mais vendidos (antes de vendas por período para não conflitar)
  if (texto.includes("mais vendid") || texto.includes("mais pedid") || texto.includes("top produto") || texto.includes("campe") || texto.includes("mais popular") || texto.includes("produto que mais vende")) {
    return { consulta: "produtos_mais_vendidos", parametros: { dias: hoje ? 1 : semana ? 7 : 30, limite: 10 } };
  }
  // Vendas / faturamento do período
  if (texto.includes("vend") || texto.includes("fatur") || texto.includes("receita") || texto.includes("quanto vendeu") || texto.includes("movimento") || texto.includes("lucro")) {
    return { consulta: "vendas_por_periodo", parametros: { dias: hoje ? 1 : mes ? 30 : semana ? 7 : 7 } };
  }
  return null;
}
