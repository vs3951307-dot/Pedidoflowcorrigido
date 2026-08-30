import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar, registrarAuditoria } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";
import {
  enfileirarAutomatica,
  gerarConteudoFechamentoCaixa,
  referenciaCaixa,
  lerImpressoras,
  destinoRealDoTipo,
} from "@/lib/impressao";

export const POST = comTratamentoDeErro("caixa.fechar.POST", async () => {
  const acesso = await autorizar("caixa");
  if (!acesso.ok) return acesso.resposta;
  const empresaId = acesso.empresaId;
  const caixa = await prisma.caixa.findFirst({ where: { empresaId, status: "aberto" }, orderBy: { abertoEm: "desc" } });
  if (!caixa) {
    return NextResponse.json({ erro: "Nenhum caixa aberto." }, { status: 409 });
  }

  const movimentacoes = await prisma.movimentacaoCaixa.findMany({ where: { empresaId, caixaId: caixa.id } });

  let vendasDinheiro = 0;
  let vendasOutras = 0;
  let trocos = 0;
  let sangrias = 0;
  let entradas = 0;
  for (const m of movimentacoes) {
    if (m.tipo === "venda") {
      if (m.metodo === "dinheiro") vendasDinheiro += m.valor;
      else vendasOutras += m.valor;
    } else if (m.tipo === "troco") trocos += m.valor;
    else if (m.tipo === "sangria") sangrias += m.valor;
    else if (m.tipo === "entrada") entradas += m.valor;
  }

  await prisma.caixa.update({
    where: { id: caixa.id },
    data: { status: "fechado", fechadoEm: new Date() },
  });
  await registrarAuditoria("caixa_fechado", `Caixa fechado (saldo inicial R$ ${caixa.saldoInicial.toFixed(2).replace(".", ",")})`, acesso.usuario, undefined, empresaId);

  // Impressão automática do relatório de fechamento (PEDIDO 16).
  const conteudo = await gerarConteudoFechamentoCaixa(empresaId, caixa.id);
  if (conteudo) {
    const impressoras = await lerImpressoras(empresaId);
    await enfileirarAutomatica(empresaId, {
      tipo: "fechamento-caixa",
      destino: destinoRealDoTipo("fechamento-caixa", impressoras),
      referencia: referenciaCaixa(caixa.id),
      conteudo,
    });
  }

  return NextResponse.json({
    ok: true,
    resumo: {
      saldoInicial: caixa.saldoInicial,
      vendasDinheiro,
      vendasOutras,
      trocos,
      sangrias,
      entradas,
      dinheiroEmCaixa: caixa.saldoInicial + vendasDinheiro - trocos - sangrias + entradas,
    },
  });
});
