import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizar } from "@/lib/acesso";
import { comTratamentoDeErro } from "@/lib/api-erro";

/** Cliente + endereços + histórico de pedidos (PEDIDO 17). */
export const GET = comTratamentoDeErro("clientes.id.GET", async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const acesso = await autorizar("clientes");
  if (!acesso.ok) return acesso.resposta;

  const cliente = await prisma.cliente.findFirst({
    where: { id: params.id, empresaId: acesso.empresaId },
    include: { enderecos: true },
  });
  if (!cliente) {
    return NextResponse.json({ erro: "Cliente não encontrado." }, { status: 404 });
  }

  const pedidos = await prisma.pedido.findMany({
    where: { clienteId: cliente.id, empresaId: acesso.empresaId },
    include: { pagamentos: true, entrega: true },
    orderBy: { criadoEm: "desc" },
    take: 50,
  });

  return NextResponse.json({
    cliente: {
      id: cliente.id,
      nome: cliente.nome,
      telefone: cliente.telefone,
      email: cliente.email,
      criadoEm: cliente.criadoEm.toISOString(),
      enderecos: cliente.enderecos.map((e) => ({
        id: e.id,
        rotulo: e.rotulo,
        rua: e.rua,
        bairro: e.bairro,
        cidade: e.cidade,
        cep: e.cep,
        complemento: e.complemento,
        referencia: e.referencia,
      })),
    },
    historico: pedidos.map((p) => ({
      id: p.id,
      numero: p.numero,
      canal: p.canal,
      status: p.status,
      total: p.total,
      taxaEntrega: p.taxaEntrega,
      criadoEm: p.criadoEm.toISOString(),
      pagamento: p.pagamentos[0] ? { forma: p.pagamentos[0].forma, valor: p.pagamentos[0].valor, status: p.pagamentos[0].status } : null,
      entregaStatus: p.entrega?.status ?? null,
    })),
  });
});
