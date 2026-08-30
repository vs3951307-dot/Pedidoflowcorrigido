import { NextRequest } from "next/server";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { autorizar } from "@/lib/acesso";
import { assinarMudancaKds } from "@/lib/kds-eventos";

/**
 * SSE do painel da cozinha (PEDIDO 15): mantém a conexão aberta e emite
 * `event: mudanca` sempre que a produção muda (pedido criado, status
 * alterado, pagamento/entrega que finaliza). O cliente usa os eventos
 * como sinal para recarregar a lista; se a conexão cair, o KDS faz
 * polling como fallback.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

async function GETTenant(req: NextRequest) {
  const acesso = await autorizar("kds");
  if (!acesso.ok) return acesso.resposta;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controlador) {
      let aberto = true;
      const enviar = (dados: string, evento?: string) => {
        if (!aberto) return;
        try {
          controlador.enqueue(
            encoder.encode(
              `${evento ? `event: ${evento}\n` : ""}data: ${dados}\n\n`
            )
          );
        } catch {
          // stream fechada
        }
      };

      enviar(JSON.stringify({ ok: true, conectado: true }), "conectado");

      const desassinar = assinarMudancaKds(acesso.empresaId, () => {
        enviar(JSON.stringify({ ok: true, mudanca: true }), "mudanca");
      });

      const batimento = setInterval(() => {
        enviar(`: ${new Date().toISOString()}`);
      }, HEARTBEAT_MS);

      req.signal.addEventListener("abort", () => {
        aberto = false;
        clearInterval(batimento);
        desassinar();
        try {
          controlador.close();
        } catch {
          // já fechada
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export const GET = comTratamentoDeErro("kds.eventos.GET", GETTenant);
