/**
 * Conteúdo editável da landing page comercial (PEDIDO: "não deixar
 * imagem principal, textos ou preços fixos no código"; "o Super Admin
 * deve conseguir editar sem alterar código").
 *
 * Os PREÇOS/PLANOS nunca vivem aqui — sempre vêm do model `Plano` real
 * (ver /api/landing-config, que junta este conteúdo com os planos
 * ativos na hora de responder). Aqui só fica identidade visual, textos
 * e as seções "estáticas" (segmentos, módulos, IA) — que também podem
 * ser editadas pelo Super Admin, mas não dependem de nenhuma tabela
 * transacional.
 */

export interface LandingSegmento {
  id: string;
  emoji: string;
  nome: string;
  descricao: string;
  recursos: string[];
}

/** Item com ícone: `icone` é uma CHAVE resolvida no cliente (ver
 *  `_components/landing/icones.ts`) — funções não atravessam a fronteira
 *  server → client, então nunca guardamos o componente aqui. */
export interface LandingItemIcone {
  icone: string;
  titulo: string;
  texto: string;
  imagemUrl?: string | null;
}

export interface LandingPasso {
  numero: string;
  titulo: string;
  texto: string;
}

export interface LandingDepoimento {
  nome: string;
  empresa: string;
  nota: number;
  iniciais: string;
  texto: string;
}

export interface LandingLink {
  rotulo: string;
  href: string;
}

export interface LandingConteudo {
  marca: {
    nome: string;
    tagline: string;
    logoUrl: string | null;
    corPrimaria: string | null;
    whatsappContato: string | null; // link wa.me ou número
  };
  hero: {
    eyebrow: string;
    titulo: string;
    subtitulo: string;
    apoio: string;
    imagemUrl: string | null;
  };
  modulosVitrine: string[]; // rótulos exibidos (não precisa bater 1:1 com MODULOS do sistema)
  segmentos: LandingSegmento[];
  segmentosNota: string;
  iaDestaque: string;
  ctaFinal: {
    titulo: string;
    descricao: string;
  };

  /* ----- Seções do layout comercial ----- */
  navegacao: LandingLink[];
  heroEstatisticas: { valor: string; rotulo: string }[];
  recursos: {
    eyebrow: string;
    titulo: string;
    descricao: string;
    itens: LandingItemIcone[];
  };
  comoFunciona: {
    eyebrow: string;
    titulo: string;
    descricao: string;
    passos: LandingPasso[];
  };
  dispositivos: {
    eyebrow: string;
    titulo: string;
    descricao: string;
    itens: string[];
    imagemUrl: string | null;
  };
  beneficios: {
    eyebrow: string;
    titulo: string;
    itens: LandingItemIcone[];
  };
  depoimentos: {
    eyebrow: string;
    titulo: string;
    /** Enquanto forem fictícios, este aviso PRECISA continuar visível. */
    aviso: string;
    itens: LandingDepoimento[];
  };
  planosSecao: {
    eyebrow: string;
    titulo: string;
    descricao: string;
  };
  rodape: {
    descricao: string;
    colunas: { titulo: string; links: LandingLink[] }[];
  };
}

