/**
 * Cria o PRIMEIRO Super Admin, de forma SEGURA e NÃO DESTRUTIVA.
 *
 * PEDIDO 3 ("primeiro Super Admin / primeiro login — bloqueador de
 * deploy"): antes deste script, a ÚNICA forma de conseguir um Super
 * Admin era `npm run db:seed` — que APAGA E RECRIA o banco inteiro,
 * incluindo uma empresa de demonstração fake ("Disk Pizza Rozeno") com
 * produtos fake. Para testar o PedidoFlow numa pizzaria REAL, isso é
 * exatamente o que NÃO se quer rodar — o Super Admin criaria a empresa
 * de verdade depois, pelo próprio painel.
 *
 * Este script:
 *   - NUNCA apaga nada (idempotente: se já existe um Super Admin,
 *     informa e não faz nada — não reseta senha, não cria duplicado).
 *   - Só cria a linha de SuperAdmin (schema `public`, plataforma) —
 *     nunca toca em Empresa/Usuario/dado de tenant nenhum.
 *   - Gera uma senha ALEATÓRIA seguida por bcrypt, impressa em texto
 *     puro SÓ nesta execução, no terminal — nunca fica salva em texto
 *     puro em lugar nenhum.
 *   - Aceita e-mail/senha explícitos via variáveis de ambiente
 *     (`SUPERADMIN_EMAIL`/`SUPERADMIN_SENHA`) para setups automatizados
 *     — mas gera valores seguros sozinho se não forem informados.
 *
 * Uso:
 *   npm run db:criar-super-admin
 *
 * Com credenciais explícitas (ex.: pipeline de deploy automatizado):
 *   SUPERADMIN_EMAIL="voce@suaempresa.com" SUPERADMIN_SENHA="..." \
 *     npm run db:criar-super-admin
 */

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { plataformaPrisma } from "@/lib/prisma";

async function main() {
  const existente = await plataformaPrisma.superAdmin.findFirst({ orderBy: { criadoEm: "asc" } });
  if (existente) {
    console.log("\n✅ Já existe Super Admin cadastrado — nada foi alterado.");
    console.log(`   E-mail: ${existente.email}`);
    console.log("   (Esqueceu a senha? Use o fluxo de recuperação de senha do próprio painel,");
    console.log("    ou rode um script de reset dedicado — este script nunca reseta senha existente.)\n");
    return;
  }

  const email = (process.env.SUPERADMIN_EMAIL ?? "superadmin@pedidoflow.com.br").trim().toLowerCase();
  const senha = process.env.SUPERADMIN_SENHA?.trim() || crypto.randomBytes(9).toString("base64url");
  const nome = process.env.SUPERADMIN_NOME?.trim() || "Super Admin PedidoFlow";

  const criado = await plataformaPrisma.superAdmin.create({
    data: {
      nome,
      email,
      senhaHash: bcrypt.hashSync(senha, 10),
      ativo: true,
    },
  });

  console.log("\n✅ Super Admin criado com sucesso.");
  console.log(`   E-mail: ${criado.email}`);
  if (!process.env.SUPERADMIN_SENHA) {
    console.log(`   Senha:  ${senha}`);
    console.log("   (gerada agora — copie e guarde num cofre de senhas; não fica salva em texto puro em lugar nenhum)");
  } else {
    console.log("   Senha:  a que foi definida em SUPERADMIN_SENHA.");
  }
  console.log("\n   Acesse em: /superadmin/login\n");
}

main()
  .catch((erro) => {
    console.error("❌ Falha ao criar o Super Admin:", erro);
    process.exitCode = 1;
  })
  .finally(async () => {
    await plataformaPrisma.$disconnect().catch(() => null);
  });
