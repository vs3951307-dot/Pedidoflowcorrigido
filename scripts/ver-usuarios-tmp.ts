import { prisma } from "../src/lib/prisma";

async function main() {
  const usuarios = await prisma.usuario.findMany({
    select: { id: true, nome: true, email: true, papel: true, ativo: true, empresa: { select: { nome: true } } },
    orderBy: { email: "asc" },
  });
  for (const u of usuarios) {
    console.log(`${u.papel}\t${u.ativo ? "ativo" : "INATIVO"}\t${u.nome}\t${u.email}\t${u.empresa.nome}`);
  }
}

main().finally(() => prisma.$disconnect());
