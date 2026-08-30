import { AsyncLocalStorage } from "node:async_hooks";
import type { PrismaClient } from "@prisma/client";

/**
 * Contexto do tenant ATIVO na requisição corrente (PEDIDO: "isolamento
 * estrutural entre os ambientes", "database per tenant").
 *
 * Como funciona: cada empresa tem um schema PostgreSQL próprio (ou, no
 * caso raro de banco fisicamente dedicado, uma DATABASE_URL própria —
 * ver `tenant-db.ts`). Em vez de reescrever as ~60 rotas existentes
 * para receber um cliente Prisma como parâmetro, usamos
 * `AsyncLocalStorage`: assim que a sessão é validada
 * (`autorizar()`/`exigirRota()` em `src/lib/acesso.ts`), entramos no
 * contexto do tenant daquele usuário — e o restante da mesma requisição
 * (todo `await` daquela cadeia assíncrona) enxerga automaticamente o
 * Prisma Client correto através do proxy em `src/lib/prisma.ts`.
 *
 * SEGURANÇA: se nenhum contexto de tenant foi entrado (bug de
 * integração, rota nova que esqueceu de chamar `autorizar()`), o proxy
 * de `prisma.ts` lança erro em vez de silenciosamente usar o banco da
 * plataforma (`public`) ou o de outro tenant — falha alta, nunca vaza
 * dado.
 */

export interface ContextoTenant {
  empresaId: string;
  schemaBanco: string;
  client: PrismaClient;
}

/**
 * Store de requisição (imutável a cada request): um objeto mutável
 * compartilhado por TODA a cadeia assíncrona daquela requisição. As rotas
 * de API são executadas dentro de `tenantALS.run(reqStore, ...)` (ver
 * `comTratamentoDeErro` em `src/lib/api-erro.ts`); `autorizar()`/
 * `exigirRota()` preenchem `reqStore.contextoTenant` assim que o tenant é
 * resolvido.
 *
 * POR QUE NÃO `enterWith()` SÓ: `AsyncLocalStorage.enterWith()` setado
 * DENTRO de uma função após um `await` de I/O real (ex.: a consulta da
 * sessão no banco) NÃO alcança a continuação de quem chamou a função —
 * o `await` do handler de rota é registrado ANTES de `enterWith`
 * rodar, num recurso assíncrono irmão. Resultado: `prisma.mesa` (etc.)
 * era acessado sem tenant ativo → erro 500 "sem tenant no contexto" em
 * TODAS as rotas que consultam dados de empresa. Usar `run(storeMutável)`
 * garante que o store (objeto) é o MESMO ao longo da requisição inteira,
 * independente de quantos `await`s/recursos assíncronos a rota tenha.
 */
export interface StoreRequisicao {
  contextoTenant: ContextoTenant | null;
}

export const tenantALS = new AsyncLocalStorage<ContextoTenant | StoreRequisicao>();

/**
 * Define o tenant ativo para o RESTANTE da execução assíncrona corrente.
 * Prefere mutar o store da requisição (quando a rota roda dentro de
 * `tenantALS.run` — padrão nas APIs); cai em `enterWith` para chamadas
 * fora desse padrão (páginas/scripts, onde o enterWith ainda funciona
 * porque nada importante consulta dado de tenant depois de um `await`).
 */
export function entrarContextoTenant(contexto: ContextoTenant) {
  const store = tenantALS.getStore();
  if (store && "contextoTenant" in store) {
    store.contextoTenant = contexto;
    return;
  }
  tenantALS.enterWith(contexto);
}

/** Contexto do tenant ativo, ou `null` se nenhum foi definido (fora de uma requisição autenticada). */
export function contextoTenantAtual(): ContextoTenant | null {
  const store = tenantALS.getStore();
  if (!store) return null;
  if ("contextoTenant" in store) return store.contextoTenant;
  return store;
}
