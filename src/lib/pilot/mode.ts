/**
 * Pilot Mode Utility
 * 
 * Fornece a forma simples de verificar se o sistema está em modo de teste/piloto.
 * 
 * IMPORTANTE: 
 * - Define PILOT_MODE=true no .env.production para ativar
 * - Quando ativo, exibe "MODO PILOTO / TESTE" visualmente
 * - Dados marcados como TESTE não devem ser incluídos em relatórios financeiros
 * - Nunca altere regras de negócio apenas por estar em modo piloto
 */
export const PILOT_MODE = typeof process !== "undefined" && process?.env?.PILOT_MODE === "true";

export function usePilotMode(): boolean {
  // Em ambiente de servidor (Next.js 14+)
  if (typeof window === "undefined") {
    // Lê do lado do servidor via process.env
    // Note: isso só funciona no build/server side
    return PILOT_MODE;
  }
  
  // Cliente: pode verificar localStorage ou apenas retornar false
  // para não afetar o UI. O modo visual será tratado separadamente.
  return false;
}

// Retorna uma flag para exibição visual (apenas no cliente)
export function getPilotModeStatus(): { enabled: boolean; message: string } {
  if (PILOT_MODE) {
    return { enabled: true, message: "MODO PILOTO / TESTE" };
  }
  return { enabled: false, message: "" };
}