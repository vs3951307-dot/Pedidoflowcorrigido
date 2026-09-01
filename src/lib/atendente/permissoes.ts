/**
 * Permissões de transição por etapa FSM (PEDIDO 21 — trava de conversa).
 *
 * Define quais ações o cliente pode tomar em cada etapa do fluxo.
 * Usado pelo motor para validar transições e evitar que o LLM pule etapas
 * críticas (ex.: confirmar pedido sem ter coletado endereço).
 *
 * REGRAS:
 * - "cancelar" e "humano" são permitidos em TODAS as etapas (exceto as
 *   já finais).
 * - A etapa "intencao" é o hub central — qualquer coisa volta pra lá.
 * - O mapa é consultado ANTES de processar a mensagem do cliente.
 */

/** Ações que o cliente pode tentar tomar. */
export type AcaoCliente =
  | "saudar"
  | "informar_nome"
  | "pedir_produto"
  | "ver_cardapio"
  | "ver_preco"
  | "ver_disponibilidade"
  | "ver_promocao"
  | "ver_horario"
  | "ver_regras"
  | "ver_entrega"
  | "ver_total"
  | "responder_sim"
  | "responder_nao"
  | "escolher_produto"
  | "escolher_tamanho"
  | "escolher_sabor"
  | "escolher_adicional"
  | "definir_quantidade"
  | "escolher_canal"
  | "informar_endereco"
  | "escolher_pagamento"
  | "confirmar_pedido"
  | "tirar_item"
  | "trocar_item"
  | "repetir_pedido"
  | "ver_status_pedido"
  | "cancelar"
  | "pedir_humano"
  | "outro";

/** Mapa de permissões: cada etapa lista as ações PERMITIDAS. */
const PERMISSOES: Record<string, readonly AcaoCliente[]> = {
  saudacao: [
    "saudar",
    "informar_nome",
    "pedir_produto",
    "ver_cardapio",
    "ver_preco",
    "ver_disponibilidade",
    "ver_promocao",
    "ver_horario",
    "ver_regras",
    "ver_entrega",
    "cancelar",
    "pedir_humano",
  ],

  identificacao: [
    "saudar",
    "informar_nome",
    "pedir_produto",
    "ver_cardapio",
    "ver_preco",
    "ver_disponibilidade",
    "ver_promocao",
    "ver_horario",
    "ver_regras",
    "ver_entrega",
    "cancelar",
    "pedir_humano",
  ],

  intencao: [
    "saudar",
    "pedir_produto",
    "ver_cardapio",
    "ver_preco",
    "ver_disponibilidade",
    "ver_promocao",
    "ver_horario",
    "ver_regras",
    "ver_entrega",
    "ver_total",
    "ver_status_pedido",
    "repetir_pedido",
    "tirar_item",
    "trocar_item",
    "cancelar",
    "pedir_humano",
  ],

  produto: [
    "escolher_produto",
    "ver_cardapio",
    "ver_preco",
    "ver_disponibilidade",
    "cancelar",
    "pedir_humano",
  ],

  tamanho: [
    "escolher_tamanho",
    "cancelar",
    "pedir_humano",
  ],

  sabores: [
    "escolher_sabor",
    "cancelar",
    "pedir_humano",
  ],

  adicionais: [
    "escolher_adicional",
    "responder_nao",
    "cancelar",
    "pedir_humano",
  ],

  quantidade: [
    "definir_quantidade",
    "cancelar",
    "pedir_humano",
  ],

  mais_itens: [
    "responder_sim",
    "responder_nao",
    "pedir_produto",
    "ver_total",
    "tirar_item",
    "trocar_item",
    "ver_cardapio",
    "cancelar",
    "pedir_humano",
  ],

  entrega_retirada: [
    "escolher_canal",
    "cancelar",
    "pedir_humano",
  ],

  endereco: [
    "informar_endereco",
    "cancelar",
    "pedir_humano",
  ],

  troca_selecao: [
    "escolher_produto",
    "cancelar",
    "pedir_humano",
  ],

  pagamento: [
    "escolher_pagamento",
    "responder_sim",
    "responder_nao",
    "tirar_item",
    "trocar_item",
    "ver_total",
    "cancelar",
    "pedir_humano",
  ],

  nome: [
    "informar_nome",
    "cancelar",
    "pedir_humano",
  ],

  resumo: [
    "confirmar_pedido",
    "responder_sim",
    "responder_nao",
    "tirar_item",
    "trocar_item",
    "ver_total",
    "pedir_produto",
    "cancelar",
    "pedir_humano",
  ],

  // Estados finais — nenhum input do cliente é processado pelo FSM.
  confirmacao: [],
  criado: [],
  humana: [],
  encerrada: [],
};

