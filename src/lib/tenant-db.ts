import { PrismaClient } from "@prisma/client";
import { descriptografarSegredo } from "@/lib/crypto-segredos";
import { entrarContextoTenant, type ContextoTenant } from "@/lib/tenant-context";

/**
 * Resolução do banco de UMA empresa (PEDIDO: "database per tenant",
 * "isolamento estrutural", "não quero depender só de empresaId").
 *
 * Duas estratégias, escolhidas automaticamente por empresa:
 *
 * 1) PADRÃO — schema PostgreSQL dedicado no MESMO servidor
 *    (`Empresa.schemaBanco`, ex.: "tenant_disk_pizza_rozeno"). O
 *    PostgreSQL resolve nomes de tabela sem qualificação (ex.:
 *    `"Usuario"`) pelo `search_path` da conexão — então o MESMO Prisma
 *    Client gerado (mesmos tipos, mesmo código) funciona para qualquer
 *    schema, bastando trocar o parâmetro `?schema=` da URL de conexão.
 *    Isolamento real (namespaces de tabela separados no Postgres, não
 *    só uma coluna), com o custo operacional de UM servidor só.
 *
 * 2) OPCIONAL — banco fisicamente dedicado
 *    (`Empresa.databaseUrlSecreta`, criptografada). Para um cliente que
 *    justifique/pague por isolamento físico total (outro servidor,
 *    outra região, etc.), o Super Admin cadastra uma DATABASE_URL
 *    própria para aquela empresa — o restante do código não muda nada,
 *    porque a resolução acontece só aqui.
 *
 * Cada estratégia usa o MESMO schema.prisma/Prisma Client — a diferença
 * é inteiramente a string de conexão.
 */

interface ClienteTenantCache {
  client: PrismaClient;
  ultimoUso: number;
}

// Cache de PrismaClient por empresa — evita reconectar a cada
// requisição.
//
// CORREÇÃO (PEDIDO 62 — "muitos PrismaClients por tenant"): antes o
// limite era 100 e cada PrismaClient abria seu PRÓPRIO pool de conexões
// (padrão do Prisma, sem `connection_limit` definido — normalmente
// `num_cpus * 2 + 1`, ~9-17 conexões). Com 100 tenants em cache,
// SÓ o pool de conexões podia passar de mil conexões simultâneas —
// suficiente para esgotar o limite de qualquer Postgres gerenciado
// (Supabase inclusive). Três correções juntas:
//   1) Limite de tenants em cache MENOR e configurável (padrão 20, não
//      100) — `TENANT_CACHE_MAX`.
//   2) Cada conexão de tenant agora define `connection_limit` baixo e
//      configurável (padrão 3) — `TENANT_CONNECTION_LIMIT`. Total
//      máximo teórico: 20 × 3 = 60 conexões, não 100 × ~13 = 1300+.
//   3) TTL de inatividade — clientes sem uso há mais de
//      `TENANT_CACHE_TTL_MS` (padrão 15 min) são desconectados
//      proativamente, não só quando o cache estoura.
const cache = new Map<string, ClienteTenantCache>();
const LIMITE_CLIENTES_EM_CACHE = Number(process.env.TENANT_CACHE_MAX) > 0 ? Number(process.env.TENANT_CACHE_MAX) : 20;
const CONNECTION_LIMIT_POR_TENANT = Number(process.env.TENANT_CONNECTION_LIMIT) > 0 ? Number(process.env.TENANT_CONNECTION_LIMIT) : 3;
const TTL_INATIVIDADE_MS = Number(process.env.TENANT_CACHE_TTL_MS) > 0 ? Number(process.env.TENANT_CACHE_TTL_MS) : 15 * 60_000;

function nomeSchemaValido(schema: string): boolean {
  // Só letras minúsculas, números e underscore — nunca interpolar
  // entrada de usuário direto em SQL sem validar (mesmo sendo derivado
  // do slug, que já é validado na criação da empresa).
  return /^[a-z][a-z0-9_]{2,62}$/.test(schema);
}

export function nomeSchemaDoSlug(slug: string): string {
  return `tenant_${slug.replace(/-/g, "_")}`;
}

