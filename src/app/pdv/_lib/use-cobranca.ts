"use client";

import * as React from "react";
import { toast } from "sonner";
import type { ItemPedido } from "@/lib/catalogo";
import { api } from "@/lib/api-cliente";
import { novaChaveIdempotencia } from "@/lib/idempotencia";
import { useCaixa } from "@/app/pdv/_lib/caixa-context";
import type { PagamentoConfirmado } from "@/app/pdv/_components/pagamento-dialog";
import type { FormaPagamento } from "@/app/pdv/_lib/mock-data";
import type { StatusDocumentoFiscal, RetornoEmissao } from "@/lib/fiscal/tipos";

/**
 * Cobrança em andamento: origem (contexto), itens e total a pagar.
 */
export interface Cobranca {
  contexto: string;
  clienteNome?: string;
  itens: ItemPedido[];
  total: number;
  /** Canal persistido no pedido: balcao | salao | retirada | delivery. */
  canal?: string;
  /** Quando a cobrança refere-se a um pedido já existente (salão). */
  pedidoId?: string;
  /** Marca os demais pedidos abertos da mesa como concluídos. */
  mesaId?: number;
  /** Dados do delivery (PEDIDO 17): endereço completo e previsão. */
  entrega?: {
    endereco: string;
    bairro: string;
    complemento?: string;
    referencia?: string;
    cidade?: string;
    cep?: string;
    previsao?: string;
  };
  /** Troco solicitado pelo cliente ("troco para"). */
  trocoPara?: number;
  /** Forma de pagamento da entrega (quando o cliente paga na entrega). */
  formaPagamentoEntrega?: string;
  /** Observações do pedido. */
  observacao?: string;
}

/** Resumo fiscal retornado pelo backend após o pagamento (PEDIDO 19). */
export interface ResumoFiscalVenda {
  documentoId: string;
  status: StatusDocumentoFiscal;
  erro: string | null;
  retorno: RetornoEmissao | null;
}

export interface EmpresaCupom {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  rua: string;
  cidade: string;
  uf: string;
  telefone: string;
}

/** Cupom pós-venda: dados reais da venda + status fiscal real. */
export interface CupomVenda {
  contexto: string;
  clienteNome?: string;
  itens: ItemPedido[];
  total: number;
  forma: FormaPagamento;
  valorRecebido?: number;
  troco?: number;
  fiscal: ResumoFiscalVenda | null;
  empresa: EmpresaCupom | null;
}

interface RespostaPagamento {
  ok: boolean;
  quitado?: boolean;
  saldoRestante?: number;
  totalConta?: number;
  fiscal?: ResumoFiscalVenda | null;
  empresa?: EmpresaCupom | null;
}

interface CobrancaController {
  pagamentoAberto: boolean;
  setPagamentoAberto: (open: boolean) => void;
  cobranca: Cobranca | null;
  /** Quanto ainda falta pagar desta cobrança — cai a cada pagamento parcial confirmado. */
  saldoRestante: number;
  caixaAberto: boolean;
  cupom: CupomVenda | null;
  /** Abre o pagamento; `aoConfirmar` roda depois que a conta é QUITADA
   * (não a cada pagamento parcial), recebendo o pedido criado no banco
   * (quando a venda criou um pedido novo). */
  abrirPagamento: (
    cobranca: Cobranca,
    aoConfirmar: (pedidoCriado?: { id: string; numero: number }) => void
  ) => void;
  confirmarPagamento: (pagamento: PagamentoConfirmado) => void;
  concluir: () => void;
}

/**
 * Orquestra o fluxo comum de cobrança do PDV: PagamentoDialog → persistir
 * pedido e pagamento no banco (POST /api/pedidos + /api/pedidos/:id/pagamento)
 * → registrar venda no caixa local → cupom com o status fiscal REAL
 * (NFC-e do backend — PEDIDO 19; nunca simula autorização).
 *
 * Conta dividida (PEDIDO 11): cada chamada de `confirmarPagamento` pode
 * cobrir só PARTE do saldo — o backend informa `quitado`/`saldoRestante`
 * reais (soma de todos os pagamentos já confirmados daquele pedido/mesa).
 * Enquanto não quitar, o diálogo continua aberto para o próximo pagamento
 * (outra pessoa, outra forma) — só ao quitar é que o cupom aparece e
 * `aoConfirmar` roda.
 */
