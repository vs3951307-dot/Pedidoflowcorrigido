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
  if (texto.includes("compar")) {
    const dias = texto.includes("semana") ? 7 : 30;
    return { consulta: "comparativo_periodos", parametros: { dias } };
  }
  if (texto.includes("entregador") && (texto.includes("mais") || texto.includes("desempenho") || texto.includes("melhor"))) {
    return { consulta: "desempenho_entregadores", parametros: { dias: 30 } };
  }
  if (texto.includes("entrega") && !texto.includes("entregador")) {
    const dias = texto.includes("hoje") ? 1 : texto.includes("semana") ? 7 : 30;
    return { consulta: "entregas_do_periodo", parametros: { dias } };
  }
  if (texto.includes("atrasad")) return { consulta: "pedidos_atrasados", parametros: {} };
  if (texto.includes("caixa")) return { consulta: "caixa_aberto_atual", parametros: {} };
  if (texto.includes("estoque") && (texto.includes("baixo") || texto.includes("faltando"))) {
    return { consulta: "estoque_baixo", parametros: {} };
  }
  if (texto.includes("mais vendid") || texto.includes("top produto")) {
    const dias = texto.includes("hoje") ? 1 : texto.includes("semana") ? 7 : 30;
    return { consulta: "produtos_mais_vendidos", parametros: { dias, limite: 10 } };
  }
  if (texto.includes("vend") || texto.includes("fatur")) {
    const dias = texto.includes("hoje") ? 1 : texto.includes("mês") || texto.includes("mes") ? 30 : 7;
    return { consulta: "vendas_por_periodo", parametros: { dias } };
  }
  return null;
}
