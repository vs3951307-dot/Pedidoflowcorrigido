import { prisma } from "@/lib/prisma";

/**
 * Verifica se a empresa pode criar mais um usuário, segundo o limite do
 * plano contratado (PEDIDO 35: "POST /api/usuarios deve verificar
 * limite do plano antes de criar. Retornar mensagem amigável quando
 * atingir. Não HTTP 500."). Antes, não havia NENHUMA verificação — o
 * limite existia só como número no cadastro do plano, sem afetar nada.
 *
 * `null` em `limiteUsuarios` (no Plano) = ilimitado — nunca bloqueia.
 * Sem plano vinculado à empresa = também ilimitado (mais seguro que
 * travar uma empresa por falta de configuração).
 */
export async function verificarLimiteUsuarios(
  empresaId: string
): Promise<{ permitido: boolean; limite: number | null; atual: number }> {
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { planoAtual: { select: { limiteUsuarios: true } } },
  });
  const limite = empresa?.planoAtual?.limiteUsuarios ?? null;
  if (limite === null) {
    return { permitido: true, limite: null, atual: 0 };
  }
  const atual = await prisma.usuario.count({ where: { empresaId, ativo: true } });
  return { permitido: atual < limite, limite, atual };
}

/**
 * Mesmo princípio, para o limite de PRODUTOS do plano (PEDIDO 69 —
 * item explícito na lista de limites do construtor de planos, que não
 * existia em lugar nenhum antes desta correção).
 */
export async function verificarLimiteProdutos(
  empresaId: string
): Promise<{ permitido: boolean; limite: number | null; atual: number }> {
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { planoAtual: { select: { limiteProdutos: true } } },
  });
  const limite = empresa?.planoAtual?.limiteProdutos ?? null;
  if (limite === null) {
    return { permitido: true, limite: null, atual: 0 };
  }
  const atual = await prisma.produto.count({ where: { empresaId, ativo: true } });
  return { permitido: atual < limite, limite, atual };
}
