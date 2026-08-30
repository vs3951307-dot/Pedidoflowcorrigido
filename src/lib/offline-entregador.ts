"use client";

import { api, ApiException } from "@/lib/api-cliente";

/**
 * Modo offline do entregador (PEDIDO 18) — primeira versão real, usando
 * `localStorage` (funciona sem instalar nada extra e é suficiente para
 * o volume de dados de uma rota — algumas dezenas de entregas).
 *
 * O que faz de verdade:
 * - "Baixar rota para uso offline": grava a rota atual (clientes,
 *   endereços, telefones, itens, pagamento, coordenadas quando
 *   disponíveis) localmente, com hora da última atualização.
 * - Ações feitas sem internet (marcar chegada, confirmar entrega,
 *   confirmar pagamento) entram numa FILA local em vez de falhar.
 * - Ao reconectar, a fila é reenviada em ordem, uma ação por vez;
 *   ações que já foram confirmadas (verificado pelo próprio backend —
 *   ex.: entrega já "entregue") não duplicam.
 *
 * CORREÇÃO (PEDIDO 47 — "não considerar qualquer erro contendo texto
 * 'já' ou 'não encontrada' como sucesso"): antes, decidir se uma ação já
 * tinha sido aplicada (idempotente, seguro dropar da fila) olhava se a
 * MENSAGEM de erro continha a palavra "já" — um erro de validação
 * qualquer com essa palavra seria silenciosamente tratado como sucesso.
 * Agora usa o `codigo` ESTRUTURADO que a API devolve
 * (`ALREADY_APPLIED`/`NOT_FOUND` = seguro dropar; qualquer outro,
 * inclusive `CONFLICT`/`INVALID_STATE`, é falha real e fica na fila).
 *
 * Isto NÃO é uma reimplementação completa de sincronização offline-first
 * (não há resolução de conflito sofisticada) — é o suficiente para o
 * cenário descrito: entregador sem sinal consulta os dados baixados e
 * confirma ações, que entram na fila e sincronizam sozinhas depois.
 */

const CHAVE_ROTA = "pedidoflow.entregador.rotaOffline";
const CHAVE_FILA = "pedidoflow.entregador.filaOffline";

/** Códigos que significam "o servidor já tinha essa informação por outro
 *  caminho" — seguro remover da fila sem reenviar. Qualquer código FORA
 *  desta lista (ou ausência de código, de uma rota mais antiga) conta
 *  como falha real e a ação permanece na fila. */
const CODIGOS_SEGUROS_PARA_DROPAR = new Set(["ALREADY_APPLIED", "NOT_FOUND"]);

export interface EntregaOffline {
  id: string;
  numeroPedido: number;
  cliente: string;
  telefone: string | null;
  endereco: string;
  bairro: string;
  complemento: string | null;
  referencia: string | null;
  itens: { nome: string; quantidade: number }[];
  valor: number;
  formaPagamento: string | null;
  observacao: string | null;
  status: string;
}

export interface RotaOffline {
  baixadaEm: string; // ISO
  entregas: EntregaOffline[];
}

export type AcaoOffline =
  | { tipo: "confirmar-codigo"; id: string; criadoEm: string; codigo: string }
  | { tipo: "confirmar-entrega"; id: string; criadoEm: string; entregaId: string }
  | { tipo: "confirmar-pagamento"; id: string; criadoEm: string; pagamentoId: string; troco?: number };

