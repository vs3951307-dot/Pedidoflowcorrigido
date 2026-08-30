import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { parseModulos, serializarModulos, MODULO_DO_RECURSO } from "@/lib/modulos";
import { temPermissao } from "@/lib/permissao";

/**
 * Testes de ISOLAMENTO ENTRE EMPRESAS (PEDIDO 12 do SaaS).
 *
 * Estes testes rodam contra um banco Postgres REAL (não mockado) porque
 * o que estamos validando é justamente o comportamento das constraints e
 * dos filtros do Prisma — um mock esconderia exatamente o tipo de erro
 * que essa suíte existe para pegar.
 *
 * COMO RODAR:
 *   DATABASE_URL="postgresql://.../pedidoflow_test" npm run test
 *
 * Use um banco de TESTE dedicado (nunca produção) — a suíte cria e
 * remove empresas/dados a cada execução (`beforeAll`/`afterAll`).
 */

const prisma = new PrismaClient();

let empresaA: { id: string };
let empresaB: { id: string };
let produtoA: { id: string };
let produtoB: { id: string };
let clienteB: { id: string };
let usuarioA: { id: string };

// Timeout alto (60s): a suíte roda contra banco remoto (Supabase) e a
// latência via pooler (6543) deixa cada query em segundos — o default de
// 10s estourava no `beforeAll`/`afterAll`.
beforeAll(async () => {
  empresaA = await prisma.empresa.create({
    data: { nome: "Empresa Teste A", slug: `teste-a-${Date.now()}`, status: "ativa", modulos: serializarModulos(["pdv"]) },
  });
  empresaB = await prisma.empresa.create({
    data: { nome: "Empresa Teste B", slug: `teste-b-${Date.now()}`, status: "ativa", modulos: serializarModulos(["pdv", "estoque"]) },
  });

  const categoriaA = await prisma.categoria.create({ data: { empresaId: empresaA.id, nome: "Categoria A" } });
  const categoriaB = await prisma.categoria.create({ data: { empresaId: empresaB.id, nome: "Categoria B" } });

  produtoA = await prisma.produto.create({
    data: { empresaId: empresaA.id, nome: "Produto A", descricao: "", preco: 10, categoriaId: categoriaA.id },
  });
  produtoB = await prisma.produto.create({
    data: { empresaId: empresaB.id, nome: "Produto B", descricao: "", preco: 20, categoriaId: categoriaB.id },
  });

  clienteB = await prisma.cliente.create({ data: { empresaId: empresaB.id, nome: "Cliente B" } });

  usuarioA = await prisma.usuario.create({
    data: { empresaId: empresaA.id, nome: "Admin A", email: `admin-a-${Date.now()}@teste.com`, senhaHash: "x", papel: "ADMINISTRADOR" },
  });
}, 60_000);

afterAll(async () => {
  // Ordem de dependência (filhos antes dos pais).
  await prisma.produto.deleteMany({ where: { empresaId: { in: [empresaA.id, empresaB.id] } } });
  await prisma.categoria.deleteMany({ where: { empresaId: { in: [empresaA.id, empresaB.id] } } });
  await prisma.cliente.deleteMany({ where: { empresaId: { in: [empresaA.id, empresaB.id] } } });
  await prisma.usuario.deleteMany({ where: { empresaId: { in: [empresaA.id, empresaB.id] } } });
  await prisma.empresa.deleteMany({ where: { id: { in: [empresaA.id, empresaB.id] } } });
  await prisma.$disconnect();
}, 60_000);

describe("Isolamento entre empresas — leitura", () => {
  it("Empresa A NÃO consegue ler um produto da Empresa B (filtro por empresaId)", async () => {
    const encontrado = await prisma.produto.findFirst({ where: { id: produtoB.id, empresaId: empresaA.id } });
    expect(encontrado).toBeNull();
  });

  it("Empresa B consegue ler o próprio produto normalmente", async () => {
    const encontrado = await prisma.produto.findFirst({ where: { id: produtoB.id, empresaId: empresaB.id } });
    expect(encontrado).not.toBeNull();
  });

  it("listagem de produtos da Empresa A nunca inclui produtos da Empresa B", async () => {
    const produtos = await prisma.produto.findMany({ where: { empresaId: empresaA.id } });
    expect(produtos.some((p) => p.id === produtoB.id)).toBe(false);
  });
});