/**
 * Verifica se uma ação é permitida na etapa atual.
 *
 * @returns `true` se a ação é permitida; `false` se deve ser bloqueada.
 */
export function acaoPermitida(etapa: string, acao: AcaoCliente): boolean {
  const permitidas = PERMISSOES[etapa];
  if (!permitidas) return false; // etapa desconhecida → bloqueia tudo
  return permitidas.includes(acao);
}

/**
 * Retorna a lista de ações permitidas para uma etapa.
 * Útil para debugging e para construir o prompt do LLM.
 */
export function acoesPermitidas(etapa: string): readonly AcaoCliente[] {
  return PERMISSOES[etapa] ?? [];
}

/**
 * Retorna a etapa de fallback quando uma ação é bloqueada.
 * O cliente é redirecionado para a etapa correta em vez de só ignorar.
 */
export function etapaFallback(etapa: string, acao: AcaoCliente): string | null {
  // Se o cliente tenta algo bloqueado, o motor deve interpretar como
  // pedido genérico e voltar para intenção.
  if (acao === "outro") return "intencao";
  return null;
}

/**
 * Classifica a ação que o cliente está tentando com base no texto.
 * Usado pelo motor ANTES de processar para decidir se a transição é válida.
 *
 * Esta é uma classificação ROFASTA — erros aqui são tolerados porque o
 * motor FSM faz a validação final. O objetivo é bloquear tentativas
 * óbvias de pular etapas (ex.: mandar "sim" numa etapa que não espera
 * confirmação).
 */
export function classificarAcao(texto: string, etapaAtual: string): AcaoCliente {
  const t = texto.trim().toLowerCase();

  // Cancelamento e humano — sempre detectados primeiro.
  if (/^(cancelar|não quero|esquece|nada por hoje|sair)/i.test(t)) return "cancelar";
  if (/(humano|atendente|pessoa|falar com algu)/i.test(t)) return "pedir_humano";

  // Respostas de confirmação/negação
  if (/^(sim|ok|pode|confirmar|confirmo|fechar|tudo certo|isso|certo|claro)[!.,;]*$/i.test(t)) return "responder_sim";
  if (/^(não|nao|nop|nope|nada mais|chega|tá bom|sem adicional|nenhum|0)$/i.test(t)) return "responder_nao";

  // Escolha numérica
  if (/^\d+$/.test(t)) {
    switch (etapaAtual) {
      case "produto": return "escolher_produto";
      case "tamanho": return "escolher_tamanho";
      case "sabores": return "escolher_sabor";
      case "adicionais": return "escolher_adicional";
      case "troca_selecao": return "escolher_produto";
      default: return "outro";
    }
  }

  // Escolhas por nome (dependem da etapa)
  if (etapaAtual === "entrega_retirada" && /(entrega|retirada|pego|busco|leva)/i.test(t)) return "escolher_canal";
  if (etapaAtual === "pagamento" && /(pix|dinheiro|débito|crédito|cartão|pix|money)/i.test(t)) return "escolher_pagamento";
  if (etapaAtual === "quantidade" && /\d+/.test(t)) return "definir_quantidade";
  if (etapaAtual === "nome") return "informar_nome";
  if (etapaAtual === "endereco") return "informar_endereco";

  // Pedidos de produto
  if (/(quero pedir|quero fazer|gostaria|vou pedir|pedido|pedir|quero|me vê|manda)/i.test(t)) return "pedir_produto";

  // Consultas
  if (/(cardápio|cardapio|menu|o que tem|catálogo)/i.test(t)) return "ver_cardapio";
  if (/(quanto custa|qual.*preço|quanto.*é|preço)/i.test(t)) return "ver_preco";
  if (/\b(tem|vocês têm|existe|disponível)/i.test(t)) return "ver_disponibilidade";
  if (/(promo|oferta|destaque|combo)/i.test(t)) return "ver_promocao";
  if (/(horário|aberto|fecha|funcionamento)/i.test(t)) return "ver_horario";
  if (/(regra|política|mínimo)/i.test(t)) return "ver_regras";
  if (/(entregam|entrega|taxa|bairro)/i.test(t)) return "ver_entrega";
  if (/(quanto tá|total|quanto vai|quanto deu)/i.test(t)) return "ver_total";
  if (/(onde.*pedido|status|situação)/i.test(t)) return "ver_status_pedido";
  if (/(igual.*última|mesmo pedido|repete)/i.test(t)) return "repetir_pedido";
  if (/\b(tira|remove|tirar|remover)/i.test(t)) return "tirar_item";
  if (/\b(troca|trocar|muda|mudar|substitui)/i.test(t)) return "trocar_item";

  // Saudação
  if (/^(oi+|olá|ola|bom dia|boa tarde|boa noite|eai|tudo bem|opa)/i.test(t)) return "saudar";

  return "outro";
}
