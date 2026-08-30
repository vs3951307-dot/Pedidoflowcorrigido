/**
 * Reseta a senha de um Super Admin existente (idempotente, NAO apaga dados).
 *
 * Uso:
 *   SUPERADMIN_EMAIL="superadmin@pedidoflow.com.br" \
 *   NOVA_SENHA="novaSenhaForte123" \
 *   npm run db:resetar-senha-super-admin
 *
 * - Se o e-mail nao existir, pergunta se quer criar (usa SUPERADMIN_NOME opcional).
 * - Sempre gera novo bcrypt hash; a senha anterior para de funcionar.
 */

import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { plataformaPrisma } from "@/lib/prisma";

const rl = readline.createInterface({ input: stdin, output: stdout });

async function main() {
  const email = (process.env.SUPERADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!email) {
    console.error("❌ Defina SUPERADMIN_EMAIL.");
    process.exitCode = 1;
    return;
  }

  const existente = await plataformaPrisma.superAdmin.findUnique({ where: { email } });

  let senha = process.env.NOVA_SENHA?.trim();
  if (!senha) {
    senha = await rl.question("Nova senha (deixe vazio para gerar uma aleatoria): ");
    if (!senha.trim()) {
      senha = crypto.randomBytes(9).toString("base64url");
      console.log(`🔑 Senha gerada: ${senha}`);
    }
  }

  if (senha.length < 8) {
    console.error("❌ A senha deve ter pelo menos 8 caracteres.");
    process.exitCode = 1;
    return;
  }

  const hash = bcrypt.hashSync(senha, 10);

  if (existente) {
    await plataformaPrisma.superAdmin.update({
      where: { id: existente.id },
      data: { senhaHash: hash },
    });
    // Invalida sessoes anteriores por seguranca.
    await plataformaPrisma.sessaoSuperAdmin.deleteMany({ where: { superAdminId: existente.id } });
    console.log(`\n✅ Senha atualizada para ${email}.`);
    console.log("   Todas as sessoes anteriores foram encerradas.");
  } else {
    const criar = await rl.question(`Super Admin ${email} nao existe. Criar agora? (s/N): `);
    if (criar.trim().toLowerCase() !== "s") {
      console.log("Cancelado.");
      return;
    }
    const nome = process.env.SUPERADMIN_NOME?.trim() || "Super Admin PedidoFlow";
    await plataformaPrisma.superAdmin.create({ data: { nome, email, senhaHash: hash, ativo: true } });
    console.log(`\n✅ Super Admin criado: ${email}`);
  }

  console.log(`   Acesse: /superadmin/login\n`);
}

main()
  .catch((erro) => {
    console.error("❌ Falha:", erro);
    process.exitCode = 1;
  })
  .finally(async () => {
    await plataformaPrisma.$disconnect().catch(() => null);
    rl.close();
  });