export function useCobranca(): CobrancaController {
  const { aberto: caixaAberto, registrarVenda } = useCaixa();
  const [pagamentoAberto, setPagamentoAberto] = React.useState(false);
  const [cobranca, setCobranca] = React.useState<Cobranca | null>(null);
  const [saldoRestante, setSaldoRestante] = React.useState(0);
  const [cupom, setCupom] = React.useState<CupomVenda | null>(null);
  const aoConfirmarRef = React.useRef<((pedidoCriado?: { id: string; numero: number }) => void) | null>(null);
  const persistindo = React.useRef(false);
  const totalPagoAcumulado = React.useRef(0);
  // PEDIDO: idempotencyKey real. `persistindo.current` já impede clique
  // duplo DENTRO desta mesma execução, mas não cobre o caso de RETRY
  // depois de um erro de rede (a requisição pode ter chegado ao
  // servidor e sido processada, só a resposta que se perdeu).
  //
  // CORREÇÃO (idempotência por TENTATIVA): a chave é um UUID GERADO POR
  // TENTATIVA de pagamento — NUNCA derivado de pedido+forma+valor+troco.
  // Motivo: dois pagamentos legítimos idênticos (ex.: pedido de R$100
  // pago em R$50 em dinheiro por pessoa 1 e R$50 em dinheiro por pessoa
  // 2) são registros DIFERENTES e ambos precisam existir. Uma chave
  // estável por combinação faria o segundo pagamento colidir com o
  // primeiro (o backend devolveria o pagamento já existente como
  // "idempotente", e os R$50 da pessoa 2 sumiriam).
  //
  // Regra: a MESMA tentativa reutiliza o MESMO UUID somente em
  // retry/reenvio (erro de rede — o backend devolve o pagamento
  // existente se a primeira chegou, ou cria se nunca chegou). Ao
  // SUCESSO, o UUID é liberado — a próxima chamada (outra pessoa,
  // outra parcela, mesmo valor/forma) recebe um UUID NOVO.
  const idempotencyKeyTentativa = React.useRef<string | null>(null);

  // CHAVE DE IDEMPOTÊNCIA DO PEDIDO (item 1 da auditoria — "o
  // frontend/PDV também precisa realmente enviar a chave"). É SEPARADA
  // da chave de pagamento acima: uma cobrança gera UM pedido e pode
  // gerar VÁRIOS pagamentos (conta dividida), então as duas chaves têm
  // ciclos de vida diferentes.
  //
  // Ciclo: nasce em `abrirPagamento` (uma cobrança = um pedido) e só é
  // liberada quando o pedido é criado com sucesso. Se a criação falhar
  // por rede, a retentativa manda a MESMA chave — se a primeira chegou
  // ao servidor, ele devolve o pedido já criado em vez de criar outro.
  const idempotencyKeyPedido = React.useRef<string | null>(null);

  function novaIdempotencyKey(): string {
    if (idempotencyKeyTentativa.current) return idempotencyKeyTentativa.current;
    const nova = novaChaveIdempotencia();
    idempotencyKeyTentativa.current = nova;
    return nova;
  }

  /** Chave do PEDIDO desta cobrança — estável enquanto o pedido não for criado. */
  function chaveDoPedido(): string {
    if (!idempotencyKeyPedido.current) idempotencyKeyPedido.current = novaChaveIdempotencia();
    return idempotencyKeyPedido.current;
  }

  const abrirPagamento = React.useCallback(
    (novaCobranca: Cobranca, aoConfirmar: (pedidoCriado?: { id: string; numero: number }) => void) => {
      aoConfirmarRef.current = aoConfirmar;
      totalPagoAcumulado.current = 0;
      // Nova cobrança = nova tentativa: libera qualquer UUID de retry
      // pendente da cobrança anterior (nunca reusar chave entre pedidos).
      idempotencyKeyTentativa.current = null;
      idempotencyKeyPedido.current = null;
      setCobranca(novaCobranca);
      setSaldoRestante(novaCobranca.total);
      setPagamentoAberto(true);
    },
    []
  );

  async function confirmarPagamento(pagamento: PagamentoConfirmado) {
    if (!cobranca || persistindo.current) return;
    persistindo.current = true;
    let pedidoCriado: { id: string; numero: number } | undefined;
    try {
      const valor = pagamento.valorPago;
      let pedidoId = cobranca.pedidoId;

      if (!pedidoId) {
        // Venda nova (balcão/viagem/delivery ou retirada): persiste o pedido
        // uma única vez — pagamentos seguintes (conta dividida) reusam este id.
        const criado = await api<{ ok: boolean; pedido: { id: string; numero: number } }>("/api/pedidos", {
          method: "POST",
          body: JSON.stringify({
            idempotencyKey: chaveDoPedido(),
            canal: cobranca.canal ?? "balcao",
            cliente: cobranca.clienteNome ? { nome: cobranca.clienteNome } : undefined,
            clienteNome: cobranca.clienteNome,
            itens: cobranca.itens.map((i) => ({
              produtoId: i.produtoId,
              nome: i.nome,
              precoUnit: i.precoUnit,
              quantidade: i.quantidade,
              observacao: i.observacao,
              tamanho: i.tamanhoNome ?? null,
              sabores: i.sabores?.map((s) => s.nome) ?? [],
              adicionais: i.adicionais?.map((a) => ({
                nome: a.nome,
                preco: a.preco,
                quantidade: a.quantidade ?? 1,
              })) ?? [],
            })),
            observacao: cobranca.observacao,
            entrega: cobranca.entrega,
            trocoPara: cobranca.trocoPara,
            formaPagamentoEntrega: cobranca.formaPagamentoEntrega,
          }),
        });
        pedidoId = criado.pedido.id;
        pedidoCriado = { id: criado.pedido.id, numero: criado.pedido.numero };
        // Pedido criado (ou recuperado por idempotência): a chave cumpriu
        // o papel dela e não deve ser reutilizada por nenhuma outra venda.
        idempotencyKeyPedido.current = null;
        // Reusa o mesmo pedido nas próximas chamadas desta mesma cobrança
        // (conta dividida) — sem isso, cada parcela criaria um pedido novo.
        setCobranca((atual) => (atual ? { ...atual, pedidoId } : atual));
      }

      // Confirma o pagamento (parcial ou total) no banco. O backend soma
      // com o que já foi pago e diz se a conta quitou de verdade.
      const idempotencyKey = novaIdempotencyKey();
      const resposta = await api<RespostaPagamento>(`/api/pedidos/${pedidoId}/pagamento`, {
        method: "POST",
        body: JSON.stringify({
          forma: pagamento.forma,
          valor,
          troco: pagamento.troco,
          mesaId: cobranca.mesaId,
          idempotencyKey,
        }),
      });

      // Sucesso: esta tentativa concluiu — libera o UUID para que a
      // próxima (parcela nova de conta dividida, mesmo valor/forma)
      // receba uma chave nova e seja registrada corretamente.
      idempotencyKeyTentativa.current = null;
      totalPagoAcumulado.current += valor;
      const quitado = resposta.quitado ?? true;
      const restante = resposta.saldoRestante ?? Math.max(0, cobranca.total - totalPagoAcumulado.current);
      setSaldoRestante(restante);
      registrarVenda(valor, pagamento.forma, pagamento.troco);

      if (!quitado) {
        toast.success(
          `Pagamento de ${valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} registrado. Falta ${restante.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`
        );
        // Conta ainda em aberto: mantém o diálogo para a próxima parcela
        // (outra pessoa/forma) — não mostra cupom nem conclui ainda.
        return;
      }

      setCupom({
        contexto: cobranca.contexto,
        clienteNome: cobranca.clienteNome,
        itens: cobranca.itens,
        total: cobranca.total,
        forma: pagamento.forma,
        valorRecebido: pagamento.valorRecebido,
        troco: pagamento.troco,
        fiscal: resposta.fiscal ?? null,
        empresa: resposta.empresa ?? null,
      });
      setPagamentoAberto(false);
      aoConfirmarRef.current?.(pedidoCriado);
      aoConfirmarRef.current = null;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar o pagamento.");
    } finally {
      persistindo.current = false;
    }
  }

  function concluir() {
    setCupom(null);
    setCobranca(null);
  }

  return {
    pagamentoAberto,
    setPagamentoAberto,
    cobranca,
    saldoRestante,
    caixaAberto,
    cupom,
    abrirPagamento,
    confirmarPagamento,
    concluir,
  };
}
