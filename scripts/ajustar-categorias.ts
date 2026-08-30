import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const NOVAS_CATEGORIAS = [
  "Pizzas Tradicionais",
  "Pizzas Especiais",
  "Pizzas Doces",
  "Porções",
  "Refrigerantes",
  "Lanches Artesanais",
  "Lanches",
  "Adicionais",
];

async function main() {
  const empresaId = process.argv[2];
  if (!empresaId) {
    console.error("Uso: npx tsx scripts/ajustar-categorias.ts <empresaId>");
    process.exit(1);
  }

  const existentes = await prisma.categoria.findMany({
    where: { empresaId },
    orderBy: { ordem: "asc" },
  });

  console.log(`\n📋 Categorias existentes (${existentes.length}):`);
  existentes.forEach((c) => console.log(`   - ${c.nome} (ordem: ${c.ordem}, ativo: ${c.ativo})`));

  // Mapeamento: nome antigo → nome novo (para manter vinculação com produtos)
  const MAPA: Record<string, string> = {
    "Pizzas salgadas": "Pizzas Tradicionais",
    "Pizzas doces": "Pizzas Doces",
    "Lanches": "Lanches",
    "Burguers artesanais": "Lanches Artesanais",
    "Porções": "Porções",
    "Bebidas": "Refrigerantes",
  };

  // 1. Renomeia categorias existentes que têm correspondência
  for (const cat of existentes) {
    const novoNome = MAPA[cat.nome];
    if (novoNome && novoNome !== cat.nome) {
      await prisma.categoria.update({
        where: { id: cat.id },
        data: { nome: novoNome },
      });
      console.log(`✅ Renomeada: "${cat.nome}" → "${novoNome}"`);
    }
  }

  // 2. Cria categorias que ainda não existem
  const categoriasFinal = await prisma.categoria.findMany({
    where: { empresaId },
    orderBy: { ordem: "asc" },
  });
  const nomesExistentes = new Set(categoriasFinal.map((c) => c.nome));

  for (let i = 0; i < NOVAS_CATEGORIAS.length; i++) {
    const nome = NOVAS_CATEGORIAS[i];
    if (!nomesExistentes.has(nome)) {
      await prisma.categoria.create({
        data: { empresaId, nome, ordem: categoriasFinal.length + i, ativo: true },
      });
      console.log(`➕ Criada: "${nome}"`);
    }
  }

  // 3. Reordena tudo na ordem desejada
  const todas = await prisma.categoria.findMany({
    where: { empresaId },
    orderBy: { ordem: "asc" },
  });

  for (let i = 0; i < NOVAS_CATEGORIAS.length; i++) {
    const cat = todas.find((c) => c.nome === NOVAS_CATEGORIAS[i]);
    if (cat && cat.ordem !== i) {
      await prisma.categoria.update({
        where: { id: cat.id },
        data: { ordem: i },
      });
    }
  }

  const final = await prisma.categoria.findMany({
    where: { empresaId },
    orderBy: { ordem: "asc" },
  });

  console.log(`\n📋 Categorias finais (${final.length}):`);
  final.forEach((c) => console.log(`   ${c.ordem + 1}. ${c.nome}`));
}

main()
  .catch((e) => {
    console.error("❌ Erro:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
