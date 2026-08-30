/**
 * Utilitários puros de chave de acesso NFC-e (PEDIDO 19).
 *
 * A chave de acesso (44 dígitos) é formada por:
 *   cUF(2) + AAMM(4) + CNPJ(14) + mod(2) + série(3) + nNF(9) + tpEmis(1)
 *   + cNF(8) + DV(1) — DV por módulo 11 (pesos 2..9, resto 0 ou 1 → "0").
 *
 * Estas funções NÃO geram chaves "fiscais": a chave válida de uma NFC-e
 * autorizada vem SEMPRE do retorno do provedor/SEFAZ. Aqui só validamos
 * e formatamos o que o serviço devolve.
 */

/** Dígito verificador módulo 11 da base de 43 dígitos (mesmo algoritmo da SEFAZ). */
export function calcularDigitoVerificador(base43: string): string {
  let soma = 0;
  let peso = 2;
  for (let i = base43.length - 1; i >= 0; i--) {
    soma += Number(base43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto <= 1 ? "0" : String(11 - resto);
}

/** "35260812345678001900001650010000000000010000" — 44 dígitos. */
export function validarChave(chave: string): boolean {
  const limpa = chave.replace(/\s+/g, "");
  if (!/^\d{44}$/.test(limpa)) return false;
  return calcularDigitoVerificador(limpa.slice(0, 43)) === limpa[43];
}

/** "3526 0812 3456 7800 1900 0001 6500 1000 0000 0000 0100 00" — grupos de 4. */
export function formatarChave(chave: string): string {
  return chave.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

/** UF (cUF) do início da chave, ex.: "35" (SP) — ou "" se inválida. */
export function cufDaChave(chave: string): string {
  const limpa = chave.replace(/\s+/g, "");
  return /^\d{44}$/.test(limpa) ? limpa.slice(0, 2) : "";
}

/** CNPJ (14 dígitos) embutido na chave — "" se inválida. */
export function cnpjDaChave(chave: string): string {
  const limpa = chave.replace(/\s+/g, "");
  return /^\d{44}$/.test(limpa) ? limpa.slice(6, 20) : "";
}

/** Número do documento (nNF) embutido na chave — null se inválida. */
export function numeroDaChave(chave: string): number | null {
  const limpa = chave.replace(/\s+/g, "");
  if (!/^\d{44}$/.test(limpa)) return null;
  return Number(limpa.slice(29, 38));
}

/** Série embutida na chave — "" se inválida. */
export function serieDaChave(chave: string): string {
  const limpa = chave.replace(/\s+/g, "");
  return /^\d{44}$/.test(limpa) ? limpa.slice(26, 29) : "";
}
