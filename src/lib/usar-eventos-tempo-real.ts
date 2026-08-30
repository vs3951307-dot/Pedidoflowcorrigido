"use client";

import { useEffect, useRef } from "react";

/**
 * Conecta ao SSE multiempresa (`/api/eventos`, ver
 * src/app/api/eventos/route.ts) e chama `aoEvento` sempre que outro
 * dispositivo mudar algo relevante (mesa, entrega, pedido, impressão) —
 * é o que faz, por exemplo, uma entrega pega por um entregador sumir
 * dos outros celulares na hora, sem precisar recarregar a página.
 *
 * Reconecta sozinho se a conexão cair (o navegador já faz isso para
 * SSE nativamente); esta função só garante que a tela escuta o tópico
 * certo e chama o callback. Falha silenciosa (sem SSE) não quebra a
 * tela — ela continua funcionando com o carregamento inicial, só sem
 * atualização automática até a próxima ação manual.
 */
export function useEventosTempoReal(topicos: string[], aoEvento: () => void) {
  const aoEventoRef = useRef(aoEvento);
  aoEventoRef.current = aoEvento;

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    const query = topicos.length > 0 ? `?topicos=${encodeURIComponent(topicos.join(","))}` : "";
    const es = new EventSource(`/api/eventos${query}`);

    const handler = () => aoEventoRef.current();
    for (const topico of topicos) {
      es.addEventListener(topico, handler);
    }
    es.onerror = () => {
      // O navegador tenta reconectar sozinho (comportamento padrão de
      // EventSource); não precisamos fazer nada aqui além de deixar.
    };

    return () => {
      for (const topico of topicos) {
        es.removeEventListener(topico, handler);
      }
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicos.join(",")]);
}
