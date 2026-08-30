import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ehUuidV4 } from "@/lib/idempotencia";

/**
 * Registro de pagamento (conta simples ou dividida) — REGRA DE NEGÓCIO
 * PURA, sem `NextRequest`/`NextResponse`, para poder ser exercitada por
 * testes de CONCORRÊNCIA reais contra um PostgreSQL de verdade
 * (`src/lib/pagamentos/__tests__/registrar-pagamento.test.ts`).
 *
 * ---------------------------------------------------------------------
 * ITEM 2 DA AUDITORIA — o que garante que NÃO há duplicidade, e o que
 * garante que uma cobrança LEGÍTIMA nunca é bloqueada:
 *
 * BLOQUEIA (corretamente):
 *   - retry/duplo clique da MESMA tentativa → mesma `idempotencyKey` →
 *     devolve o pagamento já criado, sem criar outro (garantido pelo
 *     índice único `(empresaId, idempotencyKey)`, não por tempo);
 *   - pagamento acima do saldo restante da conta → 400;
 *   - pagamento numa conta já quitada → 409.
 *
 * NUNCA BLOQUEIA (o defeito que foi removido):
 *   - pagamento de OUTRO pedido, OUTRA mesa, OUTRO cliente ou OUTRA
 *     empresa acontecendo no mesmo instante. Não existe mais nenhuma
 *     regra de "janela de N segundos": a única serialização é o
 *     `SELECT ... FOR UPDATE` sobre as linhas DESTA conta, então contas
 *     diferentes são processadas em paralelo;
 *   - duas parcelas legítimas da MESMA conta (conta dividida: duas
 *     pessoas pagando metade cada, mesmo valor e mesma forma). Cada
 *     tentativa tem sua PRÓPRIA `idempotencyKey`, então as duas são
 *     registradas — o `FOR UPDATE` só faz a segunda enxergar o saldo
 *     já atualizado pela primeira.
 * ---------------------------------------------------------------------
 */

const FORMAS = ["pix", "dinheiro", "credito", "debito"];

/** Tolerância de arredondamento (centavos) ao comparar saldo x total. */
const EPSILON = 0.01;

export interface UsuarioDoPagamento {
  id: string;
  nome: string;
  papel: string;
}

export interface EntradaPagamento {
  forma?: unknown;
  valor?: unknown;
  troco?: unknown;
  idempotencyKey?: unknown;
  /** Ids extras da mesma comanda (conta dividida entre pedidos). */
  pedidoIds?: unknown;
  /** NÚMERO operacional da mesa (não o id interno) — agrupa a conta. */
  mesaId?: unknown;
}

export interface PagamentoRegistrado {
  id: string;
  forma: string;
  valor: number;
  troco: number;
  status: string;
}

export type ResultadoPagamento =
  | {
      ok: true;
      status: 200 | 201;
      idempotente: boolean;
      pagamento: PagamentoRegistrado;
      pedido: { id: string; numero: number };
      quitado: boolean;
      saldoRestante: number;
      totalConta: number;
      /** Caixa aberto no momento (para o cupom/movimentação) — pode ser null. */
      temCaixaAberto: boolean;
    }
  | { ok: false; status: number; erro: string };

/** `true` quando o erro é a violação do único de idempotência de pagamento. */
function ehColisaoDeIdempotencia(erro: unknown): boolean {
  if (!(erro instanceof Prisma.PrismaClientKnownRequestError) || erro.code !== "P2002") return false;
  const alvo = (erro.meta as { target?: unknown } | undefined)?.target;
  if (typeof alvo === "string") return alvo.includes("idempotencyKey");
  if (Array.isArray(alvo)) return alvo.map(String).includes("idempotencyKey");
  return false;
}

/** Erro de negócio levantado dentro da transação (status próprio, nunca 500). */
class ErroPagamento extends Error {
  status: number;
  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.status = status;
  }
}

