import { NextRequest } from "next/server";
import { comTratamentoDeErro } from "@/lib/api-erro";
import { autorizar } from "@/lib/acesso";
import { assinarEventosTempoReal, type TopicoEvento } from "@/lib/eventos-tempo-real";

/**
 * SSE genérico multiempresa: mantém a conexão aberta e emite
 * `event: <topico>` (mesa | entrega | pedido | kds | impressao) sempre
 * que algo relevante muda NA MESMA EMPRESA da sessão autenticada.
 *
 * Usado por Mesas/Garçom, Entregas/Entregador e Impressão para saber, em
 * tempo real, quando outro dispositivo já pegou uma entrega, uma mesa
 * mudou de status, ou um item novo entrou na fila de impressão — sem
 * depender só de polling. Se a conexão cair, cada tela mantém seu
 * polling de fallback (nada aqui é obrigatório para o funcionamento).
 *
 * Filtro opcional `?topicos=mesa,entrega` limita quais eventos chegam
 * (economiza tráfego em telas que só se importam com um assunto).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

async function GETTenant(req: NextRequest) {
  const acesso = await autorizar(
    "pdv",
    "salao",
    "kds",
    "entregas",
    "impressao",
    "admin"
  );
  if (!acesso.ok) return acesso.resposta;

  const filtroParam = req.nextUrl.searchParams.get("topicos");
  const filtro = filtroParam
    ? new Set(filtroParam.split(",").map((t) => t.trim()) as TopicoEvento[])
    : null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controlador) {
      let aberto = true;
      const enviar = (dados: string, evento?: string) => {
        if (!aberto) return;
        try {
          controlador.enqueue(encoder.encode(`${evento ? `event: ${evento}\n` : ""}data: ${dados}\n\n`));
        } catch {
          // stream fechada
        }
      };

      enviar(JSON.stringify({ ok: true, conectado: true }), "conectado");

      const desassinar = assinarEventosTempoReal(acesso.empresaId, (evento) => {
        if (filtro && !filtro.has(evento.topico)) return;
        enviar(JSON.stringify({ ok: true, topico: evento.topico, dados: evento.dados ?? null }), evento.topico);
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

export const GET = comTratamentoDeErro("eventos.GET", GETTenant);
