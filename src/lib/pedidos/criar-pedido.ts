import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { proximoNumeroPedido } from "@/lib/contador";
import { calcularTaxaEntrega, lerConfigTaxaEntrega, previsaoEntregaPadrao } from "@/lib/delivery";
import { calcularPrecoItem, calcularTotalItens } from "@/lib/precificacao";
import { calcularPrecoItem as calcularPrecoPizza, validarMisturaSabores } from "@/lib/preco-pizza";
import { lerConfigPizza } from "@/lib/impressao";
import { ehUuidV4 } from "@/lib/idempotencia";

/**
 * Criação de pedido — REGRA DE NEGÓCIO PURA (sem `NextRequest`/
 * `NextResponse`), para ser exercitada por teste automatizado contra um
 * PostgreSQL real.
 *
 * A rota (`src/app/api/pedidos/route.ts`) ficou responsável só por
 * autorizar, chamar esta função e traduzir o resultado em HTTP — assim o
 * teste de concorrência do item 1 ("duas requisições simultâneas com a
 * mesma chave devem gerar somente 1 pedido") roda o MESMO código que
 * produção, sem mock de banco, sem servidor HTTP no meio.
 *
 * IDEMPOTÊNCIA (item 1 da auditoria) — o que estava errado antes:
 *
 *   1. A chave era gravada em `Pedido.observacao`, que LOGO EM SEGUIDA
 *      era sobrescrito pela observação real do pedido (`observacao:
 *      corpo.observacao`). Resultado: a chave nunca era persistida e
 *      NENHUM retry era detectado.
 *   2. A busca era `findFirst` sem constraint no banco — duas
 *      requisições simultâneas liam "não existe" ao mesmo tempo e
 *      criavam DOIS pedidos.
 *   3. A chave não era validada (qualquer string servia) e o caminho de
 *      resposta usava `any` sobre um objeto sem os `include` necessários
 *      (13 erros de TypeScript).
 *
 * Como ficou:
 *
 *   1. Coluna própria `Pedido.idempotencyKey` com índice ÚNICO
 *      `(empresaId, idempotencyKey)` — a garantia é do banco, não do
 *      código.
 *   2. Fast path: se a chave já existe, devolve o pedido original.
 *   3. Corrida: quem perde recebe P2002 e RELÊ o pedido vencedor. O
 *      Postgres bloqueia o segundo INSERT até o primeiro commitar, então
 *      quando o P2002 chega o vencedor já está visível.
 *   4. Chave inválida (não-UUID v4) é rejeitada com 400 — nunca ignorada
 *      em silêncio, o que devolveria a duplicação sem ninguém perceber.
 */

const CANAIS = ["balcao", "salao", "retirada", "delivery"];
const FORMAS_ENTREGA = ["pix", "dinheiro", "credito", "debito"];
/** Origens aceitas em `Pedido.origem` — lista branca, nunca texto livre do chamador. */
const ORIGENS = ["pdv", "whatsapp", "simulacao", "garcom", "entregador"];

/** Nome do índice único que materializa a idempotência de pedido. */
export const INDICE_IDEMPOTENCIA_PEDIDO = "Pedido_empresaId_idempotencyKey_key";

/** Erro de validação levantado DENTRO da transação (vira 400, nunca 500). */
class ErroPedido extends Error {}

export interface PedidoCriado {
  id: string;
  numero: number;
  canal: string;
  producao: string;
  total: number;
  taxaEntrega: number;
  entregaId: string | null;
  pagamentoId: string | null;
  clienteId: string | null;
}

export type ResultadoCriarPedido =
  | { ok: true; status: 200 | 201; idempotente: boolean; pedido: PedidoCriado }
  | { ok: false; status: number; erro: string };

export interface UsuarioDoPedido {
  id: string;
  nome: string;
  papel: string;
}

/**
 * Busca o pedido já criado com esta chave de idempotência, na EMPRESA
 * informada, e o devolve no MESMO formato da resposta de criação — um
 * retry precisa receber exatamente o que a tentativa original recebeu.
 */
