import { PrismaClient } from "@prisma/client";
import { contextoTenantAtual } from "@/lib/tenant-context";

/**
 * Ponto único de acesso ao banco — agora com isolamento estrutural por
 * tenant (PEDIDO: "não quero depender só de empresaId... quero
 * isolamento estrutural entre os ambientes").
 *
 * `prisma` continua sendo importado exatamente como antes em TODAS as
 * ~60 rotas existentes (`import { prisma } from "@/lib/prisma"`) — não
 * foi necessário reescrever nenhuma rota. O que mudou é o que esse
 * import devolve: um Proxy que decide, PROPRIEDADE POR PROPRIEDADE, se
 * a chamada deve ir para o banco da PLATAFORMA (schema `public`:
 * Empresa, Plano, SuperAdmin, SessaoSuperAdmin, UsoIa) ou para o banco
 * do TENANT ativo na requisição (schema dedicado da empresa da sessão,
 * ou banco fisicamente dedicado — ver `tenant-db.ts`).
 *
 * O tenant ativo é resolvido uma vez por requisição em
 * `autorizar()`/`exigirRota()` (src/lib/acesso.ts), via
 * `AsyncLocalStorage` (src/lib/tenant-context.ts) — nenhuma rota
 * precisa saber disso.
 *
 * SEGURANÇA: se o código tentar usar um model de tenant (ex.:
 * `prisma.pedido`) SEM um tenant ativo no contexto (bug de integração —
 * uma rota nova que não passou por `autorizar()`), o Proxy lança um
 * erro imediatamente. Nunca cai silenciosamente no banco da plataforma
 * nem no de outro tenant.
 */

// Nomes de delegate (camelCase, como o Prisma Client gera a partir do
// nome do model) que pertencem à PLATAFORMA — sempre no schema `public`,
// nunca no schema do tenant.
//
// DECISÃO ARQUITETURAL IMPORTANTE: `usuario`, `sessao`,
// `tokenRecuperacao`, `permissaoUsuario` e `auditoria` ficam na
// PLATAFORMA, não no schema de cada tenant. Motivo: resolver uma sessão
// (ou o e-mail digitado na 1ª etapa do login) exige localizar o Usuario
// ANTES de saber a qual empresa ele pertence — se essas tabelas
// estivessem dentro do schema do tenant, seria impossível descobrir QUAL
// schema consultar sem antes... já ter identificado o tenant (um
// problema de "ovo e galinha" sem solução sem duplicar dados de login
// numa tabela-índice separada). O isolamento entre empresas nesses
// models continua garantido por `empresaId` (defesa em profundidade,
// como o próprio pedido de arquitetura permite) mais o fato de que
// nenhuma rota aceita `empresaId` vindo do cliente. TODOS os demais
// dados operacionais (pedidos, clientes, caixa, estoque, WhatsApp,
// fiscal, impressão, configurações…) ficam no schema dedicado do
// tenant — isolamento estrutural real, não só lógico.
const DELEGATES_PLATAFORMA = new Set([
  "empresa",
  "plano",
  "superAdmin",
  "sessaoSuperAdmin",
  "usoIa",
  "landingConfig",
  "historicoCopiloto",
  "acaoPendenteCopiloto",
  "usuario",
  "sessao",
  "tokenRecuperacao",
  "permissaoUsuario",
  "auditoria",
]);

const globalForPrisma = globalThis as unknown as { plataformaPrisma?: PrismaClient };

/**
 * Monta a URL da plataforma com pool_timeout e connection_limit corretos
 * para o plano Free do Render (limite de 1 conexão simultânea).
 */
function montarUrlPlataforma(): string {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL não configurada.");
  const url = new URL(base);
  if (!url.searchParams.has("pool_timeout")) {
    url.searchParams.set("pool_timeout", "30");
  }
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", "1");
  }
  return url.toString();
}

/** Cliente da plataforma (schema `public`) — singleton, como antes da mudança. */
export const plataformaPrisma =
  globalForPrisma.plataformaPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    datasources: { db: { url: montarUrlPlataforma() } },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.plataformaPrisma = plataformaPrisma;

function clienteDoTenantOuFalha(propriedade: string): PrismaClient {
  const contexto = contextoTenantAtual();
  if (!contexto) {
    throw new Error(
      `Tentativa de acessar "${propriedade}" sem um tenant ativo no contexto. ` +
        `Toda rota que usa dados de empresa precisa passar por autorizar()/exigirRota() ` +
        `(src/lib/acesso.ts) antes de tocar em "${propriedade}".`
    );
  }
  return contexto.client;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, propriedade: string | symbol) {
    if (typeof propriedade !== "string") {
      return Reflect.get(plataformaPrisma, propriedade);
    }
    if (DELEGATES_PLATAFORMA.has(propriedade)) {
      return Reflect.get(plataformaPrisma, propriedade);
    }
    if (propriedade.startsWith("$")) {
      // Métodos de instância ($transaction, $queryRaw, $executeRaw,
      // $connect, $disconnect, $on, $use, $extends…) não têm um "model"
      // próprio — usam o tenant ativo quando existe (rotas de negócio,
      // dentro de autorizar()/exigirRota()) ou o banco da plataforma
      // quando não existe (rotas do Super Admin, que nunca ativam tenant
      // — ex.: criar Empresa+Usuario administrador na mesma transação).
      const contexto = contextoTenantAtual();
      const cliente = contexto ? contexto.client : plataformaPrisma;
      const valor = Reflect.get(cliente, propriedade);
      return typeof valor === "function" ? valor.bind(cliente) : valor;
    }
    // Delegate de model de TENANT (pedido, cliente, produto, caixa…):
    // exige tenant ativo — nunca cai silenciosamente na plataforma.
    const cliente = clienteDoTenantOuFalha(propriedade);
    const valor = Reflect.get(cliente, propriedade);
    return typeof valor === "function" ? valor.bind(cliente) : valor;
  },
}) as PrismaClient;
