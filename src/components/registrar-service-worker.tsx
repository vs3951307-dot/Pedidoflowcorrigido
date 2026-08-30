"use client";

import { useEffect } from "react";

/** Registra o service worker uma vez, no client. Renderiza nada. */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // falha ao registrar não deve quebrar o app — só perde o offline
      });
    }
  }, []);
  return null;
}
