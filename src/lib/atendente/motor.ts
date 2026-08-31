/**
 * Motor de atendimento WhatsApp (PEDIDO 18).
 *
 * Conduz a conversa por um fluxo guiado (identificação → intenção →
 * produto → tamanho → sabores → adicionais → quantidade → entrega/
 * retirada → endereço → taxa → pagamento → troco → resumo → confirmação
 * → pedido real), consultando SEMPRE o banco (`catalogo.ts`) — nenhum
 * valor é inventado.
 *
 * Regras de segurança:
 * - O pedido só é criado após confirmação explícita do cliente.
 * - Tudo (preço, sabor, tamanho, adicional, taxa, forma de pagamento) é
 *   validado contra o cadastro; resposta inválida re-pergunta a MESMA
 *   etapa (sem repetição em loop — após 2 tentativas sugere humano).
 * - O contexto fica persistido em `ConversaWhatsApp.estado` (JSON), então
 *   uma nova mensagem do cliente retoma exatamente onde parou.
 * - Qualquer fala de transferência para humano ativa o modo humano.
 */

import { prisma } from "@/lib/prisma";
import { emitirMudancaKds } from "@/lib/kds-eventos";
import {
  enfileirarAutomatica,
  gerarConteudoPedido,
  referenciaPedido,
  tipoParaCanalPedido,
  lerImpressoras,
  destinoRealDoTipo,
} from "@/lib/impressao";
import { calcularTaxaEntrega, lerConfigTaxaEntrega, previsaoEntregaPadrao } from "@/lib/delivery";
import { calcularPrecoItem } from "@/lib/precificacao";
import { criarPedido } from "@/lib/pedidos/criar-pedido";
import { novaChaveIdempotencia } from "@/lib/idempotencia";
import {
  buscarProdutos,
  clientePorTelefone,
  horarioFuncionamento,
  listarAdicionais,
  listarFormasPagamento,
  listarProdutosDisponiveis,
  nomeFantasia,
  normalizarTelefone,
} from "@/lib/atendente/catalogo";
import { iaDisponivel, interpretarMensagem, embelezarResposta } from "@/lib/atendente/ia";
import {
  PERSONA_PADRAO,
  carregarPersonaAtendente,
  montarSaudacao,
  type PersonaAtendente,
} from "@/lib/atendente/persona";

/* ----------------------------- Tipos do estado ---------------------------- */

interface TamanhoOpcao {
  nome: string;
  valor: number;
}

interface SaborOpcao {
  nome: string;
  tipo: string;
}

interface ItemEmMontagem {
  produtoId: string;
  nome: string;
  precoBase: number;
  temTamanhos: boolean;
  temSabores: boolean;
  sabores: SaborOpcao[];
  tamanhos: TamanhoOpcao[];
  tamanho?: TamanhoOpcao;
  saboresEscolhidos: string[];
  saboresFaltando?: number;
  adicionais: { nome: string; preco: number }[];
  quantidade?: number;
}

interface ItemConfirmado {
  produtoId: string;
  nome: string;
  precoUnit: number;
  quantidade: number;
  tamanho: string | null;
  sabores: string[];
  adicionais: { nome: string; preco: number }[];
}

interface Estado {
  empresaId: string;
  cliente?: { nome: string | null; telefone: string };
  itens: ItemConfirmado[];
  atual?: ItemEmMontagem;
  ultimaBusca?: { id: string; nome: string }[];
  /** Nomes de itens ainda por processar quando o cliente pede vários de uma vez (ex.: "torre e coca"). */
  pendentes?: string[];
  canal?: "entrega" | "retirada";
  endereco?: { rua: string; bairro: string };
  taxa?: number;
  formaPagamento?: string;
  trocoPara?: number;
  /**
   * Chave de idempotencia do pedido em montagem. Gerada quando o
   * PRIMEIRO item entra no carrinho e persistida junto do estado da
   * conversa, entao a mesma chave sobrevive a restart/redeploy e a
   * multiplas instancias: um reenvio do "sim" pela Meta cai no indice
   * unico (empresaId, idempotencyKey) e devolve o MESMO pedido em vez
   * de criar um segundo. Limpa apos o pedido ser criado.
   */
  chaveIdempotencia?: string;
  tentativas: number;
}

export interface RespostaAtendente {
  texto: string;
  etapa: string;
  status: string;
}

/* ----------------------------- Constantes de sessão ------------------------ */

/**
 * Tempo máximo de inatividade de uma conversa antes de o estado ser
 * descartado. Sem isto, um cliente que abandonou o pedido no meio poderia
 * voltar horas/dias depois mandando "sim" e CONFIRMAR um carrinho velho
 * (itens, endereço e forma de pagamento de uma conversa antiga) como se
 * fosse um pedido novo. Passado o limite, o estado (carrinho/endereço/
 * pagamento) é zerado e a conversa recomeça limpa.
 */
export const TEMPO_MAXIMO_INATIVIDADE_MS = 45 * 60 * 1000; // 45 minutos

/* -------------------------------- Helpers --------------------------------- */

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function listar(opcoes: { nome: string; detalhe?: string }[]): string {
  return opcoes.map((o, i) => `${i + 1}. ${o.nome}${o.detalhe ? ` — ${o.detalhe}` : ""}`).join("\n");
}

/** Índice escolhido (1-based) se o texto for um número; senão null. */
function indiceNumerico(texto: string, tamanho: number): number | null {
  const n = Number(texto.trim().replace(/[.,\s]/g, ""));
  if (!Number.isInteger(n) || n < 1 || n > tamanho) return null;
  return n - 1;
}

function ehSim(texto: string): boolean {
  const t = texto.trim();
  if (/^(sim|ok|pode|pode pedir|confirmar|confirmo|confirmado|fechar|fecha|tudo certo|isso|certo|com certeza|manda|pode fechar|claro)\b/i.test(t)) return true;
  // "s" isolado (gíria) só conta quando sozinho ou entre espaços — nunca
  // no início de outra palavra (ex.: "só isso" não é "sim").
  return /(?:^|\s)s(?:$|\s)/.test(t);
}

function ehNao(texto: string): boolean {
  return /^(n[aã]o|nao|nop|nope|quero mudar|errei|corrigir|alterar|mudar|acho que n[aã]o|s[óo] isso|nada mais|chega|t[aá] bom)\b/i.test(texto.trim());
}

function querHumano(texto: string): boolean {
  return /(humano|atendente|pessoa|falar com algu|transferir|atendimento humano)/i.test(texto);
}

function querCancelar(texto: string): boolean {
  return /(n[aã]o quero mais|cancelar pedido|esquece|nada por hoje|deixa pra l[aá]|encerrar|sair)/i.test(texto);
}

function querPedir(texto: string): boolean {
  return /(quero pedir|gostaria de pedir|vou pedir|fazer pedido|montar um pedido|vou querer|pedido|pedir|quero comprar|queria|gostaria de|quero um|quero uma|quero|me v[êe]|manda|pode ser|vou pedir|fa[çc]o um pedido|eu quero|quero fazer)/i.test(texto);
}

function querCardapio(texto: string): boolean {
  return /(card[aá]pio|cardapio|menu|o que tem|o que voc[eê]|quais produtos|cat[aá]logo|quais sabores|quais op[cç][õo]es|me passa o|passa o|qual o pre[cç]o|qual pre[cç]o|quanto custa|quanto [eé]|pre[cç]o das?|tabela de pre[cç]os|listagem)/i.test(texto);
}

function querHorario(texto: string): boolean {
  return /(\bhor[aá]rio\b|hor[aá]rios|aberto\b|abre\b|fecha\b|funcionamento|quando voc[eê])/i.test(texto);
}

function querPromocao(texto: string): boolean {
  return /(promo|ofertas|destaques|combos)/i.test(texto);
}

/** Detecta cumprimentos/saudações genéricas (oi, boa noite, tudo bem...). */
function querSaudacao(texto: string): boolean {
  if (!/^(oi+|ol[aá]|oii+|bom dia|boa tarde|boa noite|b[o]a\b|e a[ií]|tudo bem|tudo bom|opa|eae|e a[eí])/i.test(texto.trim())) return false;
  // Não é saudação pura se o cliente já está pedindo/querendo algo junto.
  return !querPedir(texto) && !querCardapio(texto) && !querPromocao(texto) && !querHorario(texto) && !querRegras(texto) && !querEntrega(texto);
}

