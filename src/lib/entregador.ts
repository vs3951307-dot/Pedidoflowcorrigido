/**
 * Módulo Entregador — tipos e valores-padrão (vazios), usados como
 * fallback enquanto `GET /api/entregas` carrega ou se falhar. Nunca
 * preencha estas constantes com dado de exemplo: um fallback "realista"
 * (cliente, endereço, valor fictícios) é indistinguível de dado real
 * para quem está usando o sistema de verdade — e aqui seria pior ainda,
 * porque os nomes/endereços fictícios pareceriam clientes reais.
 */

export interface ResumoEntregador {
  label: string;
  valor: string;
  hint?: string;
  tendencia?: { value: string; positive: boolean };
}

export type StatusParada = "concluido" | "atual" | "pendente";

export interface ParadaRota {
  ordem: number;
  tipo: "retirada" | "entrega";
  cliente: string;
  endereco: string;
  bairro: string;
  previsao: string;
  status: StatusParada;
}

export interface PedidoCarrinho {
  id: string;
  cliente: string;
  endereco: string;
  bairro: string;
  itens: number;
  valor: number;
  forma: "pix" | "dinheiro" | "cartao";
  status: "a_entregar" | "entregue";
}

export interface PagamentoEntregador {
  id: string;
  pedido: string;
  cliente: string;
  forma: "pix" | "dinheiro" | "cartao";
  valor: number;
  hora: string;
  status: "confirmado" | "pendente" | "divergente";
}

export interface EntregaDiaSemana {
  dia: string;
  entregas: number;
}

export interface PendenciaOffline {
  tipo: string;
  descricao: string;
  quantidade: number;
}

/** Sem dado de exemplo: fica vazio até a resposta real de `GET /api/entregas`. */
/** Sem dado de exemplo: fica vazio até a resposta real de `GET /api/entregas`. */
export const RESUMO_ENTREGADOR: ResumoEntregador[] = [];

/** Sem dado de exemplo: fica vazio até a resposta real de `GET /api/entregas`. */
export const ROTA_DO_DIA: ParadaRota[] = [];

/** Sem dado de exemplo: fica vazio até a resposta real de `GET /api/entregas`. */
export const CARRINHO_ENTREGAS: PedidoCarrinho[] = [];

/** Sem dado de exemplo: fica vazio até a resposta real de `GET /api/entregas`. */
export const PAGAMENTOS_ENTREGADOR: PagamentoEntregador[] = [];

/** Sem dado de exemplo: fica vazio até a resposta real do relatório. */
export const ENTREGAS_SEMANA: EntregaDiaSemana[] = [];

/** Sem dado de exemplo: fica vazio até existir fila offline real pendente. */
export const PENDENCIAS_OFFLINE: PendenciaOffline[] = [];
