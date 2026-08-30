"use client";

import { useEffect } from "react";

export interface AtalhoTeclado {
  tecla: string; // ex.: "F2", "Escape", "k" (combine com ctrl/meta abaixo)
  ctrl?: boolean;
  meta?: boolean;
  acao: () => void;
  /** Descrição curta, usada para montar uma lista de ajuda na tela. */
  descricao: string;
}

/** Registra atalhos de teclado globais enquanto o componente estiver montado.
 *  Ignora o atalho se o foco estiver em um campo de texto (exceto Escape). */
export function useAtalhosTeclado(atalhos: AtalhoTeclado[]) {
  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      const alvo = evento.target as HTMLElement;
      const emCampoDeTexto =
        alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable;
      for (const atalho of atalhos) {
        const teclaConfere = evento.key === atalho.tecla;
        const modificadorConfere =
          (atalho.ctrl ? evento.ctrlKey : true) && (atalho.meta ? evento.metaKey : true);
        if (teclaConfere && modificadorConfere) {
          if (emCampoDeTexto && atalho.tecla !== "Escape") continue;
          evento.preventDefault();
          atalho.acao();
        }
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [atalhos]);
}
