import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

const { montarSaudacao, saudacaoInicial } = await import("@/lib/atendente/persona");

interface PersonaAtendente {
  nome: string;
  tom: "simpatico" | "profissional" | "descontraido" | "formal";
  regras: string;
  horario: string;
}

const personaAna: PersonaAtendente = {
  nome: "Ana",
  tom: "simpatico",
  regras: "",
  horario: "",
};

describe("montarSaudacao — saudação única do atendente", () => {
  it("retorna saudação exata com nome da atendente e da loja", () => {
    const resultado = montarSaudacao(personaAna, null, "DiskPizza Rozeno");
    expect(resultado).toBe(
      "Olá! 😊 Eu sou a Ana, atendente da DiskPizza Rozeno! 🍕💜 Como posso ajudar você hoje?"
    );
  });

  it("retorna saudação com nome do cliente quando informado", () => {
    const resultado = montarSaudacao(personaAna, "João", "DiskPizza Rozeno");
    expect(resultado).toBe(
      "Olá, João! 😊 Eu sou a Ana, atendente da DiskPizza Rozeno! 🍕💜 Como posso ajudar você hoje?"
    );
  });

  it("usa 'nossa loja' quando loja não informada", () => {
    const resultado = montarSaudacao(personaAna, null);
    expect(resultado).toBe(
      "Olá! 😊 Eu sou a Ana, atendente da nossa loja! 🍕💜 Como posso ajudar você hoje?"
    );
  });

  it("usa 'nossa loja' quando loja é string vazia", () => {
    const resultado = montarSaudacao(personaAna, null, "");
    expect(resultado).toBe(
      "Olá! 😊 Eu sou a Ana, atendente da nossa loja! 🍕💜 Como posso ajudar você hoje?"
    );
  });

  it("usa 'nossa loja' quando loja é null", () => {
    const resultado = montarSaudacao(personaAna, null, null);
    expect(resultado).toBe(
      "Olá! 😊 Eu sou a Ana, atendente da nossa loja! 🍕💜 Como posso ajudar você hoje?"
    );
  });

  it("NUNCA contém SUGESTAO_INICIAL", () => {
    const resultado = montarSaudacao(personaAna, null, "Loja Teste");
    expect(resultado).not.toContain("pode dizer");
    expect(resultado).not.toContain("pedir");
    expect(resultado).not.toContain("cardápio");
  });

  it("NUNCA contém 'Aqui é a' antes de 'Olá'", () => {
    const resultado = montarSaudacao(personaAna, null, "Loja Teste");
    expect(resultado.startsWith("Olá")).toBe(true);
    expect(resultado).not.toContain("Aqui é a");
  });

  it("sem nome de atendente, retorna saudação genérica", () => {
    const personaSemNome: PersonaAtendente = {
      nome: "",
      tom: "simpatico",
      regras: "",
      horario: "",
    };
    const resultado = montarSaudacao(personaSemNome, null, "Loja X");
    expect(resultado).toBe("Olá! 😊 O que você deseja hoje?");
  });

  it("saudacaoInicial é igual a montarSaudacao", () => {
    const r1 = montarSaudacao(personaAna, null, "Loja");
    const r2 = saudacaoInicial(personaAna, null, "Loja");
    expect(r1).toBe(r2);
  });

  it("sanitiza texto antes de 'Olá' (proteção anti-IA)", () => {
    const resultado = montarSaudacao(personaAna, null, "Loja");
    expect(resultado.startsWith("Olá")).toBe(true);
  });
});