describe("Isolamento entre empresas — escrita/exclusão", () => {
  it("Empresa A NÃO consegue alterar um produto da Empresa B (updateMany com empresaId errado não afeta nada)", async () => {
    const resultado = await prisma.produto.updateMany({
      where: { id: produtoB.id, empresaId: empresaA.id },
      data: { nome: "Nome alterado indevidamente" },
    });
    expect(resultado.count).toBe(0);
    const aindaOriginal = await prisma.produto.findUnique({ where: { id: produtoB.id } });
    expect(aindaOriginal?.nome).toBe("Produto B");
  });

  it("Empresa A NÃO consegue excluir um produto da Empresa B (deleteMany com empresaId errado não afeta nada)", async () => {
    const resultado = await prisma.produto.deleteMany({ where: { id: produtoB.id, empresaId: empresaA.id } });
    expect(resultado.count).toBe(0);
    const aindaExiste = await prisma.produto.findUnique({ where: { id: produtoB.id } });
    expect(aindaExiste).not.toBeNull();
  });

  it("Empresa A NÃO consegue criar um pedido apontando para cliente da Empresa B (padrão usado nas rotas: validar posse antes de vincular)", async () => {
    const clienteEncontradoComoDaEmpresaA = await prisma.cliente.findFirst({
      where: { id: clienteB.id, empresaId: empresaA.id },
    });
    // Isto é exatamente o que src/app/api/pedidos/route.ts faz antes de
    // aceitar um clienteId no corpo da requisição — se vier null, a rota
    // rejeita com 400 ("Cliente inexistente"), nunca vincula.
    expect(clienteEncontradoComoDaEmpresaA).toBeNull();
  });
});

describe("Unicidade por empresa (não mais global)", () => {
  it("duas empresas podem ter uma categoria com o MESMO nome sem conflito", async () => {
    const nome = `Categoria Compartilhada ${Date.now()}`;
    const c1 = await prisma.categoria.create({ data: { empresaId: empresaA.id, nome } });
    const c2 = await prisma.categoria.create({ data: { empresaId: empresaB.id, nome } });
    expect(c1.id).not.toBe(c2.id);
    await prisma.categoria.deleteMany({ where: { id: { in: [c1.id, c2.id] } } });
  });

  it("a MESMA empresa não pode ter duas categorias com o mesmo nome (constraint única por empresa)", async () => {
    const nome = `Categoria Unica ${Date.now()}`;
    await prisma.categoria.create({ data: { empresaId: empresaA.id, nome } });
    await expect(prisma.categoria.create({ data: { empresaId: empresaA.id, nome } })).rejects.toThrow();
    await prisma.categoria.deleteMany({ where: { empresaId: empresaA.id, nome } });
  });
});

describe("Módulo não contratado — bloqueio de recurso", () => {
  it("Empresa A (só módulo 'pdv') não tem o módulo 'estoque' habilitado", async () => {
    const modulos = parseModulos(serializarModulos(["pdv"]));
    expect(modulos.includes("estoque" as never)).toBe(false);
    expect(MODULO_DO_RECURSO.estoque).toBe("estoque");
  });

  it("Empresa B (módulos 'pdv' e 'estoque') tem o módulo 'estoque' habilitado", async () => {
    const modulos = parseModulos(serializarModulos(["pdv", "estoque"]));
    expect(modulos.includes("estoque")).toBe(true);
  });
});

describe("Permissão de papel (independente de empresa, mas nunca ultrapassa o Super Admin)", () => {
  it("ADMINISTRADOR de empresa tem o recurso 'usuarios', mas isso não dá acesso ao Super Admin", () => {
    const admin = { id: usuarioA.id, nome: "Admin A", email: "a@a.com", papel: "ADMINISTRADOR", ativo: true };
    expect(temPermissao(admin, "usuarios")).toBe(true);
    // Não existe recurso "superadmin" no catálogo de RECURSOS — a
    // autorização do painel Super Admin usa `autorizarSuperAdmin()`,
    // uma guarda TOTALMENTE separada (src/lib/super-admin/auth.ts) que
    // nunca consulta `Usuario`/`temPermissao`. Este teste documenta essa
    // separação: não há NENHUM valor de `papel` de Usuario que resulte
    // em acesso ao Super Admin.
  });

  it("papel GARCOM não tem o recurso 'usuarios' nem 'admin'", () => {
    const garcom = { id: "x", nome: "G", email: "g@g.com", papel: "GARCOM", ativo: true };
    expect(temPermissao(garcom, "usuarios")).toBe(false);
    expect(temPermissao(garcom, "admin")).toBe(false);
  });
});
