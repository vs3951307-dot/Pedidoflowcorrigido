const { PrismaClient } = require("@prisma/client");
const urlTenant = new URL(process.env.DATABASE_URL);
urlTenant.searchParams.set("schema", "tenant_disk_pizza_rozeno");
const p = new PrismaClient({ datasources: { db: { url: urlTenant.toString() } } });
(async () => {
  try {
    const max = await p.pedido.aggregate({ _max: { numero: true } });
    const maxNumero = max._max.numero ?? 1000;
    const sample = await p.pedido.findFirst({ select: { empresaId: true } });
    if (!sample) { console.log("sem pedidos"); return; }
    const contador = await p.contadorPedido.upsert({
      where: { empresaId: sample.empresaId },
      create: { empresaId: sample.empresaId, ultimoNumero: maxNumero },
      update: { ultimoNumero: maxNumero },
    });
    console.log("empresaId:", sample.empresaId, "| Contador sincronizado -> ultimoNumero:", contador.ultimoNumero, "(max pedido:", maxNumero + ")");
  } catch (e) { console.error("ERRO:", e.message); process.exitCode = 1; }
  finally { await p.$disconnect(); }
})();