/** Pergunta sobre regras/políticas do negócio (pedido mínimo, taxas etc.). */
function querRegras(texto: string): boolean {
  return /(regra|pol[ií]tica|pedido m[ií]nimo|m[ií]nimo de pedido|aceitam|aceita|pagamento.*no cart|pagamento.*dinheiro|cart[aã]o|entrega.*fora|n[aã]o entregam|condi[cç][aã]o)/i.test(
    texto
  );
}

/** Pergunta sobre entrega/cobertura de bairro ou taxa de entrega. */
function querEntrega(texto: string): boolean {
  return /(entregam|voc[eê]s entregam|entrega em|entregam em|chega a[ií]|d[aá] pra entregar|d[aá] para entregar|faz entrega|fazem entrega|taxa de entrega|taxa da entrega|quanto [eé] a entrega|quanto custa a entrega|bairro|taxa)/i.test(
    texto
  );
}

/** Extrai um nome de bairro de uma pergunta de entrega, quando presente. */
function bairroDaEntrega(texto: string): string | null {
  const m =
    texto.match(/(?:em|a[ií]|p[aá]ra|no|na|pro|pra|at[eé])\s+([a-zA-ZÀ-ÿ]+(?:\s+[a-zA-ZÀ-ÿ]+){0,2})/i) ??
    texto.match(/entregam?\s+em\s+([a-zA-ZÀ-ÿ]+(?:\s+[a-zA-ZÀ-ÿ]+){0,2})/i);
  if (!m) return null;
  const candidato = m[1].trim();
  if (/delivery|entrega|taxa|cart|pix|dinheiro|pagamento/i.test(candidato)) return null;
  return candidato.length >= 3 ? candidato : null;
}

/** Texto de saudação única, com persona da atendente e nome da loja (banco). */
async function saudacaoComPersona(persona: PersonaAtendente, nomeCliente: string | null, empresaId: string): Promise<string> {
  const loja = await nomeFantasia(empresaId);
  return montarSaudacao(persona, nomeCliente, loja);
}

/* ------------------------- Consultas reais (banco) ------------------------- */

async function cardapioResumo(empresaId: string): Promise<string> {
  const produtos = await listarProdutosDisponiveis(empresaId);
  if (produtos.length === 0) return "O cardápio está vazio no momento.";
  const porCategoria = new Map<string, string[]>();
  for (const p of produtos) {
    const linha = `${p.emoji} ${p.nome} — ${brl(p.precoBase)}${p.destaque ? " ⭐" : ""}`;
    porCategoria.set(p.categoria, [...(porCategoria.get(p.categoria) ?? []), linha]);
  }
  return [...porCategoria.entries()]
    .map(([categoria, linhas]) => `*${categoria}*\n${linhas.join("\n")}`)
    .join("\n\n");
}

async function promocoesReais(empresaId: string): Promise<string> {
  const destaques = (await listarProdutosDisponiveis(empresaId)).filter((p) => p.destaque);
  if (destaques.length === 0) return "No momento não temos promoções cadastradas.";
  return (
    "Promoções em destaque hoje:\n" +
    destaques.map((p) => `${p.emoji} ${p.nome} — ${brl(p.precoBase)}`).join("\n")
  );
}

/**
 * Responde sobre entrega usando as regras REAIS de taxa (`lerConfigTaxaEntrega`).
 * Se o cliente citou um bairro, informa se entregamos lá e a taxa; senão,
 * resume a política de entrega sem inventar valores.
 */
async function responderSobreEntrega(empresaId: string, texto: string): Promise<PassoResultado> {
  const config = await lerConfigTaxaEntrega(empresaId);
  const bairro = bairroDaEntrega(texto);
  if (bairro) {
    const { taxa, gratuito } = calcularTaxaEntrega(config, bairro, 0);
    if (gratuito || taxa === 0) {
      return {
        etapa: "intencao",
        texto: `Sim, entregamos em *${bairro}*! 🛵 E a taxa é *grátis* para este bairro. 🎉`,
      };
    }
    return {
      etapa: "intencao",
      texto: `Sim, entregamos em *${bairro}*! 🛵 A taxa de entrega é de *${brl(taxa)}*.`,
    };
  }
  return {
    etapa: "intencao",
    texto: "Sim, fazemos entrega! 🛵 A taxa é calculada pelo bairro. Pode me dizer o *bairro* da entrega? (assim confirmo se atendemos e a taxa)",
  };
}

/* ------------------------------ Fluxo (FSM) ------------------------------- */

interface PassoResultado {
  etapa: string;
  texto: string;
  pedidoId?: string | null;
}