async function pedidoPorChaveIdempotencia(
  empresaId: string,
  idempotencyKey: string
): Promise<PedidoCriado | null> {
  const existente = await prisma.pedido.findFirst({
    // `empresaId` no filtro é obrigatório: sem ele, a chave de um tenant
    // devolveria o pedido de outro (vazamento entre empresas).
    where: { empresaId, idempotencyKey },
    include: { entrega: { select: { id: true } }, pagamentos: { select: { id: true }, orderBy: { criadoEm: "asc" } } },
  });
  if (!existente) return null;
  return {
    id: existente.id,
    numero: existente.numero,
    canal: existente.canal,
    producao: existente.producao,
    total: existente.total,
    taxaEntrega: existente.taxaEntrega,
    entregaId: existente.entrega?.id ?? null,
    pagamentoId: existente.pagamentos[0]?.id ?? null,
    clienteId: existente.clienteId,
  };
}

/** `true` quando o erro é a violação do índice único de idempotência de pedido. */
function ehColisaoDeIdempotencia(erro: unknown): boolean {
  if (!(erro instanceof Prisma.PrismaClientKnownRequestError) || erro.code !== "P2002") return false;
  // `meta.target` vem como o nome do índice (string) ou a lista de
  // campos (array), dependendo do conector/versão — os dois são aceitos.
  const alvo = (erro.meta as { target?: unknown } | undefined)?.target;
  if (typeof alvo === "string") return alvo.includes("idempotencyKey");
  if (Array.isArray(alvo)) return alvo.map(String).includes("idempotencyKey");
  return false;
}