export async function registrarPagamento(
  empresaId: string,
  usuario: UsuarioDoPagamento,
  pedidoId: string,
  corpo: EntradaPagamento
): Promise<ResultadoPagamento> {
  const forma = String(corpo.forma ?? "");
  const valor = Number(corpo.valor);
  const troco = Math.max(0, Number(corpo.troco ?? 0));
  const idempotencyKey = corpo.idempotencyKey ? String(corpo.idempotencyKey).trim() : null;

  if (!FORMAS.includes(forma)) {
    return { ok: false, status: 400, erro: "Forma de pagamento inválida." };
  }
  if (!Number.isFinite(valor) || valor <= 0) {
    return { ok: false, status: 400, erro: "Valor de pagamento inválido." };
  }
  // A chave é OBRIGATÓRIA e precisa ser UUID v4 — uma por TENTATIVA.
  // Chave por tentativa (e não derivada de pedido+forma+valor) é o que
  // permite dois pagamentos legítimos idênticos coexistirem.
  if (!idempotencyKey || !ehUuidV4(idempotencyKey)) {
    return {
      ok: false,
      status: 400,
      erro: "idempotencyKey é obrigatória e deve ser um UUID v4 válido (uma por tentativa de pagamento).",
    };
  }

  const pedido = await prisma.pedido.findFirst({ where: { id: pedidoId, empresaId } });
  if (!pedido) {
    return { ok: false, status: 404, erro: "Pedido não encontrado." };
  }
  if (pedido.status === "cancelado") {
    return { ok: false, status: 409, erro: "Pedido cancelado não pode ser pago." };
  }

  const caixa = await prisma.caixa.findFirst({
    where: { empresaId, status: "aberto" },
    orderBy: { abertoEm: "desc" },
  });

  if (forma === "dinheiro" && !caixa) {
    return { ok: false, status: 409, erro: "Pagamento em dinheiro exige caixa aberto." };
  }

  const idsParaConcluir = new Set<string>([pedido.id]);
  if (Array.isArray(corpo.pedidoIds)) {
    // Ids extras (mesma comanda) são validados por empresaId no filtro
    // abaixo — um id de outra empresa simplesmente não aparece no resultado.
    for (const id of corpo.pedidoIds.map(String)) idsParaConcluir.add(id);
  }
  if (typeof corpo.mesaId === "number") {
    // `corpo.mesaId` é o NÚMERO OPERACIONAL da mesa (o mesmo `id` que
    // `GET /api/mesas` expõe, = `Mesa.numero`), enquanto `Pedido.mesaId`
    // é o ID INTERNO autoincrement de `Mesa`. São espaços de numeração
    // diferentes — filtrar `Pedido.mesaId` pelo número agrupava pedidos
    // de OUTRA mesa nesta conta (bug corrigido anteriormente; a tradução
    // abaixo é o que impede a regressão).
    const mesaDaConta = await prisma.mesa.findUnique({
      where: { empresaId_numero: { empresaId, numero: corpo.mesaId } },
      select: { id: true },
    });
    if (mesaDaConta) {
      const daMesa = await prisma.pedido.findMany({
        where: { empresaId, mesaId: mesaDaConta.id, status: { in: ["andamento", "conta"] } },
        select: { id: true },
      });
      for (const p of daMesa) idsParaConcluir.add(p.id);
    }
  }

  // PEDIDO 17 — delivery: pagar na hora não tira o pedido da produção;
  // ele só finaliza quando a entrega é concluída (ou cancelada).
  // O filtro por empresaId garante que ids de outra empresa (enviados
  // por engano ou adulterados) sejam ignorados silenciosamente aqui.
  const aFinalizar = await prisma.pedido.findMany({
    where: { id: { in: [...idsParaConcluir] }, empresaId },
    include: { entrega: true },
  });
  const idsFinalizar = new Set<string>();
  for (const p of aFinalizar) {
    const entregaEmAberto =
      p.canal === "delivery" && p.entrega && !["entregue", "cancelada"].includes(p.entrega.status);
    if (!entregaEmAberto) idsFinalizar.add(p.id);
  }

  const totalDaConta = aFinalizar.reduce((soma, p) => soma + p.total, 0);

  // Dinheiro recebido por um Garçom (fora do caixa físico) precisa ser
  // repassado depois; os demais casos já nascem reconciliados.
  const precisaRepasse = forma === "dinheiro" && usuario.papel === "GARCOM";

  async function totalConfirmadoDaConta(tx: Prisma.TransactionClient): Promise<number> {
    const pagos = await tx.pagamento.findMany({
      where: { pedidoId: { in: [...idsParaConcluir] }, empresaId, status: "confirmado" },
      select: { valor: true },
    });
    return pagos.reduce((soma, p) => soma + p.valor, 0);
  }

  /**
   * Devolve o pagamento já registrado com esta chave NESTA empresa.
   * O `empresaId` no filtro é obrigatório: sem ele, a chave de um tenant
   * devolveria o pagamento de outro (vazamento entre empresas — era o
   * comportamento do antigo `findUnique({ idempotencyKey })`, quando o
   * índice único ainda era global).
   */
  async function pagamentoPorChave(tx: Prisma.TransactionClient) {
    return tx.pagamento.findFirst({ where: { empresaId, idempotencyKey: idempotencyKey! } });
  }

  let resultado:
    | {
        pagamento: { id: string; forma: string; valor: number; troco: number; status: string };
        quitado: boolean;
        saldoRestante: number;
        idempotente: boolean;
      }
    | ErroPagamento;

  try {
    resultado = await prisma.$transaction(
      async (tx) => {
        // Trava as linhas do(s) pedido(s) DESTA conta antes de somar os
        // pagamentos. Sem isto, dois dispositivos pagando a MESMA conta
        // ao mesmo tempo leem os dois "saldo restante = R$100" (o
        // READ COMMITTED do Postgres não impede essa leitura obsoleta) e
        // confirmam R$60 cada, somando R$120 numa conta de R$100.
        //
        // O escopo da trava é EXATAMENTE esta conta: contas de outras
        // mesas/pedidos não são travadas e seguem em paralelo — é o que
        // diferencia esta proteção da janela global de 5 segundos que foi
        // removida. Ordenado por id para evitar deadlock quando duas
        // contas parcialmente sobrepostas são travadas em ordens
        // diferentes.
        const idsOrdenados = [...idsParaConcluir].sort();
        await tx.$queryRaw`SELECT id FROM "Pedido" WHERE id IN (${Prisma.join(idsOrdenados)}) ORDER BY id FOR UPDATE`;

        // Retry da MESMA tentativa (clique duplo, rede instável
        // reenviando): devolve o resultado já existente em vez de criar
        // outro registro.
        const jaExiste = await pagamentoPorChave(tx);
        if (jaExiste) {
          const confirmadoAntes = await totalConfirmadoDaConta(tx);
          return {
            pagamento: jaExiste,
            quitado: confirmadoAntes >= totalDaConta - EPSILON,
            saldoRestante: Math.max(0, totalDaConta - confirmadoAntes),
            idempotente: true,
          };
        }

        const totalJaConfirmado = await totalConfirmadoDaConta(tx);

        if (totalJaConfirmado >= totalDaConta - EPSILON) {
          throw new ErroPagamento("Esta conta já está quitada.", 409);
        }
        const saldoAntes = totalDaConta - totalJaConfirmado;
        if (valor > saldoAntes + EPSILON) {
          throw new ErroPagamento(`Valor maior que o saldo restante (${saldoAntes.toFixed(2)}).`, 400);
        }

        const pagamento = await tx.pagamento.create({
          data: {
            empresaId,
            pedidoId: pedido!.id,
            forma,
            valor,
            troco,
            status: "confirmado",
            recebidoPorId: usuario.id,
            recebidoPorNome: usuario.nome,
            repassadoAoCaixa: !precisaRepasse,
            idempotencyKey,
          },
        });

        const totalConfirmadoDepois = totalJaConfirmado + valor;
        const quitado = totalConfirmadoDepois >= totalDaConta - EPSILON;

        if (quitado) {
          await tx.pedido.updateMany({
            where: { id: { in: [...idsFinalizar] }, empresaId },
            // Pedido pago: sai do painel da cozinha (produção finalizada).
            data: { status: "concluido", producao: "finalizado", finalizadoEm: new Date() },
          });
        }

        if (caixa) {
          // Dinheiro recebido pelo GARÇOM (fora do caixa físico) só vira
          // movimentação de caixa quando for de fato REPASSADO (ver
          // `POST /api/caixa/repasses`) — criar a movimentação aqui
          // infla o "dinheiro esperado em caixa" com dinheiro que ainda
          // está no bolso do garçom. Pix/cartão/dinheiro-no-caixa
          // continuam registrando na hora.
          const dados: Prisma.MovimentacaoCaixaCreateManyInput[] = [];
          if (!precisaRepasse) {
            dados.push({
              empresaId,
              caixaId: caixa.id,
              tipo: "venda",
              valor,
              metodo: forma,
              descricao: `Pedido #${pedido!.numero} — pagamento`,
            });
          }
          if (troco > 0) {
            dados.push({
              empresaId,
              caixaId: caixa.id,
              tipo: "troco",
              valor: troco,
              metodo: forma,
              descricao: `Troco — Pedido #${pedido!.numero}`,
            });
          }
          if (dados.length > 0) {
            await tx.movimentacaoCaixa.createMany({ data: dados });
          }
        }

        return {
          pagamento,
          quitado,
          saldoRestante: Math.max(0, totalDaConta - totalConfirmadoDepois),
          idempotente: false,
        };
      },
      { timeout: 30_000 }
    );
  } catch (e) {
    if (e instanceof ErroPagamento) {
      resultado = e;
    } else if (ehColisaoDeIdempotencia(e)) {
      // Duas requisições com a MESMA chave que não compartilharam a trava
      // da conta (contas diferentes). O índice único do banco decide, e
      // quem perdeu apenas relê o vencedor.
      const vencedor = await prisma.pagamento.findFirst({ where: { empresaId, idempotencyKey } });
      if (!vencedor) {
        return {
          ok: false,
          status: 409,
          erro: "Outra requisição com esta idempotencyKey está em andamento. Tente novamente.",
        };
      }
      const confirmado = await prisma.pagamento
        .findMany({
          where: { pedidoId: { in: [...idsParaConcluir] }, empresaId, status: "confirmado" },
          select: { valor: true },
        })
        .then((ps) => ps.reduce((soma, p) => soma + p.valor, 0));
      resultado = {
        pagamento: vencedor,
        quitado: confirmado >= totalDaConta - EPSILON,
        saldoRestante: Math.max(0, totalDaConta - confirmado),
        idempotente: true,
      };
    } else {
      throw e;
    }
  }

  if (resultado instanceof ErroPagamento) {
    return { ok: false, status: resultado.status, erro: resultado.message };
  }

  return {
    ok: true,
    status: resultado.idempotente ? 200 : 201,
    idempotente: resultado.idempotente,
    pagamento: {
      id: resultado.pagamento.id,
      forma: resultado.pagamento.forma,
      valor: resultado.pagamento.valor,
      troco: resultado.pagamento.troco,
      status: resultado.pagamento.status,
    },
    pedido: { id: pedido.id, numero: pedido.numero },
    quitado: resultado.quitado,
    saldoRestante: resultado.saldoRestante,
    totalConta: totalDaConta,
    temCaixaAberto: Boolean(caixa),
  };
}