async function passoAtendimento(
  etapa: string,
  texto: string,
  estado: Estado,
  persona: PersonaAtendente = PERSONA_PADRAO
): Promise<PassoResultado> {
  switch (etapa) {
    case "saudacao":
    case "identificacao": {
      estado.tentativas = 0;
      // Cliente já conhecido pelo telefone: identificação automática.
      const conhecido = estado.cliente?.nome
        ? null
        : await clientePorTelefone(estado.empresaId, estado.cliente?.telefone ?? "");
      if (conhecido) {
        estado.cliente = { nome: conhecido.nome, telefone: estado.cliente?.telefone ?? "" };
        return {
          etapa: "intencao",
          texto: await saudacaoComPersona(persona, conhecido.nome, estado.empresaId),
        };
      }
      // Intenção clara já na primeira mensagem: pula a pergunta do nome e
      // processa direto (ex.: "quero um lanche espacial" → busca no cardápio).
      if (
        querPedir(texto) ||
        querCardapio(texto) ||
        querPromocao(texto) ||
        querHorario(texto) ||
        querEntrega(texto) ||
        querRegras(texto) ||
        /^(oi|ola|bom dia|boa tarde|boa noite|e ai|eai|hey|hello)\b/i.test(texto)
      ) {
        if (
          querPedir(texto) ||
          querCardapio(texto) ||
          querPromocao(texto) ||
          querHorario(texto) ||
          querEntrega(texto) ||
          querRegras(texto)
        ) {
          return passoAtendimento("intencao", texto, estado, persona);
        }
        return {
          etapa: "intencao",
          texto: await saudacaoComPersona(persona, null, estado.empresaId),
        };
      }
      // Sem intenção: a resposta é tratada como nome (identificação).
      const nome = texto.trim().replace(/^meu nome (é|e) /i, "").replace(/^sou (o|a) /i, "").slice(0, 40);
      if (nome.length < 2) {
        return { etapa: "saudacao", texto: "Desculpe, não entendi seu nome. Pode me dizer como você se chama?" };
      }
      estado.cliente = { nome, telefone: estado.cliente?.telefone ?? "" };
      return {
        etapa: "intencao",
        texto: `Prazer, ${nome}! 😊 O que você gostaria de pedir hoje?`,
      };
    }

    case "intencao": {
      if (querCancelar(texto) || /(n[aã]o quero nada|s[aó] o cardapio|só ver)/i.test(texto)) {
        return { etapa: "encerrada", texto: "Tudo bem! Se precisar de algo é só me chamar. 😉" };
      }
      if (querHumano(texto)) {
        return { etapa: "humana", texto: "Sem problemas! Vou transferir você para um atendente humano, um instante. 🙋" };
      }
      if (querCardapio(texto)) {
        estado.tentativas = 0;
        const cardapio = await cardapioResumo(estado.empresaId);
        return {
          etapa: "intencao",
          texto: `Esse é o nosso cardápio:\n\n${cardapio}\n\nQuer pedir algum? É só me dizer o nome. 😊`,
        };
      }
      if (querHorario(texto)) {
        estado.tentativas = 0;
        const horario =
          persona.horario?.trim() ||
          (await horarioFuncionamento(estado.empresaId)) ||
          "todos os dias, das 18h às 23h";
        return { etapa: "intencao", texto: `Nosso horário de funcionamento: ${horario}. Quer fazer um pedido?` };
      }
      if (querRegras(texto) && persona.regras?.trim()) {
        estado.tentativas = 0;
        return {
          etapa: "intencao",
          texto: `Nossas regras:\n\n${persona.regras.trim()}\n\nQuer fazer um pedido?`,
        };
      }
      // Pergunta sobre entrega/cobertura de bairro/taxa → responde com as
      // regras REAIS do cadastro (nunca inventa bairro nem valor).
      if (querEntrega(texto)) {
        estado.tentativas = 0;
        return responderSobreEntrega(estado.empresaId, texto);
      }
      // Cumprimento/saudação genérica: resposta amigável SEM contar como
      // tentativa, SEM transferir para humano e SEM repetir a saudação de
      // boas-vindas (que já foi enviada no início da conversa). Apenas
      // re-convida ao pedido/cardápio (ex.: "oi", "boa noite", "tudo bem?").
      if (querSaudacao(texto)) {
        estado.tentativas = 0;
        return {
          etapa: "intencao",
          texto: "O que você gostaria de pedir hoje? 😊 (pode ser *pizza*, *lanche* ou *bebida* — ou ver o *cardápio*)",
        };
      }
      if (querPromocao(texto)) {
        estado.tentativas = 0;
        return { etapa: "intencao", texto: `${await promocoesReais(estado.empresaId)}\n\nQuer pedir algum?` };
      }
      if (querPedir(texto)) {
        // Intenção com produto já citado (ex.: "quero uma calabresa"): busca direto.
        const semIntencao = texto
          .replace(
            /(quero pedir|quero fazer um pedido|gostaria de pedir|vou pedir|montar um pedido|fazer pedido|vou querer|quero comprar|queria|gostaria de|quero|comprar|pedir|pedido)/gi,
            " "
          )
          .replace(/^\s*(um|uma|o|a|de|da|do|s[óo]|por favor|porfavor)\s+/i, "")
          .trim();
        if (semIntencao.length >= 2) {
          // Vários itens numa tacada (ex.: "torre e coca", "pizza e refri")?
          // Processa o primeiro agora e guarda os demais para a sequência.
          const mult = separarMultiplosItens(semIntencao);
          if (mult.processo && mult.pendentes.length > 0) {
            estado.pendentes = mult.pendentes;
            return resolverPedidoDe(texto, mult.primeiro!, estado);
          }
          const achados = await buscarProdutos(estado.empresaId, semIntencao, 5);
          if (achados.length === 1) {
            estado.tentativas = 0;
            return selecionarProduto(achados[0], estado);
          }
          if (achados.length > 1) {
            estado.ultimaBusca = achados.map((p) => ({ id: p.id, nome: p.nome }));
            estado.tentativas = 0;
            return {
              etapa: "produto",
              texto: `Encontrei mais de um item. Qual deles você quer?\n${listar(
                achados.map((p) => ({ nome: p.nome, detalhe: brl(p.precoBase) }))
              )}\n*(responda com o número)*`,
            };
          }
          // Produto citado não existe: conta como tentativa (anti-repeat),
          // exceto quando sobra só uma categoria genérica (ex.: "pizza").
          if (/^(pizza|pizzas|bebida|bebidas|sobremesa|sobremesas|lanche|lanches|combo|combos|drinks|bebidas)$/i.test(semIntencao)) {
            return {
              etapa: "produto",
              texto: "Claro! O que você vai querer? (diga o nome do produto ou a categoria, ex.: *pizza*, *bebida*, *sobremesa*)",
            };
          }
          estado.tentativas += 1;
          if (estado.tentativas >= 2) {
            return {
              etapa: "humana",
              texto: "Não encontrei esse produto no cardápio. Vou pedir pra um atendente humano te ajudar. 🙋",
            };
          }
          return {
            etapa: "produto",
            texto: "Não encontrei esse item no cardápio. 🤔 Pode conferir o nome? (ex.: *calabresa*, *mussarela*, *refrigerante 2L*)",
          };
        }
        estado.tentativas = 0;
        return {
          etapa: "produto",
          texto: "Claro! O que você vai querer? (diga o nome do produto ou a categoria, ex.: *pizza*, *bebida*, *sobremesa*)",
        };
      }
      // Texto direto de produtos, sem verbo de pedido (ex.: "torre e coca",
      // "pizza grande", "calabresa"). Tenta interpretar como pedido antes de
      // renderizar como "não entendi".
      {
        const mult = separarMultiplosItens(texto);
        if (mult.processo && mult.pendentes.length > 0) {
          estado.pendentes = mult.pendentes;
          return resolverPedidoDe(texto, mult.primeiro!, estado);
        }
        const termo = limparBusca(texto);
        const achadosDiretos = await buscarProdutos(estado.empresaId, termo, 5);
        if (achadosDiretos.length === 1) {
          estado.tentativas = 0;
          return selecionarProduto(achadosDiretos[0], estado);
        }
      }
      estado.tentativas += 1;
      if (estado.tentativas >= 2) {
        return { etapa: "humana", texto: "Não consegui entender o que você deseja. Vou chamar um atendente humano pra te ajudar. 🙋" };
      }
      return {
        etapa: "intencao",
        texto: "Não entendi. 😅 Você pode me dizer se quer *pedir*, ver o *cardápio*, as *promoções* ou o *horário*?",
      };
    }

    case "produto": {
      // Seleção numérica da busca anterior (evita repetir a lista).
      if (/^\d+$/.test(texto.trim()) && estado.ultimaBusca?.length) {
        const idx = indiceNumerico(texto, estado.ultimaBusca.length);
        if (idx !== null) {
          return selecionarProduto(estado.ultimaBusca[idx], estado);
        }
      }
      // Vários itens numa tacada (ex.: "torre e coca")?
      const mult = separarMultiplosItens(texto);
      if (mult.processo && mult.pendentes.length > 0) {
        const direto = await buscarProdutos(estado.empresaId, texto, 5);
        if (direto.length === 1) {
          // Caso raro: o texto inteiro é um produto único com " e " no nome. Usa ele.
          return selecionarProduto(direto[0], estado);
        }
        estado.pendentes = mult.pendentes;
        return resolverPedidoDe(texto, mult.primeiro!, estado);
      }
      const encontrados = await buscarProdutos(estado.empresaId, texto, 5);
      if (encontrados.length === 0) {
        estado.tentativas += 1;
        if (estado.tentativas >= 2) {
          return { etapa: "humana", texto: "Não encontrei esse produto no cardápio. Vou pedir pra um atendente humano te ajudar. 🙋" };
        }
        return {
          etapa: "produto",
          texto: "Não encontrei esse item no cardápio. 🤔 Pode conferir o nome? (ex.: *calabresa*, *mussarela*, *refrigerante 2L*)",
        };
      }
      if (encontrados.length === 1) {
        return selecionarProduto(encontrados[0], estado);
      }
      estado.ultimaBusca = encontrados.map((p) => ({ id: p.id, nome: p.nome }));
      estado.tentativas = 0;
      return {
        etapa: "produto",
        texto: `Encontrei mais de um item. Qual deles você quer?\n${listar(
          encontrados.map((p) => ({ nome: p.nome, detalhe: brl(p.precoBase) }))
        )}\n*(responda com o número)*`,
      };
    }

    case "tamanho": {
      const atual = estado.atual;
      if (!atual) return { etapa: "produto", texto: "Qual produto você quer?" };
      const tamanhos = atual.tamanhos;
      const idx = indiceNumerico(texto, tamanhos.length);
      let escolhido: TamanhoOpcao | null = null;
      if (idx !== null) {
        escolhido = tamanhos[idx];
      } else {
        const limpo = texto.trim().toLowerCase();
        escolhido =
          tamanhos.find((t) => limpo.includes(t.nome.toLowerCase())) ??
          tamanhos.find((t) => limpo.includes(t.nome.toLowerCase().slice(0, 4))) ??
          null;
      }
      if (!escolhido) {
        return { etapa: "tamanho", texto: "Pode confirmar o tamanho? Responda com o número da lista." };
      }
      atual.tamanho = escolhido;
      return proximoDoItem(atual, estado);
    }

    case "sabores": {
      const atual = estado.atual;
      if (!atual || !atual.temSabores) return { etapa: "produto", texto: "Qual produto você quer?" };
      if (atual.saboresEscolhidos.length === 0 && atual.saboresFaltando === undefined) {
        const escolha = texto.trim().toLowerCase();
        const n = Number(escolha.replace(/\D/g, ""));
        if (/2|dois|meio a meio|metade/.test(escolha)) {
          atual.saboresFaltando = 2;
          const lista = atual.sabores.map((s) => ({
            nome: s.nome,
            detalhe: s.tipo === "especial" ? "especial" : "tradicional",
          }));
          return {
            etapa: "sabores",
            texto: `Beleza, *meio a meio*! Primeiro sabor:\n${listar(lista)}\n*(responda com o número ou nome)*`,
          };
        } else if (/1|um/.test(escolha) || n === 1) {
          atual.saboresFaltando = 1;
          const lista = atual.sabores.map((s) => ({
            nome: s.nome,
            detalhe: s.tipo === "especial" ? "especial" : "tradicional",
          }));
          return {
            etapa: "sabores",
            texto: `Qual sabor de *${atual.nome}*?\n${listar(lista)}\n*(responda com o número ou nome)*`,
          };
        } else {
          return {
            etapa: "sabores",
            texto: "Quantos sabores? Pode ser *1* ou *2* (meio a meio).",
          };
        }
      }
      if (atual.saboresFaltando === undefined || atual.saboresFaltando <= 0) {
        return proximoDoItem(atual, estado);
      }
      const opcoesDisponiveis = atual.sabores.filter((s) => !atual.saboresEscolhidos.includes(s.nome));
      const nomeLimpo = texto.trim().toLowerCase().replace(/^(sabor|de|do|da|meio a meio)\s+/i, "");
      const idx = indiceNumerico(texto, opcoesDisponiveis.length);
      let sabor: SaborOpcao | null = null;
      if (idx !== null) {
        sabor = opcoesDisponiveis[idx];
      } else if (nomeLimpo.length >= 2) {
        sabor =
          opcoesDisponiveis.find((s) => nomeLimpo.includes(s.nome.toLowerCase())) ??
          opcoesDisponiveis.find((s) => s.nome.toLowerCase().includes(nomeLimpo)) ??
          opcoesDisponiveis.find((s) => s.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(nomeLimpo.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) ??
          null;
      }
      if (!sabor) {
        const listaOpcoes = opcoesDisponiveis.map((s) => ({
          nome: s.nome,
          detalhe: s.tipo === "especial" ? "especial" : "tradicional",
        }));
        return {
          etapa: "sabores",
          texto: `Não achei esse sabor. Os sabores disponíveis de *${atual.nome}* são:\n${listar(
            listaOpcoes
          )}\n*Responda com o número ou nome do sabor.*`,
        };
      }
      if (atual.saboresEscolhidos.includes(sabor.nome)) {
        const listaOpcoes = opcoesDisponiveis.map((s) => ({
          nome: s.nome,
          detalhe: s.tipo === "especial" ? "especial" : "tradicional",
        }));
        return {
          etapa: "sabores",
          texto: `Esse sabor já foi escolhido. Os sabores disponíveis são:\n${listar(
            listaOpcoes
          )}\n*Escolha outro sabor.*`,
        };
      }
      atual.saboresEscolhidos.push(sabor.nome);
      atual.saboresFaltando = (atual.saboresFaltando ?? 1) - 1;
      if (atual.saboresFaltando > 0) {
        const restantes = atual.sabores.filter((s) => !atual.saboresEscolhidos.includes(s.nome));
        return {
          etapa: "sabores",
          texto: `Anotado: *${sabor.nome}*! Qual o segundo sabor?\n${listar(
            restantes.map((s) => ({ nome: s.nome, detalhe: s.tipo === "especial" ? "especial" : "tradicional" }))
          )}\n*(responda com o número ou nome)*`,
        };
      }
      return proximoDoItem(atual, estado);
    }

    case "adicionais": {
      const atual = estado.atual;
      if (!atual) return { etapa: "produto", texto: "Qual produto você quer?" };
      const opcoes = (await listarAdicionais(estado.empresaId)).map((a) => ({ nome: a.nome, detalhe: brl(a.preco) }));
      const perguntaQuantidade = { etapa: "quantidade" as const, texto: `Quantas unidades de *${atual.nome}*?` };
      if (opcoes.length === 0) {
        atual.adicionais = [];
        return perguntaQuantidade;
      }
      const limpo = texto.trim().toLowerCase();
      if (/^(0|nenhum|n[aã]o|nao|sem adicional|sem)/.test(limpo)) {
        atual.adicionais = [];
        return perguntaQuantidade;
      }
      const numeros = (texto.match(/\d+/g) ?? []).map(Number).filter((n) => n >= 1 && n <= opcoes.length);
      const escolhidos: { nome: string; preco: number }[] = [];
      if (numeros.length > 0) {
        for (const n of numeros) {
          const opcao = opcoes[n - 1];
          if (opcao && !escolhidos.some((e) => e.nome === opcao.nome)) {
            const real = await prisma.adicional.findFirst({ where: { empresaId: estado.empresaId, nome: opcao.nome, ativo: true } });
            if (real) escolhidos.push({ nome: real.nome, preco: real.preco });
          }
        }
      }
      if (escolhidos.length === 0) {
        return {
          etapa: "adicionais",
          texto: `Tem adicionais? Responda com os números (ex.: *1,3*) ou *0* para nenhum.\n${listar(opcoes)}`,
        };
      }
      atual.adicionais = escolhidos;
      return perguntaQuantidade;
    }

    case "quantidade": {
      const atual = estado.atual;
      if (!atual) return { etapa: "produto", texto: "Qual produto você quer?" };
      const n = Number(texto.trim().replace(/\D/g, ""));
      if (!Number.isInteger(n) || n < 1 || n > 20) {
        return { etapa: "quantidade", texto: "Quantas unidades? (de 1 a 20)" };
      }
      atual.quantidade = n;
      const precoUnit = calcularPrecoItem({
        precoBaseProduto: atual.precoBase,
        tamanho: atual.tamanho ?? null,
        adicionais: atual.adicionais,
      });
      // Chave de idempotência do carrinho: criada no PRIMEIRO item e
      // persistida com o estado da conversa, antes de o cliente confirmar.
      // É o que faz um reenvio da Meta devolver o mesmo pedido.
      if (!estado.chaveIdempotencia) estado.chaveIdempotencia = novaChaveIdempotencia();
      estado.itens.push({
        produtoId: atual.produtoId,
        nome: atual.nome,
        precoUnit,
        quantidade: n,
        tamanho: atual.tamanho?.nome ?? null,
        sabores: atual.saboresEscolhidos,
        adicionais: atual.adicionais,
      });
      delete estado.atual;
      estado.tentativas = 0;
      // Se ainda há itens pendentes pedidos de uma vez, processa o próximo agora.
      if (estado.pendentes && estado.pendentes.length > 0) {
        const proximo = estado.pendentes[0];
        estado.pendentes = estado.pendentes.slice(1);
        const restante = estado.pendentes.length;
        const msg = `Anotado! *${n}× ${atual.nome}* ${atual.tamanho ? `(${atual.tamanho.nome}) ` : ""}por ${brl(precoUnit)} cada. ✅ Vou adicionar agora *${proximo}*${
          restante > 0 ? ` e mais ${restante} linha(s)` : ""
        }.`;
        return resolverPedidoDeComPretexto(msg, proximo, estado);
      }
      return {
        etapa: "mais_itens",
        texto: `Anotado! *${n}× ${atual.nome}* ${atual.tamanho ? `(${atual.tamanho.nome}) ` : ""}por ${brl(precoUnit)} cada. Quer mais alguma coisa? *(sim / não)*`,
      };
    }

    case "mais_itens": {
      if (ehSim(texto)) {
        estado.ultimaBusca = [];
        return {
          etapa: "produto",
          texto: "Boa! O que mais você vai querer? (diga o nome do produto)",
        };
      }
      if (ehNao(texto) || querPedir(texto)) {
        return {
          etapa: "entrega_retirada",
          texto: "Perfeito! 🛵 Será *entrega* ou *retirada*?",
        };
      }
      return { etapa: "mais_itens", texto: "Quer adicionar mais algum item? *(sim / não)*" };
    }

    case "entrega_retirada": {
      const limpo = texto.trim().toLowerCase();
      if (/entrega|delivery|deliver|mandar|enviar/.test(limpo)) {
        estado.canal = "entrega";
        return {
          etapa: "endereco",
          texto: "Anotado: *entrega*! 📍 Qual o endereço? (rua e número)",
        };
      }
      if (/retirada|retirar|pego|pegar|busco|buscar|balc[aã]o/.test(limpo)) {
        estado.canal = "retirada";
        return {
          etapa: "pagamento",
          texto: "Anotado: *retirada*! O pagamento é feito na loja, na hora da retirada. 💳 Qual a forma de pagamento?",
        };
      }
      return { etapa: "entrega_retirada", texto: "É *entrega* ou *retirada*?" };
    }

    case "endereco": {
      // Cliente cadastrado: oferece os endereços salvos.
      const cliente = await clientePorTelefone(estado.empresaId, estado.cliente?.telefone ?? "");
      if (cliente && cliente.enderecos.length > 0 && !estado.endereco) {
        const opcoes = cliente.enderecos.map((e) => ({
          nome: `${e.rua} — ${e.bairro}${e.complemento ? ` (${e.complemento})` : ""}`,
        }));
        const idx = indiceNumerico(texto, opcoes.length);
        if (idx !== null) {
          const e = cliente.enderecos[idx];
          estado.endereco = { rua: e.rua, bairro: e.bairro };
          return irParaPagamento(estado);
        }
        if (limpoEndereco(texto)) {
          estado.endereco = { rua: texto.trim(), bairro: "" };
          return { etapa: "bairro", texto: "E o *bairro*? (para calcular a taxa de entrega)" };
        }
        return {
          etapa: "endereco",
          texto: `Podemos usar um endereço salvo?\n${listar(opcoes)}\nOu digite o endereço completo (rua e número).`,
        };
      }
      if (limpoEndereco(texto)) {
        estado.endereco = { rua: texto.trim(), bairro: "" };
        return { etapa: "bairro", texto: "E o *bairro*? (para calcular a taxa de entrega)" };
      }
      return { etapa: "endereco", texto: "Qual o endereço de entrega? (rua e número)" };
    }

    case "bairro": {
      const bairro = texto.trim();
      if (bairro.length < 2) {
        return { etapa: "bairro", texto: "Qual o bairro da entrega?" };
      }
      estado.endereco = { ...(estado.endereco ?? { rua: "" }), bairro };
      return irParaPagamento(estado);
    }

    case "pagamento": {
      const formas = await listarFormasPagamento(estado.empresaId);
      const idx = indiceNumerico(texto, formas.length);
      let forma: string | null = null;
      if (idx !== null) {
        forma = formas[idx].value;
      } else {
        const limpo = texto.trim().toLowerCase();
        forma =
          formas.find((f) => limpo.includes(f.value) || limpo.includes(f.label.toLowerCase()))?.value ?? null;
        if (!forma) {
          if (/d[eé]bito|débito|debito/.test(limpo)) forma = "debito";
          else if (/cr[eé]dito|credito/.test(limpo)) forma = "credito";
          else if (/pix|px/.test(limpo)) forma = "pix";
          else if (/dinheiro|cash/.test(limpo)) forma = "dinheiro";
        }
      }
      if (!forma) {
        return {
          etapa: "pagamento",
          texto: `Quais dessas formas de pagamento você prefere?\n${listar(formas.map((f) => ({ nome: f.label })))}`,
        };
      }
      estado.formaPagamento = forma;
      if (forma === "dinheiro" && estado.canal === "entrega") {
        return {
          etapa: "troco",
          texto: "Beleza, *dinheiro*! 💵 Vai precisar de troco? Se sim, de quanto? *(ex.: 100)*",
        };
      }
      // Identificação do cliente: pede o nome antes de fechar (quando ainda
      // não foi identificado).
      return pedirNomeOuResumo(estado);
    }

    case "nome": {
      const nome = texto.trim().replace(/^meu nome (é|e) /i, "").replace(/^sou (o|a) /i, "").slice(0, 40);
      if (nome.length < 2) {
        return { etapa: "nome", texto: "Pode me dizer seu nome? (ex.: *Ana Souza*)" };
      }
      estado.cliente = { nome, telefone: estado.cliente?.telefone ?? "" };
      return irParaResumo(estado);
    }

    case "troco": {
      const limpo = texto.trim().toLowerCase();
      if (/n[aã]o|nao|n|zero|sem/.test(limpo) && !/\d/.test(limpo)) {
        estado.trocoPara = 0;
        return pedirNomeOuResumo(estado);
      }
      const n = Number(limpo.replace(/\D/g, ""));
      if (!Number.isInteger(n) || n <= 0 || n > 1000) {
        return { etapa: "troco", texto: "De quanto será o troco? (ex.: *100*) ou *não* se não precisar." };
      }
      estado.trocoPara = n;
      return pedirNomeOuResumo(estado);
    }

    case "resumo": {
      if (ehNao(texto)) {
        estado.itens = [];
        estado.canal = undefined;
        estado.endereco = undefined;
        estado.formaPagamento = undefined;
        estado.trocoPara = undefined;
        estado.taxa = undefined;
        return {
          etapa: "intencao",
          texto: "Sem problema! Podemos recomeçar: você quer *pedir* alguma coisa?",
        };
      }
      if (ehSim(texto)) {
        const criado = await criarPedidoReal(estado);
        return criado;
      }
      return {
        etapa: "resumo",
        texto: "Confirma o pedido? Responda *sim* para fechar ou *não* para recomeçar.",
      };
    }

    case "criado": {
      if (querPedir(texto) || querCardapio(texto)) {
        estado.itens = [];
        estado.canal = undefined;
        estado.endereco = undefined;
        estado.formaPagamento = undefined;
        estado.trocoPara = undefined;
        estado.taxa = undefined;
        return { etapa: "produto", texto: "Claro! O que você vai querer agora?" };
      }
      if (querCancelar(texto)) {
        return { etapa: "encerrada", texto: "Tudo bem! Se precisar é só chamar. 😉" };
      }
      return {
        etapa: "criado",
        texto: "Seu pedido já está confirmado! Se precisar de algo, pode me chamar. 😊",
      };
    }

    default:
      return { etapa: "intencao", texto: "Como posso ajudar? (pedir, cardápio, promoções, horário)" };
  }
}

function limpoEndereco(texto: string): boolean {
  const t = texto.trim();
  return t.length >= 8 && /\d/.test(t) && /\s/.test(t);
}

/**
 * Isola o termo de busca de um produto removendo o "recheio" de conversa
 * (verbos de pedido, dicas, artigos, cortesia). Permite que frases naturais
 * como "me vê uma coca 2 litros" ou "qual o preço da calabresa" caiam na
 * busca real do cardápio em vez de virarem "não entendi".
 */
function limparBusca(texto: string): string {
  return texto
    .replace(
      /(quero pedir|quero fazer um pedido|gostaria de pedir|vou pedir|montar um pedido|fazer pedido|vou querer|quero comprar|gostaria de|quero saber|me v[êe]|manda ver|manda|pode ser|pra mim|quero|queria|eu quero|voc[eê]s t[eê]m|voc[eê] t[eê]m|tem|qual o pre[cç]o|qual pre[cç]o|quanto custa|quanto [eé]|qual o valor|me passa o|me passa|passa o|por favor|porfavor|um|uma|o|a|de|da|do|s[óo])/gi,
      " "
    )
    .replace(/[?!,.;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detecta se o texto lista mais de um item (separados por " e ", "," ou "mais").
 * Retorna o primeiro item para processar agora e os demais como pendentes.
 * Usa separadores RAROS no cardápio para não quebrar nomes compostos (ex.: "Borda de Queijo").
 */
function separarMultiplosItens(texto: string): { primeiro?: string; pendentes: string[]; processo: boolean } {
  const partes = texto
    .split(/\s+\be\b\s+|[,;]|\s+\+\s+| e mais | mais | também| tambem| junto| acompanhado/g)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);
  if (partes.length >= 2 && !/molho|queijo|borda/.test(texto.toLowerCase())) {
    return { primeiro: partes[0], pendentes: partes.slice(1), processo: true };
  }
  return { pendentes: [], processo: false };
}

/**
 * Processa o primeiro de uma lista de produtos citados de uma vez, guardando os
 * demais em `estado.pendentes`. Usa a IA de normalização para resolver sinônimos.
 */
async function resolverPedidoDe(textoOriginal: string, nomeItem: string, estado: Estado, pretexto = ""): Promise<PassoResultado> {
  // Resolve apelidos pelo cardápio via IA (ex.: "coca" -> "Refrigerante 2L").
  let alvo = nomeItem;
  try {
    const catalogo = (await listarProdutosDisponiveis(estado.empresaId)).slice(0, 40);
    const normalizado = await interpretarMensagem({
      empresaId: estado.empresaId,
      etapa: "produto",
      mensagem: nomeItem,
      estadoResumo: "cliente pediu um item",
      catalogo: catalogo.map((p) => ({ nome: p.nome, preco: p.precoBase })),
    });
    const texto2 = normalizado?.trim();
    if (texto2 && texto2.length >= 2 && texto2.toLowerCase() !== nomeItem.toLowerCase()) {
      alvo = texto2;
    }
  } catch {
    // segue com o que foi digitado
  }

  const achados = await buscarProdutos(estado.empresaId, alvo, 5);
  const pre = pretexto ? `${pretexto}\n\n` : "";
  if (achados.length === 1) {
    estado.tentativas = 0;
    const r = await selecionarProduto(achados[0], estado);
    if (pre) r.texto = `${pre}${r.texto}`;
    return r;
  }
  if (achados.length > 1) {
    estado.ultimaBusca = achados.map((p) => ({ id: p.id, nome: p.nome }));
    estado.tentativas = 0;
    const pendente = estado.pendentes && estado.pendentes.length > 0 ? `\n\n*(Depois continuamos com: ${estado.pendentes.join(" e ")})*` : "";
    return {
      etapa: "produto",
      texto: `${pre}Encontrei mais de um item para ${nomeItem}. Qual deles você quer?\n${listar(
        achados.map((p) => ({ nome: p.nome, detalhe: brl(p.precoBase) }))
      )}\n*(responda com o número)*${pendente}`,
    };
  }
  // Não achou o primeiro item; mantém os pendentes mas avisa (não transfere pra humano na 1ª vez).
  estado.pendentes = [];
  estado.tentativas += 1;
  return {
    etapa: "produto",
    texto: `${pre}Não encontrei "${nomeItem}" no cardápio. 🤔 Pode conferir o nome? (ex.: *calabresa*, *mussarela*, *refrigerante 2L*)`,
  };
}

function resolverPedidoDeComPretexto(pretexto: string, nomeItem: string, estado: Estado): Promise<PassoResultado> {
  return resolverPedidoDe(pretexto, nomeItem, estado, pretexto);
}

function selecionarProduto(produto: { id: string; nome: string }, estado: Estado): Promise<PassoResultado> {  // Recarrega o produto real (nunca confia no que o cliente digitou).
  return prisma.produto
    .findFirst({
      where: { id: produto.id, empresaId: estado.empresaId },
      include: {
        precos: { include: { tamanho: true }, orderBy: { tamanho: { fatorPreco: "asc" } } },
        sabores: { include: { sabor: true } },
      },
    })
    .then((real) => {
      if (!real || !real.ativo) {
        return { etapa: "produto", texto: "Esse item está indisponível no momento. Pode escolher outro?" };
      }
      estado.atual = {
        produtoId: real.id,
        nome: real.nome,
        precoBase: real.preco,
        temTamanhos: real.precos.length > 1,
        temSabores: real.sabores.length > 0,
        sabores: real.sabores.map((ps) => ({ nome: ps.sabor.nome, tipo: ps.sabor.tipo })),
        tamanhos: real.precos.map((pt) => ({ nome: pt.tamanho.nome, valor: pt.valor })),
        saboresEscolhidos: [],
        adicionais: [],
      };
      estado.tentativas = 0;
      return proximoDoItem(estado.atual, estado);
    });
}

function proximoDoItem(atual: ItemEmMontagem, estado: Estado): PassoResultado {
  if (atual.temTamanhos && !atual.tamanho) {
    return {
      etapa: "tamanho",
      texto: `Qual tamanho de *${atual.nome}*?\n${listar(
        atual.tamanhos.map((t) => ({ nome: t.nome, detalhe: brl(t.valor) }))
      )}\n*(responda com o número)*`,
    };
  }
  if (atual.temSabores && atual.saboresEscolhidos.length === 0 && atual.saboresFaltando === undefined) {
    return {
      etapa: "sabores",
      texto: `*${atual.nome}* tem os sabores:\n${listar(
        atual.sabores.map((s) => ({ nome: s.nome, detalhe: s.tipo === "especial" ? "especial" : "tradicional" }))
      )}\n\nQuer *1* ou *2* sabores? (meio a meio)`,
    };
  }
  if (!atual.quantidade) {
    return { etapa: "adicionais", texto: "Pode pedir *adicionais*? Responda *0* para nenhum." };
  }
  return { etapa: "quantidade", texto: `Quantas unidades de *${atual.nome}*?` };
}

async function irParaPagamento(estado: Estado): Promise<PassoResultado> {
  const subtotal = estado.itens.reduce((acc, i) => acc + i.precoUnit * i.quantidade, 0);
  const configTaxa = await lerConfigTaxaEntrega(estado.empresaId);
  const { taxa } = calcularTaxaEntrega(configTaxa, estado.endereco?.bairro, subtotal);
  estado.taxa = Math.round(taxa * 100) / 100;
  const formas = await listarFormasPagamento(estado.empresaId);
  const taxaInfo = taxa === 0 ? "A taxa de entrega está *grátis* para este pedido! 🎉" : `A taxa de entrega para *${estado.endereco?.bairro}* é de *${brl(taxa)}*.`;
  return {
    etapa: "pagamento",
    texto: `📍 Entrega em: ${estado.endereco?.rua} — ${estado.endereco?.bairro}\n${taxaInfo}\n\nO pagamento é feito na entrega. Qual a forma?\n${listar(
      formas.map((f) => ({ nome: f.label }))
    )}`,
  };
}

async function irParaResumo(estado: Estado): Promise<PassoResultado> {
  return { etapa: "resumo", texto: await montarResumo(estado) };
}

/** Pede o nome (identificação) antes do resumo, se ainda não coletado. */
async function pedirNomeOuResumo(estado: Estado): Promise<PassoResultado> {
  if (!estado.cliente?.nome) {
    return { etapa: "nome", texto: "Só mais uma coisa: qual o seu nome para o pedido?" };
  }
  return irParaResumo(estado);
}

async function montarResumo(estado: Estado): Promise<string> {
  const subtotal = estado.itens.reduce((acc, i) => acc + i.precoUnit * i.quantidade, 0);
  const taxa = estado.taxa ?? 0;
  const total = estado.canal === "entrega" ? subtotal + taxa : subtotal;
  const linhas = estado.itens.map((i) => {
    const detalhe = [
      i.tamanho ? `tamanho ${i.tamanho}` : null,
      i.sabores.length > 0 ? `sabores: ${i.sabores.join(" + ")}` : null,
      i.adicionais.length > 0 ? `adicionais: ${i.adicionais.map((a) => a.nome).join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
    return `${i.quantidade}× ${i.nome}${detalhe ? ` (${detalhe})` : ""} — ${brl(i.precoUnit * i.quantidade)}`;
  });
  const partePagamento =
    estado.canal === "entrega"
      ? `Forma: ${estado.formaPagamento}${estado.trocoPara ? ` | troco para ${brl(estado.trocoPara!)}` : ""}`
      : "Pagamento na retirada (na loja)";
  const resumo = [
    `📋 *Resumo do pedido:*`,
    linhas.join("\n"),
    ``,
    `Subtotal: ${brl(subtotal)}`,
    ...(estado.canal === "entrega" ? [`Taxa de entrega: ${brl(taxa)}`, `*Total: ${brl(total)}*`] : [`*Total: ${brl(total)}*`]),
    ...(estado.canal === "entrega" ? [`📍 ${estado.endereco?.rua} — ${estado.endereco?.bairro}`] : ["🏪 Retirada na loja"]),
    partePagamento,
  ].join("\n");
  return `${resumo}\n\nConfirma o pedido? *(sim / não)*`;
}

/* ------------------------- Criação do pedido REAL -------------------------- */

async function criarPedidoReal(estado: Estado): Promise<PassoResultado> {
  if (estado.itens.length === 0) {
    return { etapa: "intencao", texto: "Seu carrinho está vazio. Quer pedir alguma coisa?" };
  }

  // ------------------------------------------------------------------
  // FONTE ÚNICA DE VERDADE (correção): este caminho tinha uma segunda
  // implementação de criação de pedido, escrevendo direto no Prisma. Ela
  // ignorava a regra de preço de pizza (`preco-pizza.ts`), o limite de
  // sabores do tamanho, a validação doce/salgada e a idempotência por
  // índice único — ou seja, uma pizza Família com 3 sabores especiais
  // saía pelo WhatsApp por R$ 72 enquanto o PDV cobrava R$ 92 pela mesma
  // pizza. Agora o WhatsApp usa exatamente o mesmo `criarPedido()` do
  // PDV: preço, taxa e validações vêm todos do backend.
  // ------------------------------------------------------------------
  const canal = estado.canal === "entrega" ? "delivery" : "retirada";
  const telefone = estado.cliente?.telefone ?? "";
  const nome = estado.cliente?.nome?.trim() || (telefone ? "Cliente WhatsApp" : null);

  const corpo: Record<string, unknown> = {
    canal,
    origem: "whatsapp",
    observacao: "Pedido via WhatsApp",
    idempotencyKey: estado.chaveIdempotencia,
    cliente: nome && telefone ? { nome, telefone } : undefined,
    itens: estado.itens.map((i) => ({
      produtoId: i.produtoId,
      nome: i.nome,
      quantidade: i.quantidade,
      tamanho: i.tamanho,
      // Nomes dos sabores: `criarPedido` resolve cada sabor no cadastro,
      // descobre o tipo (tradicional/especial/doce) e aplica o acréscimo.
      sabores: i.sabores,
      adicionais: i.adicionais.map((a) => ({ nome: a.nome, preco: a.preco, quantidade: 1 })),
    })),
    ...(canal === "delivery" && estado.endereco?.rua && estado.endereco?.bairro
      ? { entrega: { endereco: estado.endereco.rua, bairro: estado.endereco.bairro } }
      : {}),
    ...(canal === "delivery" && estado.formaPagamento
      ? { formaPagamentoEntrega: estado.formaPagamento, pagarNaEntrega: true }
      : {}),
    ...(canal === "delivery" && estado.trocoPara ? { trocoPara: estado.trocoPara } : {}),
  };

  let resultado;
  try {
    resultado = await criarPedido(
      estado.empresaId,
      // Pedido de WhatsApp não tem usuário logado. O papel NUNCA pode ser
      // "GARCOM" (isso forçaria o canal para "salao" dentro de criarPedido).
      { id: "whatsapp", nome: "Atendente WhatsApp", papel: "SISTEMA" },
      corpo
    );
  } catch (e) {
    console.error("[whatsapp] falha inesperada ao criar pedido", {
      empresaId: estado.empresaId,
      telefone,
      erro: e instanceof Error ? e.message : String(e),
    });
    return {
      etapa: "humana",
      texto: "Ops, tive um problema ao registrar seu pedido. 😕 Vou chamar um atendente humano para resolver com você.",
    };
  }

  if (!resultado.ok) {
    // Erros de REGRA (preço de pizza não configurado, limite de sabores,
    // mistura proibida, produto fora do cadastro) não podem virar um
    // pedido errado nem um 500 mudo: viram atendimento humano com log.
    console.error("[whatsapp] pedido recusado pelo backend", {
      empresaId: estado.empresaId,
      telefone,
      status: resultado.status,
      erro: resultado.erro,
    });
    return {
      etapa: "humana",
      texto:
        `Não consegui fechar seu pedido automaticamente: ${resultado.erro} ` +
        "Vou chamar um atendente humano para finalizar com você. 🙋",
    };
  }

  const pedido = resultado.pedido;

  // Reenvio da Meta / cliente mandando "sim" duas vezes: o pedido já
  // existe, então respondemos a MESMA confirmação sem imprimir de novo.
  if (resultado.idempotente) {
    return {
      etapa: "criado",
      pedidoId: pedido.id,
      texto: `Seu pedido *Nº ${pedido.numero}* já está confirmado — total ${brl(pedido.total)}. Já está na produção. 😉`,
    };
  }

  estado.chaveIdempotencia = undefined;
  emitirMudancaKds(estado.empresaId);

  // Impressão automática (mesma regra do PDV): erro de impressora não pode
  // derrubar um pedido que JÁ foi criado e cobrado.
  try {
    const tipo = tipoParaCanalPedido(canal);
    const conteudo = await gerarConteudoPedido(estado.empresaId, pedido.numero, tipo);
    if (conteudo) {
      const impressoras = await lerImpressoras(estado.empresaId);
      await enfileirarAutomatica(estado.empresaId, {
        tipo,
        destino: destinoRealDoTipo(tipo, impressoras),
        referencia: referenciaPedido(pedido.numero),
        conteudo,
      });
    }
  } catch (e) {
    console.error("[whatsapp] pedido criado mas a impressão falhou", {
      empresaId: estado.empresaId,
      pedidoNumero: pedido.numero,
      erro: e instanceof Error ? e.message : String(e),
    });
  }

  const resumo = estado.itens
    .map((i) => `${i.quantidade}× ${i.nome}${i.tamanho ? ` (${i.tamanho})` : ""}`)
    .join(", ");
  const pagamentoTexto =
    canal === "delivery"
      ? `Pagamento (${estado.formaPagamento}) na entrega${estado.trocoPara ? `, troco para ${brl(estado.trocoPara)}` : ""}.`
      : "Pagamento na retirada, na loja.";
  return {
    etapa: "criado",
    pedidoId: pedido.id,
    texto: [
      `✅ *Pedido confirmado!* Nº **${pedido.numero}**`,
      ``,
      resumo,
      // O total exibido é o do BANCO (recalculado), nunca o somatório
      // que o motor da conversa tinha em memória.
      `Total: ${brl(pedido.total)}`,
      canal === "delivery"
        ? `📍 ${estado.endereco?.rua} — ${estado.endereco?.bairro} (entrega em ${previsaoEntregaPadrao()})`
        : "🏪 Retirada na loja",
      pagamentoTexto,
      ``,
      "Seu pedido já entrou na produção. Obrigado! 😊",
    ].join("\n"),
  };
}

/**
 * Detecta se a conversa ficou tempo demais sem interação (o cliente
 * abandonou o pedido no meio). Só considera conversas que JÁ estavam em
 * andamento — a primeira mensagem de uma conversa "nova" nunca expira.
 */
function conversaOciosa(conversa: { atualizadoEm: Date }): boolean {
  return Date.now() - new Date(conversa.atualizadoEm).getTime() > TEMPO_MAXIMO_INATIVIDADE_MS;
}

/** Estado zerado (sem carrinho/endereço/pagamento) — para recomeço limpo. */
function estadoZerado(empresaId: string): Estado {
  return { empresaId, itens: [], tentativas: 0 };
}

/* --------------------- Ponto de entrada (persistência) --------------------- */

export interface ResultadoMensagem {
  resposta: string;
  conversaId: string;
  etapa: string;
  status: string;
  humana: boolean;
  pedidoId: string | null;
}

export async function receberMensagemWhatsApp(
  empresaId: string,
  telefone: string,
  texto: string,
  origem: "whatsapp" | "simulacao" = "whatsapp"
): Promise<ResultadoMensagem> {
  const tel = normalizarTelefone(telefone);
  const limpo = texto.trim();
  if (!tel || !limpo) {
    return {
      resposta: "",
      conversaId: "",
      etapa: "",
      status: "",
      humana: false,
      pedidoId: null,
    };
  }

  let conversa = await prisma.conversaWhatsApp.findUnique({
    where: { empresaId_telefone: { empresaId, telefone: tel } },
  });
  if (!conversa) {
    const cliente = await clientePorTelefone(empresaId, tel);
    conversa = await prisma.conversaWhatsApp.create({
      data: {
        empresaId,
        telefone: tel,
        origem,
        nome: cliente?.nome ?? null,
        status: "nova",
        etapa: "saudacao",
        estado: JSON.stringify({ empresaId, itens: [], tentativas: 0 } satisfies Estado),
      },
    });
  }

  await prisma.mensagemWhatsApp.create({
    data: { conversaId: conversa.id, de: "cliente", texto: limpo },
  });

  // Conversa encerrada reabre com saudação curta (sem perder o vínculo).
  if (conversa.status === "encerrada") {
    const estadoReinicio: Estado = estadoZerado(empresaId);
    await prisma.conversaWhatsApp.update({
      where: { id: conversa.id },
      data: { status: "nova", etapa: "intencao", estado: JSON.stringify(estadoReinicio) },
    });
    conversa = (await prisma.conversaWhatsApp.findUnique({ where: { id: conversa.id } }))!;
  }

  // TIMEOUT DE SESSÃO (PEDIDO 18 — robustez): se o cliente largou a
  // conversa por mais de `TEMPO_MAXIMO_INATIVIDADE_MS` (abandonou um pedido
  // no meio), zera o estado no banco ANTES de processar. Sem isso, um "sim"
  // mandado muito depois confirmaria um carrinho velho (itens, endereço e
  // forma de pagamento de uma conversa antiga) como pedido novo. Uma
  // conversa "nova" (primeira mensagem) não tem tempo ocioso e nunca cai aqui.
  const estadoPrevio = JSON.parse(conversa.estado || "{}") as Estado;
  const tinhaContextoOcioso =
    (Array.isArray(estadoPrevio.itens) && estadoPrevio.itens.length > 0) ||
    !!estadoPrevio.canal ||
    !!estadoPrevio.endereco ||
    !!estadoPrevio.formaPagamento ||
    estadoPrevio.chaveIdempotencia !== undefined;
  let carrinhoLimpadoPorInatividade = false;
  if (
    conversa.status !== "nova" &&
    conversa.etapa !== "criado" &&
    !conversa.atendimentoHumano &&
    conversaOciosa(conversa)
  ) {
    const estadoReinicio = estadoZerado(empresaId);
    if ((estadoPrevio.cliente?.nome || conversa.nome) && estadoPrevio.cliente?.nome) {
      estadoReinicio.cliente = {
        nome: estadoPrevio.cliente.nome,
        telefone: tel,
      };
    }
    await prisma.conversaWhatsApp.update({
      where: { id: conversa.id },
      data: { status: "nova", etapa: "intencao", estado: JSON.stringify(estadoReinicio) },
    });
    conversa = (await prisma.conversaWhatsApp.findUnique({ where: { id: conversa.id } }))!;
    if (tinhaContextoOcioso) carrinhoLimpadoPorInatividade = true;
  }

  const estado: Estado = { ...(JSON.parse(conversa.estado || "{}") as Estado), empresaId };
  if (!estado.itens) estado.itens = [];
  if (typeof estado.tentativas !== "number") estado.tentativas = 0;
  // Identificação pelo número: o telefone do cliente é sempre o da conversa.
  if (!estado.cliente) estado.cliente = { nome: conversa.nome ?? null, telefone: tel };

  let resposta: PassoResultado;

  if (conversa.atendimentoHumano) {
    resposta = {
      etapa: "humana",
      texto: "Um atendente humano já está cuidando do seu atendimento e vai te responder em instantes. ⏳",
    };
  } else if (querHumano(limpo) && !["humana", "encerrada", "criado"].includes(conversa.etapa)) {
    resposta = { etapa: "humana", texto: "Sem problemas! Vou transferir você para um atendente humano, um instante. 🙋" };
  } else {
    const persona = await carregarPersonaAtendente(empresaId);
    // IA opcional: normaliza a mensagem com os nomes reais do catálogo;
    // sem chave, usa a mensagem como veio (interpretação por regras).
    const textoDaMensagem = iaDisponivel()
      ? await normalizarComIa(conversa.etapa, limpo, estado, persona)
      : limpo;
    resposta = await passoAtendimento(conversa.etapa, textoDaMensagem, estado, persona);
    // Avisa que a sessão antiga foi descartada (por inatividade) antes de
    // processar, para o cliente entender que o carrinho anterior sumiu.
    if (carrinhoLimpadoPorInatividade) {
      resposta.texto = `Parece que ficamos algum tempo sem conversar, então deixei seu pedido antigo de lado e recomeçamos do zero. 😊\n\n${resposta.texto}`;
    }
    // IA opcional: reescreve a resposta validada do motor de forma natural
    // e amigável, SEM inventar dados — os fatos (preços, opções, etapas,
    // pedido) vêm todos do motor; a IA só melhora o texto. Em qualquer
    // falha, mantém o texto base do motor.
    if (iaDisponivel() && !["humana", "encerrada", "criado"].includes(resposta.etapa)) {
      const itemAtual =
        estado.atual && estado.atual.nome
          ? `${estado.atual.nome}${estado.atual.tamanho ? ` (tamanho ${estado.atual.tamanho.nome})` : ""}${
              estado.atual.saboresEscolhidos.length > 0 ? ` — sabores: ${estado.atual.saboresEscolhidos.join(", ")}` : ""
            }${estado.atual.adicionais.length > 0 ? ` — adicionais: ${estado.atual.adicionais.map((a) => a.nome).join(", ")}` : ""}${
              estado.atual.quantidade ? ` — qtd ${estado.atual.quantidade}` : ""
            }`
          : null;
      const historicoItens =
        estado.itens.length > 0
          ? `Itens confirmados: ${estado.itens
              .map((i) => `${i.quantidade}× ${i.nome}${i.tamanho ? ` (${i.tamanho})` : ""}`)
              .join(", ")}`
          : "Nenhum item confirmado ainda.";
      const historico = [
        historicoItens,
        estado.canal ? `Entrega/retirada: ${estado.canal === "entrega" ? "entrega" : "retirada"}` : "",
        estado.endereco ? `Endereço: ${estado.endereco.rua} — ${estado.endereco.bairro}` : "",
        estado.formaPagamento ? `Pagamento: ${estado.formaPagamento}` : "",
        estado.trocoPara ? `Troco para: ${brl(estado.trocoPara)}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const textoBonito = await embelezarResposta({
        empresaId: estado.empresaId,
        etapa: resposta.etapa,
        respostaBase: resposta.texto,
        estadoResumo: estado.itens.length > 0
          ? estado.itens.map((i) => `${i.quantidade}× ${i.nome}${i.tamanho ? ` (${i.tamanho})` : ""}`).join(", ")
          : "carrinho vazio",
        persona,
        clienteNome: estado.cliente?.nome ?? null,
        itemAtual,
        historico: historico || null,
      });
      if (textoBonito) resposta.texto = textoBonito;
    }
  }

  const statusMap: Record<string, string> = {
    encerrada: "encerrada",
    criado: "pedido_criado",
    humana: "humana",
    resumo: "aguardando_confirmacao",
  };
  const status = statusMap[resposta.etapa] ?? (conversa.status === "pedido_criado" ? "pedido_criado" : "em_andamento");
  const humana = resposta.etapa === "humana";
  const pedidoId = resposta.pedidoId ?? null;

  await prisma.mensagemWhatsApp.create({
    data: { conversaId: conversa.id, de: "sistema", texto: resposta.texto },
  });

  await prisma.conversaWhatsApp.update({
    where: { id: conversa.id },
    data: {
      status,
      etapa: resposta.etapa,
      estado: JSON.stringify(estado),
      ultimaPergunta: resposta.texto,
      ...(humana ? { atendimentoHumano: true, humanaDesde: new Date(), motivoTransferencia: motivoDaTransferencia(limpo) } : {}),
    },
  });

  // Vínculo conversa ↔ pedido (pode vir preenchido pelo passo `criado`).
  const resultado = {
    resposta: resposta.texto,
    conversaId: conversa.id,
    etapa: resposta.etapa,
    status,
    humana,
    pedidoId,
  };
  if (pedidoId) {
    await prisma.conversaWhatsApp.update({
      where: { id: conversa.id },
      data: { pedidoId },
    });
  }
  return resultado;
}

function motivoDaTransferencia(texto: string): string | null {
  if (/produto|n[aã]o encontrei|não achei|nao achei/.test(texto)) return "Não encontrou o produto";
  if (/entender|entendi|confus/.test(texto)) return "Não compreendeu o fluxo";
  return texto.slice(0, 80) || null;
}

/** Snapshot real (banco) do catálogo para a IA — ela só conhece isto. */
async function catalogoParaIa(empresaId: string): Promise<unknown> {
  const [produtos, adicionais, formas] = await Promise.all([
    listarProdutosDisponiveis(empresaId),
    listarAdicionais(empresaId),
    listarFormasPagamento(empresaId),
  ]);
  return {
    produtos: produtos.map((p) => ({
      id: p.id,
      nome: p.nome,
      precoBase: p.precoBase,
      categoria: p.categoria,
      destaque: p.destaque,
      disponivel: p.disponivel,
      tamanhos: p.tamanhos.map((t) => ({ nome: t.nome, valor: t.valor })),
      sabores: p.sabores.map((s) => ({ nome: s.nome, tipo: s.tipo })),
    })),
    adicionais: adicionais.map((a) => ({ nome: a.nome, preco: a.preco })),
    formasPagamento: formas.map((f) => f.label),
  };
}

async function normalizarComIa(
  etapa: string,
  texto: string,
  estado: Estado,
  persona: PersonaAtendente = PERSONA_PADRAO
): Promise<string> {
  const resumo = estado.itens.length > 0
    ? estado.itens.map((i) => `${i.quantidade}× ${i.nome}${i.tamanho ? ` (${i.tamanho})` : ""}`).join(", ")
    : "carrinho vazio";
  return interpretarMensagem({
    empresaId: estado.empresaId,
    etapa,
    mensagem: texto,
    catalogo: await catalogoParaIa(estado.empresaId),
    estadoResumo: resumo,
    persona,
  });
}

/* ------------------- Funções auxiliares para a API/UI --------------------- */

export async function carregarConversaDetalhe(empresaId: string, id: string) {
  return prisma.conversaWhatsApp.findFirst({
    where: { id, empresaId },
    include: {
      mensagens: { orderBy: { criadoEm: "asc" } },
      pedido: { select: { id: true, numero: true, total: true, canal: true, status: true } },
    },
  });
}

export async function listarConversas(empresaId: string) {
  return prisma.conversaWhatsApp.findMany({
    where: { empresaId },
    orderBy: { atualizadoEm: "desc" },
    take: 200,
    select: {
      id: true,
      telefone: true,
      nome: true,
      status: true,
      etapa: true,
      atendimentoHumano: true,
      origem: true,
      pedidoId: true,
      criadoEm: true,
      atualizadoEm: true,
      ultimaPergunta: true,
    },
  });
}
