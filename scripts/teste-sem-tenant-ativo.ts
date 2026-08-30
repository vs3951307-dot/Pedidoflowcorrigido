/**
 * Auxiliar do teste de isolamento — roda em processo NOVO (sem nenhuma
 * chamada anterior a `ativarTenant`) e tenta usar um model de tenant.
 * Espera-se que isto LANCE ERRO (ver src/lib/prisma.ts,
 * `clienteDoTenantOuFalha`). Chamado por teste-isolamento-real.ts.
 */
import { prisma } from "@/lib/prisma";

prisma.produto
  .findMany()
  .then(() => {
    console.error("ERRO DE TESTE: não deveria ter conseguido consultar sem tenant ativo.");
    process.exit(1);
  })
  .catch((e: Error) => {
    console.error(e.message);
    process.exit(1); // saída != 0 é o comportamento esperado deste auxiliar
  });