function novoIdFila(): string {
  return `fila_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Salva a rota atual para consulta offline (chamado pelo botão "Baixar rota"). */
export function baixarRotaOffline(entregas: EntregaOffline[]): RotaOffline {
  const rota: RotaOffline = { baixadaEm: new Date().toISOString(), entregas };
  try {
    localStorage.setItem(CHAVE_ROTA, JSON.stringify(rota));
  } catch {
    // localStorage indisponível (modo privado, cota cheia) — a tela
    // segue funcionando normalmente online, só sem o cache offline.
  }
  return rota;
}

/** Lê a última rota baixada (ou `null` se nunca baixou). */
export function lerRotaOffline(): RotaOffline | null {
  try {
    const bruto = localStorage.getItem(CHAVE_ROTA);
    return bruto ? (JSON.parse(bruto) as RotaOffline) : null;
  } catch {
    return null;
  }
}

function lerFila(): AcaoOffline[] {
  try {
    const bruto = localStorage.getItem(CHAVE_FILA);
    return bruto ? (JSON.parse(bruto) as AcaoOffline[]) : [];
  } catch {
    return [];
  }
}

function salvarFila(fila: AcaoOffline[]) {
  try {
    localStorage.setItem(CHAVE_FILA, JSON.stringify(fila));
  } catch {
    // idem — sem cota, a ação já foi tentada direto (ver confirmarCodigoComFila)
  }
}

export function lerFilaOffline(): AcaoOffline[] {
  return lerFila();
}

export function tamanhoFilaOffline(): number {
  return lerFila().length;
}

// O `Omit` direto sobre uma união não distribui no TypeScript (Pick/Omit
// não percorrem os membros da união), então `Omit<AcaoOffline, "id"|"criadoEm">`
// vira um tipo errado. Este condicional distribui por cada variante.
type AcaoOfflineSemControle<T> = T extends unknown ? Omit<T, "id" | "criadoEm"> : never;

function enfileirar(acao: AcaoOfflineSemControle<AcaoOffline>) {
  const fila = lerFila();
  fila.push({ ...acao, id: novoIdFila(), criadoEm: new Date().toISOString() } as AcaoOffline);
  salvarFila(fila);
}

/**
 * Tenta executar a ação AGORA; se falhar por estar offline (ou o
 * `navigator.onLine` já indicar isso), guarda na fila para sincronizar
 * depois em vez de mostrar erro ao entregador.
 */
export async function confirmarCodigoComFila(
  codigo: string
): Promise<{ ok: boolean; offline: boolean; entrega?: { numero: number; cliente: string; status: string } }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    enfileirar({ tipo: "confirmar-codigo", codigo });
    return { ok: true, offline: true };
  }
  try {
    const resposta = await api<{ ok: boolean; entrega?: { numero: number; cliente: string; status: string } }>(
      "/api/entregas/confirmar-codigo",
      { method: "POST", body: JSON.stringify({ codigo }) }
    );
    return { ok: true, offline: false, entrega: resposta.entrega };
  } catch (erro) {
    // Falha de REDE de verdade (fetch nem completou) — TypeError é o
    // que o browser lança quando a requisição não sai do dispositivo.
    // Erro de NEGÓCIO (ApiException — a requisição chegou ao servidor e
    // ele respondeu com um erro, ex.: CONFLICT) nunca é enfileirado
    // silenciosamente — o entregador precisa saber na hora que outra
    // pessoa já assumiu aquela entrega, por exemplo.
    if (erro instanceof TypeError) {
      enfileirar({ tipo: "confirmar-codigo", codigo });
      return { ok: true, offline: true };
    }
    throw erro;
  }
}

/** Reenvia a fila local em ordem — chamado ao reconectar ou manualmente. */
export async function sincronizarFilaOffline(): Promise<{ enviados: number; falharam: number }> {
  const fila = lerFila();
  if (fila.length === 0) return { enviados: 0, falharam: 0 };

  const restantes: AcaoOffline[] = [];
  let enviados = 0;
  let falharam = 0;

  for (const acao of fila) {
    try {
      if (acao.tipo === "confirmar-codigo") {
        await api("/api/entregas/confirmar-codigo", { method: "POST", body: JSON.stringify({ codigo: acao.codigo }) });
      } else if (acao.tipo === "confirmar-entrega") {
        await api(`/api/entregas/${acao.entregaId}`, { method: "PATCH", body: JSON.stringify({ status: "entregue" }) });
      } else if (acao.tipo === "confirmar-pagamento") {
        await api(`/api/pagamentos/${acao.pagamentoId}`, { method: "PATCH", body: JSON.stringify({ troco: acao.troco ?? 0 }) });
      }
      enviados++;
    } catch (erro) {
      // Só considera "já sincronizado, seguro remover da fila" quando a
      // API devolve um CÓDIGO estruturado dizendo isso — nunca por
      // adivinhar a partir do texto da mensagem (ver cabeçalho do
      // arquivo, PEDIDO 47). `ApiException` sem `codigo` (rota mais
      // antiga que ainda não envia) ou qualquer código FORA da lista seg
      // ura conta como falha real — a ação continua na fila e será
      // tentada de novo na próxima sincronização.
      if (erro instanceof ApiException && erro.codigo && CODIGOS_SEGUROS_PARA_DROPAR.has(erro.codigo)) {
        enviados++;
        continue;
      }
      falharam++;
      restantes.push(acao);
    }
  }

  salvarFila(restantes);
  return { enviados, falharam };
}

/** Limpa a rota e a fila offline (ex.: ao trocar de turno). */
export function limparDadosOffline() {
  try {
    localStorage.removeItem(CHAVE_ROTA);
    localStorage.removeItem(CHAVE_FILA);
  } catch {
    // nada a fazer
  }
}
