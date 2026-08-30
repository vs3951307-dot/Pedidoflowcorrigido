"use client";

import * as React from "react";

const MINIMUM_SHOW_MS = 1500;

/**
 * Controla a exibição da splash screen — uma vez por sessão por tenant.
 *
 * - `showSplash`: verdadeiro quando a splash DEVE estar visível.
 * - `hide`: chame quando a animação terminar; registra no sessionStorage.
 *
 * Usa `sessionStorage` com chave `splash:seen:{tenantId}` para que
 * cada empresa tenha controle independente.
 */
export function useSplashOnce(tenantId: string | null | undefined) {
  const [showSplash, setShowSplash] = React.useState(true);

  React.useEffect(() => {
    if (!tenantId) {
      setShowSplash(false);
      return;
    }

    const key = `splash:seen:${tenantId}`;
    try {
      if (sessionStorage.getItem(key)) {
        setShowSplash(false);
      }
    } catch {
      // sessionStorage indisponível — mostra a splash normalmente
    }
  }, [tenantId]);

  const hide = React.useCallback(() => {
    if (!tenantId) return;
    const key = `splash:seen:${tenantId}`;
    try {
      sessionStorage.setItem(key, "1");
    } catch {}
    setShowSplash(false);
  }, [tenantId]);

  return { showSplash, hide, minimumShowMs: MINIMUM_SHOW_MS };
}

/**
 * Remove a chave de splash do sessionStorage para um tenant específico.
 * Chamar no logout para que a splash reapareça no próximo login.
 */
export function clearSplashSession(tenantId: string) {
  try {
    sessionStorage.removeItem(`splash:seen:${tenantId}`);
  } catch {}
}