/** Valores padrão — refletem o conteúdo aprovado, mas tudo é editável depois. */
export const LANDING_PADRAO: LandingConteudo = {
  marca: {
    nome: "PedidoFlow",
    tagline: "Gestão inteligente para diferentes negócios.",
    logoUrl: null,
    corPrimaria: null,
    whatsappContato: null,
  },
  hero: {
    eyebrow: "Uma plataforma. Diversos negócios.",
    titulo: "Sua empresa. Seu sistema. Do seu jeito.",
    subtitulo:
      "Gestão, automação e inteligência artificial em uma plataforma que se adapta ao seu negócio.",
    apoio:
      "Centralize vendas, atendimento, clientes, estoque, financeiro, equipe, WhatsApp e muito mais.",
    imagemUrl: null,
  },
  modulosVitrine: [
    "PDV",
    "Salão/Mesas",
    "Garçom",
    "Delivery",
    "Entregadores",
    "Estoque",
    "Financeiro/Caixa",
    "Relatórios",
    "WhatsApp com IA",
    "Copiloto de IA",
    "NFC-e/Fiscal",
    "Cozinha/KDS",
    "Impressão automática",
    "Gestão multiempresa",
  ],
  segmentos: [
    {
      id: "alimentacao",
      emoji: "🍕",
      nome: "Alimentação",
      descricao: "Para pizzarias, restaurantes, lanchonetes e delivery.",
      recursos: ["PDV", "Mesas", "Pedidos", "Cozinha", "Delivery", "Entregadores", "Estoque", "WhatsApp", "IA"],
    },
    {
      id: "outros",
      emoji: "🏢",
      nome: "Outros negócios",
      descricao: "Seu negócio é diferente? O PedidoFlow pode ser configurado de acordo com sua operação.",
      recursos: ["PDV", "Clientes", "Estoque", "Financeiro", "Relatórios"],
    },
  ],
  segmentosNota:
    "Os segmentos acima são exemplos. A plataforma pode ser configurada para outros tipos de empresa.",
  iaDestaque: "Menos tarefas repetitivas. Mais tempo para cuidar do seu negócio.",
  ctaFinal: {
    titulo: "Pronto para ter um sistema que realmente combina com sua empresa?",
    descricao: "Monte seu PedidoFlow e escolha as ferramentas que fazem sentido para o seu negócio.",
  },

  navegacao: [
    { rotulo: "Recursos", href: "#recursos" },
    { rotulo: "Como funciona", href: "#como-funciona" },
    { rotulo: "Benefícios", href: "#beneficios" },
    { rotulo: "Depoimentos", href: "#depoimentos" },
    { rotulo: "Planos", href: "#planos" },
  ],

  heroEstatisticas: [
    { valor: "4 canais", rotulo: "em uma só tela" },
    { valor: "Tempo real", rotulo: "do pedido à entrega" },
    { valor: "24/7", rotulo: "operação em nuvem" },
  ],

  recursos: {
    eyebrow: "Recursos",
    titulo: "Tudo que a sua operação precisa",
    descricao:
      "Módulos que funcionam juntos, sem integrações frágeis e sem retrabalho. Ative apenas o que o seu negócio usa.",
    itens: [
      { icone: "vendas", titulo: "Vendas e PDV", texto: "Frente de caixa rápida, com atalhos, múltiplas formas de pagamento e fechamento em segundos." },
      { icone: "pedidos", titulo: "Gestão de pedidos", texto: "Todos os pedidos em um painel único, com status em tempo real e envio direto para a produção." },
      { icone: "salao", titulo: "Salão e mesas", texto: "Mapa de mesas visual, comandas, divisão de conta e controle de ocupação.", imagemUrl: "/landing/tables-3d.jpg" },
      { icone: "retirada", titulo: "Retirada", texto: "Fila de balcão organizada, com previsão de pronto e aviso ao cliente." },
      { icone: "delivery", titulo: "Delivery", texto: "Áreas de entrega, taxas, roteirização simples e acompanhamento do entregador.", imagemUrl: "/landing/delivery-3d.jpg" },
      { icone: "atendimento", titulo: "Atendimento", texto: "Histórico do cliente, cadastro rápido e pedidos por telefone ou balcão sem perder tempo." },
      { icone: "admin", titulo: "Gestão administrativa", texto: "Cardápio, estoque, equipe, permissões e configurações centralizadas." },
      { icone: "relatorios", titulo: "Relatórios", texto: "Faturamento, ticket médio, produtos campeões e desempenho por canal e por turno." },
      { icone: "ia", titulo: "Copiloto com IA", texto: "Sugestões inteligentes, resumos do dia e respostas sobre a sua operação em linguagem natural.", imagemUrl: "/landing/ai-3d.jpg" },
      { icone: "automacoes", titulo: "Automações", texto: "Regras que disparam sozinhas: avisos, impressões, mudanças de status e mensagens." },
      { icone: "dispositivos", titulo: "Computador e celular", texto: "Mesma operação no desktop, tablet e celular — sem instalar nada complicado." },
      { icone: "multiunidades", titulo: "Multiunidades", texto: "Um painel para várias lojas, com visão consolidada e controle por unidade." },
    ] as LandingItemIcone[],
  },

  comoFunciona: {
    eyebrow: "Como funciona",
    titulo: "Simples assim, em quatro passos",
    descricao: "Do cadastro à primeira venda no mesmo dia.",
    passos: [
      { numero: "01", titulo: "Configure seu negócio", texto: "Cadastre a unidade, o cardápio e a equipe com um assistente guiado." },
      { numero: "02", titulo: "Receba pedidos", texto: "Salão, balcão, retirada e delivery chegam juntos no mesmo painel." },
      { numero: "03", titulo: "Produza e entregue", texto: "A produção acompanha o status em tempo real e nada se perde no caminho." },
      { numero: "04", titulo: "Acompanhe e cresça", texto: "Relatórios e o Copiloto mostram o que vender mais e onde economizar." },
    ],
  },

  dispositivos: {
    eyebrow: "Em qualquer tela",
    titulo: "No caixa, na cozinha, na mão do garçom",
    descricao:
      "O PedidoFlow roda em notebook, desktop, tablet e celular com a mesma agilidade. A operação continua mesmo quando você não está na loja.",
    itens: [
      "Interface pensada para o ritmo do salão",
      "Funciona em nuvem, atualiza sozinho",
      "Mesmo login em todos os dispositivos",
    ],
    imagemUrl: "/landing/devices-3d.jpg",
  },

  beneficios: {
    eyebrow: "Benefícios",
    titulo: "Menos correria, mais controle",
    itens: [
      { icone: "tempo", titulo: "Atendimento mais rápido", texto: "Menos etapas por pedido e menos erros de anotação." },
      { icone: "dinheiro", titulo: "Mais faturamento", texto: "Ticket médio maior com sugestões e combos no momento certo." },
      { icone: "organizacao", titulo: "Operação organizada", texto: "Todos os canais no mesmo fluxo, sem planilha paralela." },
      { icone: "visao", titulo: "Visão total do negócio", texto: "Números do dia, do mês e por unidade sempre à mão." },
    ] as LandingItemIcone[],
  },

  depoimentos: {
    eyebrow: "Depoimentos",
    titulo: "Quem usa, recomenda",
    aviso: "Depoimentos fictícios, exibidos apenas como demonstração visual.",
    itens: [
      { nome: "Ana Ribeiro", empresa: "Cantina Bella Vita", nota: 5, iniciais: "AR", texto: "Unificamos salão e delivery no mesmo painel. A equipe aprendeu a usar em um dia e o fechamento de caixa virou rotina de cinco minutos." },
      { nome: "Marcos Tavares", empresa: "Burger House", nota: 5, iniciais: "MT", texto: "Os relatórios mudaram nossa forma de comprar insumos. Sabemos exatamente o que sai em cada turno." },
      { nome: "Juliana Costa", empresa: "Café Aurora", nota: 4, iniciais: "JC", texto: "A fila de retirada deixou de ser bagunça. O cliente é avisado e o balcão não trava mais." },
    ],
  },

  planosSecao: {
    eyebrow: "Planos",
    titulo: "Escolha o tamanho da sua operação",
    descricao: "Os planos e valores abaixo são os cadastrados no painel do Super Admin.",
  },

  rodape: {
    descricao:
      "Plataforma de vendas, pedidos e gestão para restaurantes, pizzarias, cafeterias, lanchonetes e outros estabelecimentos.",
    colunas: [
      { titulo: "Produto", links: [{ rotulo: "Recursos", href: "#recursos" }, { rotulo: "Como funciona", href: "#como-funciona" }, { rotulo: "Planos", href: "#planos" }] },
      { titulo: "Empresa", links: [{ rotulo: "Contato", href: "#contato" }, { rotulo: "Suporte", href: "#contato" }] },
      { titulo: "Acesso", links: [{ rotulo: "Entrar", href: "/login" }, { rotulo: "Recuperar senha", href: "/login/recuperar" }] },
    ],
  },
};

