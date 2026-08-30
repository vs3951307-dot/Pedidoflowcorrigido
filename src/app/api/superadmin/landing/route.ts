import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizarSuperAdmin } from "@/lib/super-admin/auth";
import { parseLandingConteudo, serializarLandingConteudo, LANDING_PADRAO, type LandingConteudo } from "@/lib/landing-config";
import { comTratamentoDeErro } from "@/lib/api-erro";

/**
 * GET/PUT /api/superadmin/landing — o Super Admin edita o conteúdo da
 * landing page (logo, banner, textos, cores, WhatsApp de contato,
 * segmentos em destaque) sem tocar em código. Os planos/preços NÃO são
 * editados aqui — isso é em `/api/superadmin/planos` (fonte única de
 * verdade, sem duplicar preço em dois lugares).
 */
/** `null` é `object` em JS — este guarda evita gravar `null` por cima de uma seção. */
function objeto(valor: unknown): valor is Record<string, unknown> {
  return !!valor && typeof valor === "object" && !Array.isArray(valor);
}

export const GET = comTratamentoDeErro("superadmin.landing.GET", async () => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;

  const registro = await prisma.landingConfig.findUnique({ where: { id: "landing" } });
  const conteudo = registro ? parseLandingConteudo(registro.conteudo) : LANDING_PADRAO;
  return NextResponse.json({ conteudo });
});

export const PUT = comTratamentoDeErro("superadmin.landing.PUT", async (req: NextRequest) => {
  const acesso = await autorizarSuperAdmin();
  if (!acesso.ok) return acesso.resposta;

  const corpo = await req.json().catch(() => null);
  if (!corpo || typeof corpo !== "object") {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  const atual = await prisma.landingConfig.findUnique({ where: { id: "landing" } });
  const conteudoAtual = atual ? parseLandingConteudo(atual.conteudo) : LANDING_PADRAO;

  // Mescla raso: só sobrescreve as seções enviadas, preserva o resto.
  // O spread de `conteudoAtual` na primeira linha é o que garante que as
  // seções do layout comercial (recursos, passos, depoimentos, rodapé…)
  // sobrevivam a um PUT vindo de um editor que ainda não conhece esses campos.
  const novoConteudo: LandingConteudo = {
    ...conteudoAtual,
    marca: { ...conteudoAtual.marca, ...(corpo.marca ?? {}) },
    hero: { ...conteudoAtual.hero, ...(corpo.hero ?? {}) },
    modulosVitrine: Array.isArray(corpo.modulosVitrine) ? corpo.modulosVitrine : conteudoAtual.modulosVitrine,
    segmentos: Array.isArray(corpo.segmentos) ? corpo.segmentos : conteudoAtual.segmentos,
    segmentosNota: typeof corpo.segmentosNota === "string" ? corpo.segmentosNota : conteudoAtual.segmentosNota,
    iaDestaque: typeof corpo.iaDestaque === "string" ? corpo.iaDestaque : conteudoAtual.iaDestaque,
    ctaFinal: { ...conteudoAtual.ctaFinal, ...(corpo.ctaFinal ?? {}) },

    // Seções do layout comercial. Só sobrescreve quando vem algo com a forma
    // esperada — um campo ausente (editor antigo) mantém o valor atual.
    navegacao: Array.isArray(corpo.navegacao) ? corpo.navegacao : conteudoAtual.navegacao,
    heroEstatisticas: Array.isArray(corpo.heroEstatisticas) ? corpo.heroEstatisticas : conteudoAtual.heroEstatisticas,
    recursos: objeto(corpo.recursos) ? { ...conteudoAtual.recursos, ...corpo.recursos } : conteudoAtual.recursos,
    comoFunciona: objeto(corpo.comoFunciona) ? { ...conteudoAtual.comoFunciona, ...corpo.comoFunciona } : conteudoAtual.comoFunciona,
    dispositivos: objeto(corpo.dispositivos) ? { ...conteudoAtual.dispositivos, ...corpo.dispositivos } : conteudoAtual.dispositivos,
    beneficios: objeto(corpo.beneficios) ? { ...conteudoAtual.beneficios, ...corpo.beneficios } : conteudoAtual.beneficios,
    depoimentos: objeto(corpo.depoimentos) ? { ...conteudoAtual.depoimentos, ...corpo.depoimentos } : conteudoAtual.depoimentos,
    planosSecao: { ...conteudoAtual.planosSecao, ...(corpo.planosSecao ?? {}) },
    rodape: objeto(corpo.rodape) ? { ...conteudoAtual.rodape, ...corpo.rodape } : conteudoAtual.rodape,
  };

  await prisma.landingConfig.upsert({
    where: { id: "landing" },
    create: { id: "landing", conteudo: serializarLandingConteudo(novoConteudo) },
    update: { conteudo: serializarLandingConteudo(novoConteudo) },
  });

  return NextResponse.json({ ok: true, conteudo: novoConteudo });
});