function construirUrlComSchema(schema: string): string {
  if (!nomeSchemaValido(schema)) {
    throw new Error(`Nome de schema de tenant inválido: "${schema}".`);
  }
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL não configurada.");
  const url = new URL(base);
  url.searchParams.set("schema", schema);
  aplicarConnectionLimit(url);
  return url.toString();
}

/** Aplica o limite de conexões por cliente de tenant, se a URL não já
 *  especificar um (respeita configuração manual explícita do operador). */
function aplicarConnectionLimit(url: URL) {
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", String(CONNECTION_LIMIT_POR_TENANT));
  }
  if (!url.searchParams.has("pool_timeout")) {
    url.searchParams.set("pool_timeout", "30");
  }
}

function evictirSeNecessario() {
  if (cache.size <= LIMITE_CLIENTES_EM_CACHE) return;
  let maisAntigo: string | null = null;
  let menorTempo = Infinity;
  for (const [empresaId, entrada] of cache) {
    if (entrada.ultimoUso < menorTempo) {
      menorTempo = entrada.ultimoUso;
      maisAntigo = empresaId;
    }
  }
  if (maisAntigo) {
    const entrada = cache.get(maisAntigo);
    cache.delete(maisAntigo);
    entrada?.client.$disconnect().catch(() => null);
  }
}

/**
 * TTL de inatividade (PEDIDO 62): desconecta clientes sem uso há mais
 * de `TTL_INATIVIDADE_MS`, independente do cache estar cheio ou não.
 * Chamada a cada `ativarTenant()` — custo desprezível (só percorre um
 * Map pequeno), e mantém o número de conexões abertas proporcional a
 * quem REALMENTE está usando o sistema agora, não a "todo mundo que já
 * usou nos últimos 100 acessos".
 */
function varrerClientesInativos() {
  const agora = Date.now();
  for (const [empresaId, entrada] of cache) {
    if (agora - entrada.ultimoUso > TTL_INATIVIDADE_MS) {
      cache.delete(empresaId);
      entrada.client.$disconnect().catch(() => null);
    }
  }
}

/**
 * Retorna (criando/cacheando) o PrismaClient da empresa, e já entra no
 * contexto do tenant para o restante da requisição — chamado por
 * `autorizar()`/`exigirRota()` logo após validar a sessão.
 */
export function ativarTenant(empresa: {
  id: string;
  schemaBanco: string | null;
  databaseUrlSecreta: string | null;
  slug: string;
}): ContextoTenant {
  const cacheado = cache.get(empresa.id);
  if (cacheado) {
    cacheado.ultimoUso = Date.now();
    varrerClientesInativos();
    const contexto: ContextoTenant = {
      empresaId: empresa.id,
      schemaBanco: empresa.schemaBanco ?? nomeSchemaDoSlug(empresa.slug),
      client: cacheado.client,
    };
    entrarContextoTenant(contexto);
    return contexto;
  }

  const schema = empresa.schemaBanco ?? nomeSchemaDoSlug(empresa.slug);
  let url: string;
  if (empresa.databaseUrlSecreta) {
    const urlDedicada = new URL(descriptografarSegredo(empresa.databaseUrlSecreta));
    aplicarConnectionLimit(urlDedicada);
    url = urlDedicada.toString();
  } else {
    url = construirUrlComSchema(schema);
  }

  const client = new PrismaClient({ datasources: { db: { url } } });
  cache.set(empresa.id, { client, ultimoUso: Date.now() });
  evictirSeNecessario();
  varrerClientesInativos();

  const contexto: ContextoTenant = { empresaId: empresa.id, schemaBanco: schema, client };
  entrarContextoTenant(contexto);
  return contexto;
}

/** Fecha e remove do cache o cliente de uma empresa (ex.: após trocar a DATABASE_URL dela). */
export async function invalidarClienteTenant(empresaId: string) {
  const entrada = cache.get(empresaId);
  if (!entrada) return;
  cache.delete(empresaId);
  await entrada.client.$disconnect().catch(() => null);
}

/** Fecha todas as conexões de tenant em cache (uso em testes/shutdown). */
export async function encerrarTodosClientesTenant() {
  const entradas = [...cache.values()];
  cache.clear();
  await Promise.all(entradas.map((e) => e.client.$disconnect().catch(() => null)));
}
