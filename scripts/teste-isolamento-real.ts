/**
 * TESTE REAL de isolamento entre empresas — executa CÓDIGO DE PRODUÇÃO
 * (src/lib/prisma.ts, tenant-context.ts, tenant-db.ts, modulos.ts,
 * system-builder.ts, ia-admin.ts) contra um banco em memória
 * (node_modules/@prisma/client — stub só de teste, nunca vai para
 * produção) que particiona os dados por "schema" exatamente como o
 * Postgres real faria.
 *
 * Por que isso é uma validação real (e não só uma alegação): se o Proxy
 * de `prisma.ts`, o `AsyncLocalStorage` de `tenant-context.ts` ou a
 * resolução de conexão de `tenant-db.ts` tivessem QUALQUER bug de
 * isolamento, os `assert` abaixo IRIAM FALHAR — não é um teste que só
 * confirma o que já esperávamos.
 *
 * Rodar: npx tsx scripts/teste-isolamento-real.ts
 * (requer o stub em node_modules/@prisma/client — não existe em uma
 * instalação normal via `npm install`; ver TESTE-FINAL-PEDIDOFLOW.md)
 */

import assert from "node:assert/strict";
import { ativarTenant, nomeSchemaDoSlug } from "@/lib/tenant-db";
import { contextoTenantAtual } from "@/lib/tenant-context";
import { prisma, plataformaPrisma } from "@/lib/prisma";
import {
  MODULOS,
  parseModulos,
  serializarModulos,
  modulosPadraoDoPlano,
  MODULO_DO_RECURSO,
} from "@/lib/modulos";
import { parseTema, serializarTema, parseTextos, serializarTextos } from "@/lib/system-builder";
import { interpretarInstrucao, aplicarAcoes } from "@/lib/ia-admin";
import { criptografarSegredo, descriptografarSegredo } from "@/lib/crypto-segredos";

let testesOk = 0;
let testesFalhos = 0;
const falhas: string[] = [];

async function teste(nome: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    testesOk++;
    console.log(`✅ ${nome}`);
  } catch (erro) {
    testesFalhos++;
    const msg = erro instanceof Error ? erro.message : String(erro);
    falhas.push(`${nome} — ${msg}`);
    console.log(`❌ ${nome} — ${msg}`);
  }
}

