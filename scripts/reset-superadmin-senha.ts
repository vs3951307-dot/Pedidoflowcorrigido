import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const novaSenha = process.argv[2] || "admin123";
  const email = "superadmin@pedidoflow.com.br";

  const hash = await bcrypt.hash(novaSenha, 10);

  const updated = await prisma.superAdmin.update({
    where: { email },
    data: { senhaHash: hash },
  });

  console.log(`✅ Senha do super admin redefinida com sucesso!`);
  console.log(`   Email: ${email}`);
  console.log(`   Nova senha: ${novaSenha}`);
}

main()
  .catch((e) => {
    console.error("❌ Erro:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