/**
 * Mescla uma seção salva com o padrão. Uma lista vazia (ou ausente) volta ao
 * padrão de propósito: uma seção sem itens renderizaria um bloco em branco no
 * meio da página — pior do que mostrar o conteúdo de fábrica.
 */
function mesclarSecao<T extends Record<string, unknown>, K extends keyof T>(
  padrao: T,
  bruto: unknown,
  chaveLista: K,
): T {
  if (!bruto || typeof bruto !== "object") return padrao;
  const entrada = bruto as Partial<T>;
  const lista = entrada[chaveLista];
  return {
    ...padrao,
    ...entrada,
    [chaveLista]: Array.isArray(lista) && lista.length ? lista : padrao[chaveLista],
  };
}

export function parseLandingConteudo(json: string): LandingConteudo {
  try {
    const bruto = JSON.parse(json);
    if (!bruto || typeof bruto !== "object") return LANDING_PADRAO;
    // mescla raso com o padrão — campo ausente/corrompido cai no padrão,
    // nunca quebra a landing.
    return {
      marca: { ...LANDING_PADRAO.marca, ...(bruto.marca ?? {}) },
      hero: { ...LANDING_PADRAO.hero, ...(bruto.hero ?? {}) },
      modulosVitrine: Array.isArray(bruto.modulosVitrine) ? bruto.modulosVitrine : LANDING_PADRAO.modulosVitrine,
      segmentos: Array.isArray(bruto.segmentos) ? bruto.segmentos : LANDING_PADRAO.segmentos,
      segmentosNota: typeof bruto.segmentosNota === "string" ? bruto.segmentosNota : LANDING_PADRAO.segmentosNota,
      iaDestaque: typeof bruto.iaDestaque === "string" ? bruto.iaDestaque : LANDING_PADRAO.iaDestaque,
      ctaFinal: { ...LANDING_PADRAO.ctaFinal, ...(bruto.ctaFinal ?? {}) },

      // Seções do layout comercial. Um JSON gravado ANTES desta versão não
      // tem nenhuma delas — cai inteiro no padrão, sem quebrar a página.
      navegacao: Array.isArray(bruto.navegacao) && bruto.navegacao.length ? bruto.navegacao : LANDING_PADRAO.navegacao,
      heroEstatisticas: Array.isArray(bruto.heroEstatisticas) ? bruto.heroEstatisticas : LANDING_PADRAO.heroEstatisticas,
      recursos: mesclarSecao(LANDING_PADRAO.recursos, bruto.recursos, "itens"),
      comoFunciona: mesclarSecao(LANDING_PADRAO.comoFunciona, bruto.comoFunciona, "passos"),
      dispositivos: mesclarSecao(LANDING_PADRAO.dispositivos, bruto.dispositivos, "itens"),
      beneficios: mesclarSecao(LANDING_PADRAO.beneficios, bruto.beneficios, "itens"),
      depoimentos: mesclarSecao(LANDING_PADRAO.depoimentos, bruto.depoimentos, "itens"),
      planosSecao: { ...LANDING_PADRAO.planosSecao, ...(bruto.planosSecao ?? {}) },
      rodape: mesclarSecao(LANDING_PADRAO.rodape, bruto.rodape, "colunas"),
    };
  } catch {
    return LANDING_PADRAO;
  }
}

export function serializarLandingConteudo(conteudo: LandingConteudo): string {
  return JSON.stringify(conteudo);
}
