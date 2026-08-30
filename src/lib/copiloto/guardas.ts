/**
 * Guarda de comandos proibidos do Copiloto da Empresa (anti prompt
 * injection / escape de tenant).
 *
 * O Copiloto SÓ opera dentro da empresa da sessão e com um catálogo
 * fechado de consultas/ações. Mesmo assim, uma pergunta que tente
 * "sair" do escopo (ver outras empresas, virar Super Admin, ignorar
 * regras, manipular sessão) é bloqueada ANTES de chegar na IA — com uma
 * resposta clara, sem nem gastar uma chamada de IA.
 *
 * A checagem é determinística e independente da IA: mesmo que o LLM
 * respondesse algo, a lista de consultas/ações é fechada e `empresaId`
 * sempre vem da sessão (`autorizar()`), então nada fora do tenant seria
 * executável. Esta guarda é uma camada de defesa em profundidade.
 */

const BLOQUEIOS: { padrao: RegExp; motivo: string }[] = [
  {
    padrao: /(ignore|esque[cç]a|descarte|desconsidere|n[aã]o siga|deixe de lado)\s+(todas\s+)?(as\s+)?(regras?|instru[çc][õo]es?|prompt|configura[çc][õo]es?|sistema)/i,
    motivo: "Não posso ignorar as regras da plataforma.",
  },
  {
    padrao: /(mostre|liste|veja|acesse|abra|abra-me|me\s+mostre|exiba)\s+(todas\s+)?(as\s+)?(empresas|tenants|contas|clientes da plataforma|todas as contas)/i,
    motivo: "Você só tem acesso aos dados da sua empresa.",
  },
  {
    padrao: /(vire|me\s+transforme|transforme-me|vira|promova|me\s+torne|aumente\s+meu\s+acesso|d[eê]\s+acesso)\s+(em|para|a)?\s*(super\s*admin|administrador\s*(da\s*plataforma|do\s*sistema)?|dono\s*da\s*plataforma)/i,
    motivo: "Não é possível mudar o tipo de acesso por aqui.",
  },
  {
    padrao: /(roube|copie|pegue|busque|traga)\s+(dados|informa[çc][õo]es|senhas?|credenciais|clientes)\s+(de|da|dos|das)\s+(outra|outras)\s+empresas?/i,
    motivo: "Você só tem acesso aos dados da sua empresa.",
  },
  {
    padrao: /(mude|altere|redefina|zere|resete)\s+(minha\s+)?(senha|permiss[õo]es|papel|plano|limite)/i,
    motivo: "Essas alterações devem ser feitas pelo Super Admin da plataforma.",
  },
  {
    padrao: /(acesso\s+ao\s+(banco|banco\s+de\s+dados|database|postgres|supabase|neon)|execut(e|ar|a)\s+(um\s+)?sql|query\s+sql|conecte\s+no\s+banco)/i,
    motivo: "Não executo comandos diretos no banco de dados.",
  },
];

/** Retorna `null` se a pergunta é permitida, ou um motivo de bloqueio. */
export function bloquearPerguntaProibida(pergunta: string): string | null {
  const texto = pergunta.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const { padrao, motivo } of BLOQUEIOS) {
    if (padrao.test(texto)) return motivo;
  }
  return null;
}

/** Descrições usadas para mostrar ao usuário o que o Copiloto pode fazer. */
export function escopoExplicado(): string {
  return "Sou o Copiloto da sua empresa: respondo perguntas sobre vendas, pedidos, estoque, caixa, entregas e relatórios, e posso (com sua confirmação) ajustar estoque e disponibilidade de produtos. Tudo sempre dentro da sua empresa.";
}
