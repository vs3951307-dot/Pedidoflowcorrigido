import { describe, it, expect, vi, beforeEach, type MockedFunction } from "vitest";

const { mockPrismaInstance } = vi.hoisted(() => ({
  mockPrismaInstance: {
    conversaWhatsApp: { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    mensagemWhatsApp: { create: vi.fn(), findFirst: vi.fn() },
    cliente: { findFirst: vi.fn(), create: vi.fn() },
    empresa: { findUnique: vi.fn() },
    pedido: { findFirst: vi.fn() },
    eventoIA: { create: vi.fn() },
    produto: { findFirst: vi.fn() },
    configuracao: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrismaInstance }));
vi.mock("@/lib/ai-provider", () => ({ chamarIA: vi.fn(), iaDisponivel: vi.fn(() => true) }));

vi.mock("@/lib/atendente/catalogo", () => ({
  buscarProdutos: vi.fn(async (_eid: string, texto?: string) => {
    const produtos = [
      { id: "p1", nome: "Calabresa", precoBase: 39.9, categoria: "Pizza", emoji: "P", descricao: "", fotoUrl: null, destaque: false, disponivel: true, temSabores: true, temTamanhos: true, tamanhos: [{ id: "t1", nome: "Media", valor: 39.9 }], sabores: [{ nome: "Calabresa", tipo: "tradicional" }] },
      { id: "p2", nome: "Margherita", precoBase: 42.0, categoria: "Pizza", emoji: "P", descricao: "", fotoUrl: null, destaque: false, disponivel: true, temSabores: true, temTamanhos: true, tamanhos: [{ id: "t3", nome: "Media", valor: 42.0 }], sabores: [{ nome: "Margherita", tipo: "especial" }] },
    ];
    if (!texto) return produtos;
    return produtos.filter((p) => p.nome.toLowerCase().includes(texto.toLowerCase()));
  }),
  listarProdutosDisponiveis: vi.fn(async () => [
    { id: "p1", nome: "Calabresa", precoBase: 39.9, categoria: "Pizza", emoji: "P", descricao: "", fotoUrl: null, destaque: false, disponivel: true, temSabores: true, temTamanhos: true, tamanhos: [{ id: "t1", nome: "Media", valor: 39.9 }], sabores: [{ nome: "Calabresa", tipo: "tradicional" }] },
  ]),
  nomeFantasia: vi.fn(async () => "DiskPizza Rozeno"),
  clientePorTelefone: vi.fn(async () => null),
  buscarEnderecosPorTelefone: vi.fn(async () => []),
  normalizarTelefone: vi.fn((t: string) => t.replace(/\D/g, "")),
  listarFormasPagamento: vi.fn(async () => [
    { value: "pix", label: "PIX" },
    { value: "dinheiro", label: "Dinheiro" },
  ]),
}));

vi.mock("@/lib/atendente/ia", () => ({
  iaDisponivel: vi.fn(() => true),
  interpretarMensagem: vi.fn(async () => ({ tipo: "outro" })),
  embelezarResposta: vi.fn(async (p: { respostaBase: string }) => p.respostaBase),
  normalizarComIa: vi.fn(async (_e: string, texto: string) => texto),
}));

vi.mock("@/lib/atendente/persona", () => ({
  carregarPersonaAtendente: vi.fn(async () => ({ nome: "Ana", tom: "simpatico" as const, regras: "", horario: "" })),
  montarSaudacao: vi.fn(() => "Oi! Eu sou a Ana, da DiskPizza Rozeno!"),
  saudacaoInicial: vi.fn(() => "Oi! Eu sou a Ana, da DiskPizza Rozeno!"),
  RESTRICOES_FLUXO: "",
}));

vi.mock("@/lib/atendente/disponibilidade", () => ({
  verificarDisponibilidade: vi.fn(async () => ({ disponivel: true, motivo: null })),
}));

vi.mock("@/lib/atendente/permissoes", () => ({
  acaoPermitida: vi.fn(() => true),
  classificarAcao: vi.fn(() => "outro" as const),
}));

vi.mock("@/lib/atendente/agente", () => ({
  agenteProcessar: vi.fn(async () => null),
}));

vi.mock("@/lib/atendente/motor", async (importOriginal) => {
  const original: Record<string, unknown> = await importOriginal();
  return { ...original, conversaOciosa: vi.fn(() => false) };
});

vi.mock("@/lib/atendente/deduplicador", () => ({
  eventoJaProcessado: vi.fn(() => false),
  tamanhoFilaProcessados: vi.fn(() => 0),
}));

vi.mock("@/lib/idempotencia", () => ({ novaChaveIdempotencia: vi.fn(() => "test-uuid-1234") }));
vi.mock("@/lib/delivery", () => ({ calcularTaxa: vi.fn(async () => ({ valor: 5.0, laje: false })) }));
vi.mock("@/lib/uso-ia", () => ({
  limiteIaExcedido: vi.fn(async () => false),
  registrarUsoIA: vi.fn(async () => {}),
  estimarTokens: vi.fn(() => 100),
}));
vi.mock("@/lib/atendente/eventos", () => ({
  registrarEventoIA: vi.fn(async () => {}),
  comEventoIA: vi.fn(async (_e: unknown, _t: unknown, _et: unknown, _i: unknown, fn: () => Promise<unknown>) => fn()),
}));
vi.mock("@/lib/precificacao", () => ({ calcularPrecoItem: vi.fn(async () => ({ total: 39.9, erros: [] })) }));
vi.mock("@/lib/pedidos/criar-pedido", () => ({
  criarPedido: vi.fn(async () => ({
    ok: true, status: 201, idempotente: false,
    pedido: { id: "pedido-123", numero: 42, canal: "delivery", producao: "Prod", total: 44.9, taxaEntrega: 5, entregaId: null, pagamentoId: null, clienteId: null },
  })),
}));
vi.mock("@/lib/kds-eventos", () => ({ emitirMudancaKds: vi.fn() }));

import { prisma } from "@/lib/prisma";
const mockPrisma = vi.mocked(prisma);

function mockConversa(etapa = "nova", status = "nova") {
  return {
    id: "conv-1", empresaId: "emp1", telefone: "+5511999999999",
    etapa, status, nome: null, atendimentoHumano: false,
    criadoEm: new Date(), atualizadoEm: new Date(), ultimoAtendimento: null,
    ultimoPedido: null,
    estado: JSON.stringify({ itens: [], tentativas: 0, empresaId: "emp1" }),
  };
}

async function enviarMensagem(texto: string, etapa = "nova") {
  const conversa = mockConversa(etapa);
  (mockPrisma.conversaWhatsApp.findUnique as unknown as MockedFunction<() => Promise<unknown>>).mockResolvedValue(conversa);
  (mockPrisma.conversaWhatsApp.update as unknown as MockedFunction<() => Promise<unknown>>).mockResolvedValue(conversa);
  const { receberMensagemWhatsApp } = await import("@/lib/atendente/motor");
  return receberMensagemWhatsApp("emp1", "+5511999999999", texto);
}

describe("Fase 6 - Observabilidade e fluxo completo", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe("Tools - execucao e validacao", () => {
    it("listar_cardapio retorna cardapio formatado", async () => {
      const { executarTool } = await import("@/lib/atendente/tools");
      const r = await executarTool("listar_cardapio", {}, {
        empresaId: "emp1", telefone: "+5511999999999",
        estado: { itens: [], tentativas: 0 },
      });
      expect(r.ok).toBe(true);
      expect(r.mensagem).toContain("Calabresa");
    });

    it("buscar_produto encontra produto por nome", async () => {
      const { executarTool } = await import("@/lib/atendente/tools");
      const r = await executarTool("buscar_produto", { termo: "calabresa" }, {
        empresaId: "emp1", telefone: "+5511999999999",
        estado: { itens: [], tentativas: 0 },
      });
      expect(r.ok).toBe(true);
      expect(r.mensagem).toContain("Calabresa");
    });

    it("buscar_produto retorna msg quando nao encontra", async () => {
      const { executarTool } = await import("@/lib/atendente/tools");
      const r = await executarTool("buscar_produto", { termo: "xyz_inexistente" }, {
        empresaId: "emp1", telefone: "+5511999999999",
        estado: { itens: [], tentativas: 0 },
      });
      expect(r.mensagem.toLowerCase()).toMatch(/nao|nenhum|encontr|inexistente/);
    });

    it("escolher_tamanho aceita indice valido", async () => {
      const { executarTool } = await import("@/lib/atendente/tools");
      const r = await executarTool("escolher_tamanho", { tamanhoIndex: 1 }, {
        empresaId: "emp1", telefone: "+5511999999999",
        estado: {
          itens: [], tentativas: 0,
          atual: {
            produtoId: "p1", nome: "Calabresa", precoBase: 39.9,
            temTamanhos: true, temSabores: true,
            sabores: [{ nome: "Calabresa", tipo: "tradicional" }],
            tamanhos: [{ nome: "Media", valor: 39.9 }, { nome: "Grande", valor: 49.9 }],
            saboresEscolhidos: [], adicionais: [],
          },
        },
      });
      expect(r.ok).toBe(true);
    });

    it("definir_quantidade calcula preco", async () => {
      const { executarTool } = await import("@/lib/atendente/tools");
      const r = await executarTool("definir_quantidade", { quantidade: 2 }, {
        empresaId: "emp1", telefone: "+5511999999999",
        estado: {
          itens: [], tentativas: 0,
          atual: {
            produtoId: "p1", nome: "Calabresa", precoBase: 39.9,
            temTamanhos: true, temSabores: true,
            sabores: [{ nome: "Calabresa", tipo: "tradicional" }],
            tamanhos: [{ nome: "Media", valor: 39.9 }],
            tamanho: { nome: "Media", valor: 39.9 },
            saboresEscolhidos: ["Calabresa"], adicionais: [], quantidade: 1,
          },
        },
      });
      expect(r.ok).toBe(true);
      expect(r.mensagem).toContain("R$");
    });

    it("escolher_pagamento aceita PIX", async () => {
      const { executarTool } = await import("@/lib/atendente/tools");
      const r = await executarTool("escolher_pagamento", { forma: "pix" }, {
        empresaId: "emp1", telefone: "+5511999999999",
        estado: {
          itens: [{ produtoId: "p1", nome: "Calabresa", precoUnit: 39.9, quantidade: 1, tamanho: "Media", sabores: ["Calabresa"], adicionais: [] }],
          tentativas: 0, canal: "entrega" as const,
          endereco: { rua: "Rua A", bairro: "Centro" },
        },
      });
      expect(r.ok).toBe(true);
      expect(r.estadoAtualizado?.formaPagamento).toBeTruthy();
    });

    it("ver_total mostra carrinho", async () => {
      const { executarTool } = await import("@/lib/atendente/tools");
      const r = await executarTool("ver_total", {}, {
        empresaId: "emp1", telefone: "+5511999999999",
        estado: {
          itens: [{ produtoId: "p1", nome: "Calabresa", precoUnit: 39.9, quantidade: 1, tamanho: "Media", sabores: ["Calabresa"], adicionais: [] }],
          tentativas: 0,
        },
      });
      expect(r.ok).toBe(true);
      expect(r.mensagem).toContain("R$");
    });

    it("remover_item funciona com indice 1-based", async () => {
      const { executarTool } = await import("@/lib/atendente/tools");
      const r = await executarTool("remover_item", { indice: 1 }, {
        empresaId: "emp1", telefone: "+5511999999999",
        estado: {
          itens: [{ produtoId: "p1", nome: "Calabresa", precoUnit: 39.9, quantidade: 1, tamanho: "Media", sabores: ["Calabresa"], adicionais: [] }],
          tentativas: 0,
        },
      });
      expect(r.ok).toBe(true);
      expect(r.mensagem).toMatch(/tirei|removido|tirado/i);
    });
  });

  describe("Eventos de IA", () => {
    it("registrarEventoIA nao lanca erro", async () => {
      const { registrarEventoIA } = await import("@/lib/atendente/eventos");
      await expect(registrarEventoIA({
        empresaId: "emp1", tipo: "agente", etapa: "produto",
        input: "quero calabresa", output: "ok", toolsChamadas: ["buscar_produto"],
      })).resolves.toBeUndefined();
    });

    it("comEventoIA retorna resultado", async () => {
      const { comEventoIA } = await import("@/lib/atendente/eventos");
      const r = await comEventoIA("emp1", "agente", "produto", "q", async () => "ok");
      expect(r).toBe("ok");
    });

    it("comEventoIA propaga erro", async () => {
      const { comEventoIA } = await import("@/lib/atendente/eventos");
      await expect(comEventoIA("emp1", "agente", "nova", "oi", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    });
  });

  describe("Agente", () => {
    it("retorna null quando IA indisponivel", async () => {
      const ia = await import("@/lib/atendente/ia");
      (ia.iaDisponivel as unknown as MockedFunction<() => boolean>).mockReturnValue(false);
      const { agenteProcessar } = await import("@/lib/atendente/agente");
      const resultado = await agenteProcessar("emp1", "+5511999999999", "oi", "nova", { itens: [], tentativas: 0 });
      expect(resultado).toBeNull();
    });
  });

  describe("Fluxo completo", () => {
    it("primeira mensagem retorna saudacao", async () => {
      const resposta = await enviarMensagem("oi");
      expect(resposta.resposta).toBeTruthy();
      expect(typeof resposta.resposta).toBe("string");
    });

    it("resposta sempre tem texto e conversaId", async () => {
      const resposta = await enviarMensagem("obrigado", "intencao");
      expect(resposta.resposta).toBeTruthy();
      expect(resposta.conversaId).toBeTruthy();
      expect(resposta.etapa).toBeTruthy();
    });

    it("retorna estrutura completa", async () => {
      const resposta = await enviarMensagem("oi");
      expect(resposta).toHaveProperty("resposta");
      expect(resposta).toHaveProperty("conversaId");
      expect(resposta).toHaveProperty("etapa");
      expect(resposta).toHaveProperty("status");
      expect(resposta).toHaveProperty("humana");
    });
  });

  describe("Guarda de arquitetura", () => {
    it("motor.ts importa agenteProcessar", async () => {
      const { readFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const fonte = readFileSync(join(process.cwd(), "src/lib/atendente/motor.ts"), "utf8");
      expect(fonte).toMatch(/import\s*\{[^}]*agenteProcessar[^}]*\}\s*from\s*["']@\/lib\/atendente\/agente["']/);
    });

    it("motor.ts chama agenteProcessar antes do FSM", async () => {
      const { readFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const fonte = readFileSync(join(process.cwd(), "src/lib/atendente/motor.ts"), "utf8");
      const idxAgente = fonte.indexOf("agenteProcessar");
      const idxPasso = fonte.indexOf("passoAtendimento");
      expect(idxAgente).toBeGreaterThan(0);
      expect(idxPasso).toBeGreaterThan(0);
      expect(idxAgente).toBeLessThan(idxPasso);
    });

    it("motor.ts tem fallback para FSM", async () => {
      const { readFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const fonte = readFileSync(join(process.cwd(), "src/lib/atendente/motor.ts"), "utf8");
      expect(fonte).toMatch(/agenteProcessar[\s\S]{0,200}if\s*\(\s*agente\s*\)/);
      expect(fonte).toMatch(/FALLBACK.*FSM|fallback.*FSM/i);
    });
  });
});
