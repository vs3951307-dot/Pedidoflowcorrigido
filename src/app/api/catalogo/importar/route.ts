import { NextRequest, NextResponse } from "next/server";

import { autorizar, registrarAuditoria } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { verificarLimiteProdutos } from "@/lib/limites-plano";
import { importarCardapio } from "@/lib/cardapio/importar-cardapio";
import type { AdicionalImportacao, ItemCardapioImportacao } from "@/lib/cardapio/analisar-texto";

const MAX_ITENS = 500;

/**
 * POST /api/catalogo/importar — importa em lote os itens do cardápio
 * (revisados na tela "Importar cardápio"). Produtos com nome já existente
 * na empresa são ignorados (sem duplicar ao reimportar o mesmo cardápio).
 */
export const POST = comTratamentoDeErro("catalogo.importar.POST", async (req: NextRequest) => {
  const acesso = await autorizar("catalogo_editar");
  if (!acesso.ok) return acesso.resposta;

  const corpo = await req.json().catch(() => ({}));
  const { itens, adicionais, sabores } = corpo as {
    itens?: unknown;
    adicionais?: unknown;
    sabores?: unknown;
  };

  if (!Array.isArray(itens) || itens.length === 0) {
    return NextResponse.json({ erro: "Nenhum item para importar." }, { status: 400 });
  }
  if (itens.length > MAX_ITENS) {
    return NextResponse.json(
      { erro: `No máximo ${MAX_ITENS} itens por importação.` },
      { status: 400 }
    );
  }

  const itensValidos: ItemCardapioImportacao[] = [];
  const itensInvalidos: string[] = [];
  for (const item of itens) {
    const r = item as Partial<ItemCardapioImportacao>;
    const nome = typeof r.nome === "string" ? r.nome.trim().slice(0, 120) : "";
    const categoria = typeof r.categoria === "string" ? r.categoria.trim().slice(0, 60) : "";
    const descricao =
      typeof r.descricao === "string" ? r.descricao.trim().slice(0, 300) : undefined;
    if (!nome || !categoria || !Array.isArray(r.tamanhos) || r.tamanhos.length === 0) {
      itensInvalidos.push(nome || "(item sem nome)");
      continue;
    }
    const tamanhos: { nome: string; valor: number }[] = [];
    for (const t of r.tamanhos) {
      const nomeTamanho =
        typeof (t as { nome?: unknown }).nome === "string"
          ? String((t as { nome: string }).nome).trim().slice(0, 40)
          : "";
      const valor = (t as { valor?: unknown }).valor;
      if (
        !nomeTamanho ||
        typeof valor !== "number" ||
        !Number.isFinite(valor) ||
        valor < 0
      ) {
        itensInvalidos.push(nome);
        break;
      }
      tamanhos.push({ nome: nomeTamanho, valor: Math.round(valor * 100) / 100 });
    }
    if (tamanhos.length === 0) continue;
    itensValidos.push({ nome, categoria, descricao, tamanhos });
  }

  if (itensValidos.length === 0) {
    return NextResponse.json(
      { erro: "Nenhum item válido para importar — confira o texto e tente de novo." },
      { status: 400 }
    );
  }

  const adicionaisValidos: AdicionalImportacao[] = [];
  if (Array.isArray(adicionais)) {
    for (const a of adicionais) {
      const nome = (a as { nome?: unknown }).nome;
      const valor = (a as { valor?: unknown }).valor;
      if (
        typeof nome === "string" &&
        nome.trim() &&
        typeof valor === "number" &&
        Number.isFinite(valor) &&
        valor >= 0
      ) {
        adicionaisValidos.push({
          nome: nome.trim().slice(0, 60),
          valor: Math.round(valor * 100) / 100,
        });
      }
    }
  }

  const saboresValidos =
    Array.isArray(sabores) && sabores.length <= 100
      ? sabores.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      : [];

  const limite = await verificarLimiteProdutos(acesso.empresaId);
  if (limite.limite !== null && limite.atual + itensValidos.length > limite.limite) {
    return NextResponse.json(
      {
        erro: `O limite do seu plano é de ${limite.limite} produto(s) ativo(s), e você já tem ${limite.atual}. A importação adicionaria ${itensValidos.length} — desative produtos existentes ou fale com o suporte para ampliar o plano.`,
      },
      { status: 402 }
    );
  }

  const resultado = await importarCardapio(
    acesso.empresaId,
    itensValidos,
    adicionaisValidos,
    saboresValidos
  );

  registrarAuditoria(
    "catalogo.importar",
    `Importados ${resultado.criados} produto(s) do cardápio${
      resultado.ignorados.length
        ? ` (${resultado.ignorados.length} já existiam e foram ignorados)`
        : ""
    }${adicionaisValidos.length ? `; ${adicionaisValidos.length} adicionais` : ""}`,
    acesso.usuario,
    req.headers.get("x-forwarded-for") ?? undefined,
    acesso.empresaId
  );

  return NextResponse.json({
    ok: true,
    criados: resultado.criados,
    ignorados: resultado.ignorados,
    itensInvalidos,
  });
});