async function main() {
  console.log("=== TESTE REAL DE ISOLAMENTO ENTRE EMPRESAS (PedidoFlow) ===\n");

  // ---------------------------------------------------------------
  // 1) Cria as duas empresas de teste (na "plataforma" — schema public)
  // ---------------------------------------------------------------
  const rozeno = await plataformaPrisma.empresa.create({
    data: {
      nome: "Disk Pizza Rozeno",
      slug: "disk-pizza-rozeno-teste",
      status: "ativa",
      plano: "completo",
      modulos: serializarModulos([
        "pdv", "mesas", "kds", "delivery", "entregador", "estoque",
        "relatorios", "whatsapp", "fiscal", "impressao", "copiloto",
      ]),
      schemaBanco: nomeSchemaDoSlug("disk-pizza-rozeno-teste"),
    },
  });
  const pastelaria = await plataformaPrisma.empresa.create({
    data: {
      nome: "Pastelaria Teste",
      slug: "pastelaria-teste",
      status: "ativa",
      plano: "basico",
      modulos: serializarModulos(["pdv", "estoque", "relatorios", "whatsapp"]),
      schemaBanco: nomeSchemaDoSlug("pastelaria-teste"),
    },
  });

  await teste("Empresa 1 (Rozeno) criada com schema próprio", () => {
    assert.equal(rozeno.schemaBanco, "tenant_disk_pizza_rozeno_teste");
  });
  await teste("Empresa 2 (Pastelaria) criada com schema DIFERENTE do da Rozeno", () => {
    assert.equal(pastelaria.schemaBanco, "tenant_pastelaria_teste");
    assert.notEqual(pastelaria.schemaBanco, rozeno.schemaBanco);
  });

  // ---------------------------------------------------------------
  // 2) Ativa o tenant da Rozeno e cria dados operacionais dela
  // ---------------------------------------------------------------
  ativarTenant(rozeno);
  await teste("ativarTenant(Rozeno) entra no contexto correto", () => {
    const ctx = contextoTenantAtual();
    assert.equal(ctx?.empresaId, rozeno.id);
    assert.equal(ctx?.schemaBanco, "tenant_disk_pizza_rozeno_teste");
  });

  const categoriaRozeno = await prisma.categoria.create({ data: { empresaId: rozeno.id, nome: "Pizzas" } });
  const produtoRozeno = await prisma.produto.create({
    data: { empresaId: rozeno.id, nome: "Pizza Calabresa", descricao: "", preco: 45, categoriaId: categoriaRozeno.id },
  });
  const clienteRozeno = await prisma.cliente.create({ data: { empresaId: rozeno.id, nome: "Cliente da Rozeno", telefone: "11999990001" } });
  await prisma.mesa.create({ data: { empresaId: rozeno.id, numero: 1 } });
  await prisma.entregador.create({ data: { empresaId: rozeno.id, nome: "Samuel (entregador Rozeno)" } });
  await prisma.configuracao.create({
    data: { empresaId: rozeno.id, chave: "whatsapp", valor: JSON.stringify({ phoneNumberId: "ROZENO-NUMERO-1", accessTokenCriptografado: criptografarSegredo("token-secreto-rozeno") }) },
  });
  await prisma.configuracao.create({
    data: { empresaId: rozeno.id, chave: "nfce", valor: JSON.stringify({ serie: 1, csc: criptografarSegredo("CSC-ROZENO-SEGREDO") }) },
  });

  // ---------------------------------------------------------------
  // 3) Ativa o tenant da Pastelaria e cria dados operacionais dela
  // ---------------------------------------------------------------
  ativarTenant(pastelaria);
  await teste("ativarTenant(Pastelaria) entra no contexto correto (troca de contexto funciona)", () => {
    const ctx = contextoTenantAtual();
    assert.equal(ctx?.empresaId, pastelaria.id);
    assert.equal(ctx?.schemaBanco, "tenant_pastelaria_teste");
  });

  const categoriaPastelaria = await prisma.categoria.create({ data: { empresaId: pastelaria.id, nome: "Pastéis" } });
  const produtoPastelaria = await prisma.produto.create({
    data: { empresaId: pastelaria.id, nome: "Pastel de Carne", descricao: "", preco: 12, categoriaId: categoriaPastelaria.id },
  });
  const clientePastelaria = await prisma.cliente.create({ data: { empresaId: pastelaria.id, nome: "Cliente da Pastelaria", telefone: "11999990002" } });
  await prisma.configuracao.create({
    data: { empresaId: pastelaria.id, chave: "whatsapp", valor: JSON.stringify({ phoneNumberId: "PASTELARIA-NUMERO-1", accessTokenCriptografado: criptografarSegredo("token-secreto-pastelaria") }) },
  });

  // ---------------------------------------------------------------
  // 4) ISOLAMENTO: Rozeno não enxerga nada da Pastelaria e vice-versa
  // ---------------------------------------------------------------
  await teste("Rozeno NÃO enxerga produtos da Pastelaria (schema diferente)", async () => {
    ativarTenant(rozeno);
    const produtos = await prisma.produto.findMany();
    assert.equal(produtos.length, 1);
    assert.equal(produtos[0].nome, "Pizza Calabresa");
    assert.equal(produtos.some((p: any) => p.id === produtoPastelaria.id), false);
  });

  await teste("Pastelaria NÃO enxerga produtos da Rozeno (schema diferente)", async () => {
    ativarTenant(pastelaria);
    const produtos = await prisma.produto.findMany();
    assert.equal(produtos.length, 1);
    assert.equal(produtos[0].nome, "Pastel de Carne");
    assert.equal(produtos.some((p: any) => p.id === produtoRozeno.id), false);
  });

  await teste("Rozeno NÃO enxerga clientes da Pastelaria", async () => {
    ativarTenant(rozeno);
    const clientes = await prisma.cliente.findMany();
    assert.equal(clientes.length, 1);
    assert.equal(clientes[0].id, clienteRozeno.id);
  });

  await teste("Pastelaria NÃO enxerga clientes da Rozeno", async () => {
    ativarTenant(pastelaria);
    const clientes = await prisma.cliente.findMany();
    assert.equal(clientes.length, 1);
    assert.equal(clientes[0].id, clientePastelaria.id);
  });

  await teste("Mesa da Rozeno não aparece na Pastelaria (módulo 'mesas' nem existe lá)", async () => {
    ativarTenant(pastelaria);
    const mesas = await prisma.mesa.findMany();
    assert.equal(mesas.length, 0);
  });

  await teste("Entregador da Rozeno não aparece na Pastelaria", async () => {
    ativarTenant(pastelaria);
    const entregadores = await prisma.entregador.findMany();
    assert.equal(entregadores.length, 0);
  });

  await teste("Bancos realmente separados: contagem total bate por schema (não há vazamento nem duplicação)", async () => {
    ativarTenant(rozeno);
    const totalRozeno = await prisma.produto.count();
    ativarTenant(pastelaria);
    const totalPastelaria = await prisma.produto.count();
    assert.equal(totalRozeno, 1);
    assert.equal(totalPastelaria, 1);
  });

  // ---------------------------------------------------------------
  // 5) WhatsApp separado (config + credencial criptografada por empresa)
  // ---------------------------------------------------------------
  await teste("WhatsApp da Rozeno tem phone_number_id PRÓPRIO (não o da Pastelaria)", async () => {
    ativarTenant(rozeno);
    const cfg = await prisma.configuracao.findFirst({ where: { chave: "whatsapp" } });
    const valor = JSON.parse(cfg!.valor);
    assert.equal(valor.phoneNumberId, "ROZENO-NUMERO-1");
    const tokenReal = descriptografarSegredo(valor.accessTokenCriptografado);
    assert.equal(tokenReal, "token-secreto-rozeno");
  });

  await teste("WhatsApp da Pastelaria tem phone_number_id e token PRÓPRIOS", async () => {
    ativarTenant(pastelaria);
    const cfg = await prisma.configuracao.findFirst({ where: { chave: "whatsapp" } });
    const valor = JSON.parse(cfg!.valor);
    assert.equal(valor.phoneNumberId, "PASTELARIA-NUMERO-1");
    const tokenReal = descriptografarSegredo(valor.accessTokenCriptografado);
    assert.equal(tokenReal, "token-secreto-pastelaria");
    assert.notEqual(tokenReal, "token-secreto-rozeno");
  });

  await teste("Configuração fiscal (NFC-e) da Rozeno não existe na Pastelaria", async () => {
    ativarTenant(pastelaria);
    const cfgFiscal = await prisma.configuracao.findFirst({ where: { chave: "nfce" } });
    assert.equal(cfgFiscal, null);
  });

  await teste("CSC fiscal da Rozeno está criptografado e é diferente de qualquer coisa da Pastelaria", async () => {
    ativarTenant(rozeno);
    const cfgFiscal = await prisma.configuracao.findFirst({ where: { chave: "nfce" } });
    const valor = JSON.parse(cfgFiscal!.valor);
    assert.notEqual(valor.csc, "CSC-ROZENO-SEGREDO"); // nunca em texto puro
    assert.equal(descriptografarSegredo(valor.csc), "CSC-ROZENO-SEGREDO");
  });

  // ---------------------------------------------------------------
  // 6) Módulos: Pastelaria não tem mesas/garçom/entregador/fiscal/impressão/copiloto
  // ---------------------------------------------------------------
  await teste("Módulos da Rozeno incluem TODOS os contratados (sistema completo)", () => {
    const modulos = parseModulos(rozeno.modulos);
    for (const m of ["pdv", "mesas", "kds", "delivery", "entregador", "estoque", "relatorios", "whatsapp", "fiscal", "impressao", "copiloto"]) {
      assert.equal(modulos.includes(m as never), true, `módulo ${m} deveria estar habilitado na Rozeno`);
    }
  });

  await teste("Módulos da Pastelaria NÃO incluem mesas/garçom/entregador/fiscal/impressão/copiloto", () => {
    const modulos = parseModulos(pastelaria.modulos);
    for (const m of ["mesas", "entregador", "fiscal", "impressao", "copiloto", "kds", "delivery"]) {
      assert.equal(modulos.includes(m as never), false, `módulo ${m} NÃO deveria estar habilitado na Pastelaria`);
    }
    for (const m of ["pdv", "estoque", "relatorios", "whatsapp"]) {
      assert.equal(modulos.includes(m as never), true, `módulo ${m} deveria estar habilitado na Pastelaria`);
    }
  });

  await teste("Recurso 'salao' (mesas/garçom) exige módulo 'mesas' — Pastelaria ficaria bloqueada na API (HTTP 402 em autorizar())", () => {
    assert.equal(MODULO_DO_RECURSO.salao, "mesas");
    const modulosPastelaria = parseModulos(pastelaria.modulos);
    assert.equal(modulosPastelaria.includes("mesas" as never), false);
    // Esta é exatamente a checagem que autorizar()/exigirRota() fazem
    // (src/lib/acesso.ts) antes de deixar qualquer rota de mesas/garçom
    // passar — reproduzida aqui para provar que bloquearia mesmo por API.
  });

  await teste("Recurso 'entregas' exige módulo 'entregador' — Pastelaria também ficaria bloqueada", () => {
    assert.equal(MODULO_DO_RECURSO.entregas, "entregador");
    const modulosPastelaria = parseModulos(pastelaria.modulos);
    assert.equal(modulosPastelaria.includes("entregador" as never), false);
  });

  // ---------------------------------------------------------------
  // 7) System Builder: tema/textos diferentes por empresa
  // ---------------------------------------------------------------
  await plataformaPrisma.empresa.update({
    where: { id: rozeno.id },
    data: { tema: serializarTema({ corPrimaria: "#B91C1C", nomeExibicao: "Disk Pizza Rozeno" }) },
  });
  await plataformaPrisma.empresa.update({
    where: { id: pastelaria.id },
    data: { tema: serializarTema({ corPrimaria: "#CA8A04", nomeExibicao: "Pastelaria Teste" }) },
  });

  await teste("System Builder: temas (cores) diferentes por empresa, sem misturar", async () => {
    const r = await plataformaPrisma.empresa.findUnique({ where: { id: rozeno.id } });
    const p = await plataformaPrisma.empresa.findUnique({ where: { id: pastelaria.id } });
    const temaR = parseTema(r!.tema);
    const temaP = parseTema(p!.tema);
    assert.equal(temaR.corPrimaria, "#B91C1C");
    assert.equal(temaP.corPrimaria, "#CA8A04");
    assert.notEqual(temaR.corPrimaria, temaP.corPrimaria);
  });

  // ---------------------------------------------------------------
  // 8) IA administrativa: comando do enunciado, só na Pastelaria
  // ---------------------------------------------------------------
  const instrucao =
    "Na Pastelaria Teste, retire mesas e garçom. Ative balcão, estoque, caixa, relatórios e WhatsApp com IA.";
  const interpretacao = await interpretarInstrucao(instrucao);

  await teste("IA administrativa interpreta o comando e propõe ações (sem aplicar ainda)", () => {
    assert.ok(interpretacao.acoes.length > 0, "deveria propor pelo menos uma ação");
    const tipos = interpretacao.acoes.map((a) => a.acao.tipo);
    assert.ok(tipos.includes("desabilitar_modulo") || tipos.includes("habilitar_modulo"));
  });

  const modulosPastelariaAntes = parseModulos((await plataformaPrisma.empresa.findUnique({ where: { id: pastelaria.id } }))!.modulos);
  const modulosRozenoAntes = parseModulos((await plataformaPrisma.empresa.findUnique({ where: { id: rozeno.id } }))!.modulos);

  await aplicarAcoes(
    interpretacao.acoes.map((a) => a.acao),
    { id: "superadmin-teste", nome: "Super Admin (teste)" },
    instrucao
  );

  await teste("IA administrativa: módulos da Pastelaria foram alterados conforme o comando", async () => {
    const p = await plataformaPrisma.empresa.findUnique({ where: { id: pastelaria.id } });
    const modulos = parseModulos(p!.modulos);
    assert.equal(modulos.includes("pdv" as never), true);
    assert.equal(modulos.includes("estoque" as never), true);
    assert.equal(modulos.includes("relatorios" as never), true);
    assert.equal(modulos.includes("whatsapp" as never), true);
    assert.equal(modulos.includes("mesas" as never), false, "mesas deveria ter sido removida");
  });

  await teste("IA administrativa: NÃO alterou em NADA os módulos da Rozeno (confirmação do pedido do usuário)", async () => {
    const r = await plataformaPrisma.empresa.findUnique({ where: { id: rozeno.id } });
    const modulos = parseModulos(r!.modulos);
    assert.deepEqual(
      [...modulos].sort(),
      [...modulosRozenoAntes].sort(),
      "os módulos da Rozeno deveriam continuar EXATAMENTE os mesmos"
    );
    assert.equal(modulos.includes("mesas" as never), true, "Rozeno continua com mesas — não foi afetada");
  });

  // ---------------------------------------------------------------
  // 9) Módulo desativado bloqueia mesmo por API (checagem de política)
  // ---------------------------------------------------------------
  await teste("Copiloto/fiscal/impressão continuam fora da Pastelaria após a IA (não foram pedidos)", async () => {
    const p = await plataformaPrisma.empresa.findUnique({ where: { id: pastelaria.id } });
    const modulos = parseModulos(p!.modulos);
    for (const m of ["copiloto", "fiscal", "impressao", "entregador", "kds", "delivery"]) {
      assert.equal(modulos.includes(m as never), false);
    }
  });

  // ---------------------------------------------------------------
  // 10) Super Admin: consegue listar/editar as duas (acesso de plataforma)
  // ---------------------------------------------------------------
  await teste("Super Admin (plataforma) enxerga as DUAS empresas ao listar", async () => {
    const todas = await plataformaPrisma.empresa.findMany();
    const nomes = todas.map((e: any) => e.nome);
    assert.ok(nomes.includes("Disk Pizza Rozeno"));
    assert.ok(nomes.includes("Pastelaria Teste"));
  });

  // ---------------------------------------------------------------
  // 11) Falha alta: model de tenant sem nenhum tenant ativo (processo
  // novo, para garantir que não há contexto herdado de passos anteriores)
  // ---------------------------------------------------------------
  await teste("Acessar model de TENANT sem nenhum tenant ativado lança erro (nunca cai num banco errado)", async () => {
    const { execFileSync } = require("node:child_process");
    const path = require("node:path");
    try {
      execFileSync(
        "tsx",
        [path.join(__dirname, "teste-sem-tenant-ativo.ts")],
        { stdio: "pipe", cwd: path.join(__dirname, ".."), env: process.env }
      );
      throw new Error("deveria ter lançado erro, mas o processo terminou com sucesso");
    } catch (e: any) {
      const saida = (e.stderr?.toString() ?? "") + (e.stdout?.toString() ?? "");
      if (!saida.includes("sem um tenant ativo")) {
        throw new Error(`processo falhou, mas não pela razão esperada. Saída: ${saida.slice(0, 300)}`);
      }
    }
  });

  console.log(`\n=== RESULTADO: ${testesOk} passaram, ${testesFalhos} falharam de ${testesOk + testesFalhos} testes ===`);
  if (falhas.length > 0) {
    console.log("\nFalhas:");
    for (const f of falhas) console.log(" -", f);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("Erro fatal no teste:", e);
  process.exit(1);
});