export async function criarPedido(
  empresaId: string,
  usuario: UsuarioDoPedido,
  corpo: Record<string, unknown>
): Promise<ResultadoCriarPedido> {
  // ---------------------------------------------------------------
  // Idempotência — validação da chave e fast path
  // ---------------------------------------------------------------
  const chaveBruta = corpo.idempotencyKey;
  let idempotencyKey: string | null = null;
  if (chaveBruta !== undefined && chaveBruta !== null && String(chaveBruta).trim() !== "") {
    const chave = String(chaveBruta).trim();
    if (!ehUuidV4(chave)) {
      return {
        ok: false,
        status: 400,
        erro: "idempotencyKey inválida: precisa ser um UUID v4 (uma por tentativa de criação de pedido).",
      };
    }
    idempotencyKey = chave;
    const jaCriado = await pedidoPorChaveIdempotencia(empresaId, idempotencyKey);
    if (jaCriado) return { ok: true, status: 200, idempotente: true, pedido: jaCriado };
  }

  const configPizza = await lerConfigPizza(empresaId);

  // Garçom só registra pedidos de mesa (validado no servidor).
  let canal = String(corpo.canal ?? "balcao");
  if (usuario.papel === "GARCOM") {
    canal = "salao";
  }
  if (!CANAIS.includes(canal)) {
    return { ok: false, status: 400, erro: "Canal de pedido inválido." };
  }
  const itensBrutos: unknown[] = Array.isArray(corpo.itens) ? corpo.itens : [];
  if (itensBrutos.length === 0 || itensBrutos.length > 100) {
    return { ok: false, status: 400, erro: "Pedido deve ter de 1 a 100 itens." };
  }

  interface ItemPedidoEntrada {
    produtoId: string;
    nome: string;
    precoUnit: number;
    quantidade: number;
    tamanho: string | null;
    sabores: string[] | null;
    saboresEstruturados?: { saborId: string; nome: string; tipo: string }[] | null;
    adicionais: { nome: string; preco: number; quantidade?: number }[];
    adicionaisEstruturados?: { adicionalId: string | null; nome: string; preco: number; quantidade: number }[];
    observacao: string | null;
  }

  const itens: ItemPedidoEntrada[] = itensBrutos.map((i) => {
    const bruto = i as {
      produtoId?: string;
      nome?: string;
      precoUnit?: number;
      quantidade?: number;
      tamanho?: string;
      sabores?: unknown;
      adicionais?: unknown;
      observacao?: string;
    };
    const sabores = Array.isArray(bruto.sabores) ? bruto.sabores.map(String) : [];
    const adicionais = Array.isArray(bruto.adicionais)
      ? bruto.adicionais
          .map((a) => {
            const b = a as { nome?: string; preco?: number };
            return { nome: String(b.nome ?? ""), preco: Number(b.preco ?? 0) };
          })
          .filter((a) => a.nome)
      : [];
    return {
      produtoId: String(bruto.produtoId ?? ""),
      nome: String(bruto.nome ?? "Item"),
      precoUnit: 0, // recalculado abaixo — o preço enviado é IGNORADO
      quantidade: Math.max(1, Number(bruto.quantidade ?? 1)),
      tamanho: bruto.tamanho ? String(bruto.tamanho) : null,
      sabores: sabores.length > 0 ? sabores : null,
      adicionais,
      observacao: bruto.observacao ? String(bruto.observacao) : null,
    };
  });

  // SEGURANÇA (PEDIDO 20): preços NUNCA vêm do cliente — são recalculados
  // pelo cadastro (produto + tamanho + adicionais) no servidor. Um item com
  // produtoId inexistente/vazio, OU pertencente a OUTRA EMPRESA, é
  // rejeitado (400), nunca cobrado barato nem misturado entre tenants.
  const produtoIds = [...new Set(itens.map((i) => i.produtoId).filter((id) => id !== ""))];
  const nomesAdicionais = [...new Set(itens.flatMap((i) => i.adicionais.map((a) => a.nome)))];
  const [produtosDb, adicionaisDb, pizzaCandidatos] = await Promise.all([
    prisma.produto.findMany({
      where: { id: { in: produtoIds }, empresaId },
      include: { precos: { include: { tamanho: true } }, sabores: { include: { sabor: true } } },
    }),
    prisma.adicional.findMany({ where: { empresaId, nome: { in: nomesAdicionais } } }),
    // Todos os produtos que são pizzas (têm sabores), para resolver o preço
    // de CADA sabor escolhido — cada sabor é um Produto próprio.
    prisma.produto.findMany({
      where: { empresaId, sabores: { some: {} } },
      include: {
        precos: { include: { tamanho: true } },
        sabores: { include: { sabor: { select: { id: true, nome: true, tipo: true } } } },
      },
    }),
  ]);
  const produtoPorId = new Map(produtosDb.map((p) => [p.id, p]));
  const precoAdicionalPorNome = new Map(adicionaisDb.map((a) => [a.nome, a.preco]));
  const adicionalPorNome = new Map(adicionaisDb.map((a) => [a.nome, a]));
  // sabor (nome lowercased) -> { saborId, tipo, precos por tamanho }
  const precoPorSaborNome = new Map<string, { saborId: string; tipo: string; precos: Map<string, number> }>();
  for (const p of pizzaCandidatos) {
    const mapT = new Map<string, number>();
    for (const pt of p.precos) mapT.set(pt.tamanho.nome, pt.valor);
    for (const ps of p.sabores) {
      precoPorSaborNome.set(ps.sabor.nome.toLowerCase(), {
        saborId: ps.sabor.id,
        tipo: ps.sabor.tipo,
        precos: mapT,
      });
    }
  }

  for (const item of itens) {
    const produto = item.produtoId ? produtoPorId.get(item.produtoId) : undefined;
    if (!produto) {
      return {
        ok: false,
        status: 400,
        erro: `Produto inexistente no cadastro: "${item.nome}". Atualize o cardápio.`,
      };
    }
    // Preço base: PrecoTamanho do tamanho informado, senão preço do produto.
    let base = produto.preco;
    const tamanhoNome = item.tamanho ? String(item.tamanho) : null;
    let maxSabores = 1;
    if (tamanhoNome) {
      const pt = produto.precos.find((p) => p.tamanho.nome === tamanhoNome);
      if (!pt) {
        return {
          ok: false,
          status: 400,
          erro: `Tamanho "${tamanhoNome}" não existe para "${item.nome}". Atualize o cardápio.`,
        };
      }
      base = pt.valor;
      maxSabores = pt.tamanho.maxSabores ?? 1;
    }
    // Adicionais: preço do cadastro (o enviado pelo cliente é ignorado).
    const adicionaisFinal = item.adicionais.map((a) => ({
      adicionalId: adicionalPorNome.get(a.nome)?.id ?? null,
      nome: a.nome,
      preco: precoAdicionalPorNome.get(a.nome) ?? 0,
      quantidade: Math.max(1, Math.floor(Number(a.quantidade ?? 1)) || 1),
    }));

    if (item.sabores && item.sabores.length > 0) {
      // Pizza: regra única de preço (MAIOR entre sabores + acréscimo por
      // sabor premium adicional). Preço gravado é SEMPRE o recalculado aqui.
      const saboresParaCalc = item.sabores.map((nome) => {
        const info = precoPorSaborNome.get(String(nome).toLowerCase());
        const precoNoTamanho = info && tamanhoNome ? (info.precos.get(tamanhoNome) ?? 0) : base;
        return { saborId: info?.saborId ?? "", tipo: info?.tipo ?? "tradicional", precoNoTamanho };
      });
      const qtdPremium = saboresParaCalc.filter((s) => s.tipo !== "tradicional").length;

      // Regra não configurada + 2+ sabores premium => recusar (nunca chutar).
      if (!configPizza && qtdPremium >= 2) {
        return { ok: false, status: 409, erro: "regra de preço de pizza não configurada para esta empresa" };
      }
      const acrescimo = configPizza?.acrescimoPorSaborPremium ?? 0;
      const permitirMistura = configPizza?.permitirMisturarDoceSalgada ?? true;
      const erroMistura = validarMisturaSabores(saboresParaCalc, permitirMistura);
      if (erroMistura) {
        return { ok: false, status: 409, erro: erroMistura };
      }

      const resultadoPreco = calcularPrecoPizza({
        sabores: saboresParaCalc,
        adicionais: adicionaisFinal,
        quantidade: item.quantidade,
        acrescimoPorSaborPremium: acrescimo,
        maxSabores,
      });
      if ("erro" in resultadoPreco) {
        return { ok: false, status: 400, erro: resultadoPreco.erro };
      }
      item.precoUnit = resultadoPreco.precoUnitario;
      item.saboresEstruturados = saboresParaCalc.map((s, i) => ({
        saborId: s.saborId,
        nome: String(item.sabores![i]),
        tipo: s.tipo,
      }));
    } else {
      item.precoUnit = calcularPrecoItem({
        precoBaseProduto: produto.preco,
        tamanho: tamanhoNome ? { nome: tamanhoNome, valor: base } : null,
        adicionais: adicionaisFinal,
      });
    }
    item.adicionais = adicionaisFinal;
    item.adicionaisEstruturados = adicionaisFinal;
  }

  const totalItens = calcularTotalItens(itens);
  const itensParaCriar = itens.map((i) => ({
    produtoId: i.produtoId,
    nome: i.nome,
    precoUnit: i.precoUnit,
    quantidade: i.quantidade,
    tamanho: i.tamanho,
    sabores:
      i.saboresEstruturados && i.saboresEstruturados.length > 0
        ? JSON.stringify(i.saboresEstruturados)
        : null,
    adicionais:
      i.adicionaisEstruturados && i.adicionaisEstruturados.length > 0
        ? JSON.stringify(i.adicionaisEstruturados)
        : null,
    observacao: i.observacao,
  }));

  // Delivery (PEDIDO 17): taxa calculada no servidor pelas regras
  // configuradas (bairro + subtotal); cliente persistido/vinculado.
  const entregaBruto =
    corpo.entrega && typeof corpo.entrega === "object" ? (corpo.entrega as Record<string, unknown>) : {};
  const bairroEntrega = entregaBruto.bairro ? String(entregaBruto.bairro).trim() : null;
  const configTaxa = await lerConfigTaxaEntrega(empresaId);
  const { taxa: taxaEntrega } = calcularTaxaEntrega(configTaxa, bairroEntrega, totalItens);
  const formaPagamentoEntrega = corpo.formaPagamentoEntrega ? String(corpo.formaPagamentoEntrega) : null;
  if (formaPagamentoEntrega && !FORMAS_ENTREGA.includes(formaPagamentoEntrega)) {
    return { ok: false, status: 400, erro: "Forma de pagamento da entrega inválida." };
  }
  const pagarNaEntrega = corpo.pagarNaEntrega === true;
  const trocoPara = Math.max(0, Number(corpo.trocoPara ?? 0));
  const total = Math.round((totalItens + (canal === "delivery" ? taxaEntrega : 0)) * 100) / 100;

  let resultado: {
    pedido: { id: string; numero: number; canal: string; producao: string; total: number };
    entregaId: string | null;
    pagamentoId: string | null;
    clienteId: string | null;
  };
  try {
    resultado = await prisma
      .$transaction(
        async (tx) => {
          // A API de mesas expõe o número como identidade pública → traduzir para o id real.
          let mesaId: number | null = null;
          if (typeof corpo.mesaId === "number") {
            const mesa = await tx.mesa.findUnique({
              where: { empresaId_numero: { empresaId, numero: corpo.mesaId } },
            });
            if (!mesa) throw new ErroPedido("Mesa inexistente.");
            mesaId = mesa.id;
          }

          // Cliente: vínculo por id (validado da mesma empresa), ou cadastro
          // automático (upsert por telefone, sempre escopado à empresa).
          let clienteId: string | null = null;
          if (corpo.clienteId) {
            const clienteInformado = await tx.cliente.findFirst({
              where: { id: String(corpo.clienteId), empresaId },
            });
            if (!clienteInformado) throw new ErroPedido("Cliente inexistente.");
            clienteId = clienteInformado.id;
          }
          const clienteBruto =
            corpo.cliente && typeof corpo.cliente === "object" ? (corpo.cliente as Record<string, unknown>) : {};
          const telefoneCliente = String(clienteBruto.telefone ?? corpo.telefone ?? "").trim() || null;
          const nomeCliente = String(clienteBruto.nome ?? corpo.clienteNome ?? "").trim() || null;
          if (!clienteId && telefoneCliente && nomeCliente) {
            const existente = await tx.cliente.findFirst({ where: { empresaId, telefone: telefoneCliente } });
            if (existente) {
              clienteId = existente.id;
              if (entregaBruto.endereco && entregaBruto.bairro) {
                await tx.endereco.create({
                  data: {
                    clienteId,
                    rua: String(entregaBruto.endereco).trim(),
                    bairro: String(entregaBruto.bairro).trim(),
                    cidade: entregaBruto.cidade ? String(entregaBruto.cidade).trim() : null,
                    cep: entregaBruto.cep ? String(entregaBruto.cep).trim() : null,
                    complemento: entregaBruto.complemento ? String(entregaBruto.complemento).trim() : null,
                    referencia: entregaBruto.referencia ? String(entregaBruto.referencia).trim() : null,
                  },
                });
              }
            } else {
              const novo = await tx.cliente.create({
                data: {
                  empresaId,
                  nome: nomeCliente,
                  telefone: telefoneCliente,
                  ...(entregaBruto.endereco && entregaBruto.bairro
                    ? {
                        enderecos: {
                          create: {
                            rua: String(entregaBruto.endereco).trim(),
                            bairro: String(entregaBruto.bairro).trim(),
                            cidade: entregaBruto.cidade ? String(entregaBruto.cidade).trim() : null,
                            cep: entregaBruto.cep ? String(entregaBruto.cep).trim() : null,
                            complemento: entregaBruto.complemento
                              ? String(entregaBruto.complemento).trim()
                              : null,
                            referencia: entregaBruto.referencia ? String(entregaBruto.referencia).trim() : null,
                          },
                        },
                      }
                    : {}),
                },
              });
              clienteId = novo.id;
            }
          }

          const previsao = corpo.previsao
            ? String(corpo.previsao).trim()
            : canal === "delivery"
              ? previsaoEntregaPadrao()
              : null;

          const pedido = await tx.pedido.create({
            data: {
              empresaId,
              numero: await proximoNumeroPedido(tx, empresaId),
              canal,
              status: "andamento",
              producao: "recebido",
              recebidoEm: new Date(),
              clienteNome: nomeCliente,
              clienteTelefone: telefoneCliente,
              clienteId,
              mesaId,
              // A observação do pedido é a observação DE VERDADE — a chave
              // de idempotência tem coluna própria (era exatamente aqui
              // que a implementação antiga a perdia).
              observacao: corpo.observacao ? String(corpo.observacao) : null,
              // Canal de ORIGEM do pedido (whatsapp | pdv | ...). Só aceita
              // valores da lista branca: é gravado sem passar por validação
              // de negócio e alimenta relatório/dashboard.
              ...(ORIGENS.includes(String(corpo.origem ?? "")) ? { origem: String(corpo.origem) } : {}),
              idempotencyKey,
              previsao,
              taxaEntrega: canal === "delivery" ? taxaEntrega : 0,
              trocoPara: trocoPara > 0 ? trocoPara : 0,
              formaPagamentoEntrega,
              total,
              itens: { create: itensParaCriar },
            },
          });

          let entregaId: string | null = null;
          if (canal === "delivery" && entregaBruto.endereco && entregaBruto.bairro) {
            const entrega = await tx.entrega.create({
              data: {
                empresaId,
                pedidoId: pedido.id,
                endereco: String(entregaBruto.endereco).trim(),
                bairro: String(entregaBruto.bairro).trim(),
                complemento: entregaBruto.complemento ? String(entregaBruto.complemento).trim() : null,
                referencia: entregaBruto.referencia ? String(entregaBruto.referencia).trim() : null,
                telefone: telefoneCliente,
                status: "aguardando",
                previsao: previsao ?? previsaoEntregaPadrao(),
              },
            });
            entregaId = entrega.id;
          }

          // Pagar na entrega: cria o pagamento pendente (o financeiro fecha na
          // conclusão da entrega, quando a venda entra no caixa).
          let pagamentoId: string | null = null;
          if (pagarNaEntrega && formaPagamentoEntrega) {
            const pagamento = await tx.pagamento.create({
              data: {
                empresaId,
                pedidoId: pedido.id,
                forma: formaPagamentoEntrega,
                valor: total,
                status: "pendente",
              },
            });
            pagamentoId = pagamento.id;
          }

          return { pedido, entregaId, pagamentoId, clienteId };
        },
        { timeout: 30_000 }
      )
      .catch((e: unknown) => {
        // FK inválida (mesa/cliente/produto inexistentes) → 400, não 500.
        if (e && typeof e === "object" && (e as { code?: string }).code === "P2003") {
          throw new ErroPedido("Referência inválida: mesa, cliente ou produto inexistente.");
        }
        throw e;
      });
  } catch (e) {
    if (e instanceof ErroPedido) {
      return { ok: false, status: 400, erro: e.message };
    }
    // CORRIDA PERDIDA: outra requisição com a MESMA chave commitou
    // primeiro. O índice único do banco é o que garante que só um pedido
    // exista — aqui só relemos o vencedor e devolvemos a MESMA resposta
    // que ele recebeu. Não há "criar de novo": a transação inteira desta
    // requisição já foi revertida pelo Postgres.
    if (idempotencyKey && ehColisaoDeIdempotencia(e)) {
      const vencedor = await pedidoPorChaveIdempotencia(empresaId, idempotencyKey);
      if (vencedor) return { ok: true, status: 200, idempotente: true, pedido: vencedor };
      // Chegar aqui significaria P2002 sem linha correspondente — não
      // acontece no Postgres (o INSERT perdedor espera o commit do
      // vencedor), mas se acontecesse seria um 409 honesto, nunca um
      // pedido duplicado silencioso.
      return {
        ok: false,
        status: 409,
        erro: "Outra requisição com esta idempotencyKey está em andamento. Tente novamente.",
      };
    }
    throw e;
  }

  return {
    ok: true,
    status: 201,
    idempotente: false,
    pedido: {
      id: resultado.pedido.id,
      numero: resultado.pedido.numero,
      canal: resultado.pedido.canal,
      producao: resultado.pedido.producao,
      total: resultado.pedido.total,
      taxaEntrega,
      entregaId: resultado.entregaId,
      pagamentoId: resultado.pagamentoId,
      clienteId: resultado.clienteId,
    },
  };
}
