import { Prisma } from "@prisma/client";

/**
 * Próximo número de pedido, ATÔMICO e AUTO-CORRETIVO por empresa.
 *
 * POR QUE NÃO `MAX(numero) + 1` DIRETO: no isolamento padrão do Postgres
 * (READ COMMITTED), duas transações leem o mesmo MAX antes de qualquer
 * uma gravar, e a segunda estoura a constraint `@@unique([empresaId,
 * numero])` como erro 500. Por isso o número vem de um contador cuja
 * linha o banco trava durante o UPDATE, serializando as chamadas
 * concorrentes sem retry.
 *
 * POR QUE TAMBÉM CONSULTAR `MAX(numero)` (correção de bug confirmado):
 * a versão anterior fazia um `upsert` que, ao CRIAR a linha, começava
 * fixo em 1001 e, ao atualizar, apenas somava 1. Isso quebra sempre que
 * existem pedidos que NÃO passaram por esta função:
 *
 *   - tenant migrado de outro sistema/planilha, com histórico importado;
 *   - restauração de backup só da tabela `Pedido`;
 *   - o próprio seed, que insere 155 pedidos com número explícito.
 *
 * Nesses casos o contador nascia (ou ficava) ATRÁS do maior número já
 * usado e o PRÓXIMO PEDIDO REAL falhava com "Unique constraint failed on
 * (empresaId, numero)" — HTTP 500 no PDV, venda travada. Reproduzido em
 * teste: o seed sincronizava o contador ANTES de criar o último pedido
 * (o do WhatsApp), deixando-o exatamente um número atrás.
 *
 * A instrução abaixo resolve os dois problemas de uma vez, numa única
 * ida ao banco e sem janela de corrida:
 *
 *   - `INSERT ... ON CONFLICT DO UPDATE` trava a linha do contador, então
 *     chamadas concorrentes continuam serializadas pelo banco;
 *   - `GREATEST(ultimoNumero + 1, MAX(numero) + 1)` garante que o número
 *     devolvido é maior que o último emitido pelo contador E maior que
 *     qualquer número já presente na tabela `Pedido`. Um contador
 *     atrasado se auto-corrige na primeira chamada, sem intervenção
 *     manual e sem nunca reaproveitar um número.
 *
 * Precisa ser chamado DENTRO da mesma `$transaction` que cria o Pedido —
 * se o pedido falhar depois por outro motivo, o incremento é revertido
 * junto (rollback) e o número não é desperdiçado.
 */
export async function proximoNumeroPedido(
  tx: Prisma.TransactionClient,
  empresaId: string
): Promise<number> {
  const linhas = await tx.$queryRaw<{ ultimoNumero: number }[]>`
    INSERT INTO "ContadorPedido" ("empresaId", "ultimoNumero")
    VALUES (
      ${empresaId},
      (SELECT COALESCE(MAX("numero"), 1000) + 1 FROM "Pedido" WHERE "empresaId" = ${empresaId})
    )
    ON CONFLICT ("empresaId") DO UPDATE
      SET "ultimoNumero" = GREATEST(
        "ContadorPedido"."ultimoNumero" + 1,
        (SELECT COALESCE(MAX("numero"), 1000) + 1 FROM "Pedido" WHERE "empresaId" = ${empresaId})
      )
    RETURNING "ultimoNumero"
  `;
  const numero = linhas[0]?.ultimoNumero;
  if (typeof numero !== "number") {
    throw new Error(`Não foi possível gerar o número do pedido para a empresa ${empresaId}.`);
  }
  return numero;
}
