/**
 * Rate limiter em memória (janela deslizante simples).
 * Suficiente para uma instância única (processo Node standalone).
 * Para múltiplas instâncias, troque o Map por Redis (mesma assinatura).
 */
type Registro = { tentativas: number[] };

const armazenamento = new Map<string, Registro>();

// Limpa registros antigos periodicamente para não vazar memória.
setInterval(() => {
  const agora = Date.now();
  for (const [chave, registro] of armazenamento) {
    registro.tentativas = registro.tentativas.filter((t) => agora - t < 15 * 60 * 1000);
    if (registro.tentativas.length === 0) armazenamento.delete(chave);
  }
}, 5 * 60 * 1000).unref?.();

export interface LimiteOpcoes {
  /** Identificador único do "balde" (ex.: `login:IP`, `webhook:IP`). */
  chave: string;
  /** Máximo de tentativas permitidas na janela. */
  maximo: number;
  /** Duração da janela em milissegundos. */
  janelaMs: number;
}

export interface ResultadoLimite {
  permitido: boolean;
  restante: number;
  reiniciaEm: number; // ms até a janela liberar de novo
}

export function verificarLimite({ chave, maximo, janelaMs }: LimiteOpcoes): ResultadoLimite {
  const agora = Date.now();
  const registro = armazenamento.get(chave) ?? { tentativas: [] };
  registro.tentativas = registro.tentativas.filter((t) => agora - t < janelaMs);
  if (registro.tentativas.length >= maximo) {
    armazenamento.set(chave, registro);
    const maisAntiga = registro.tentativas[0];
    return { permitido: false, restante: 0, reiniciaEm: janelaMs - (agora - maisAntiga) };
  }
  registro.tentativas.push(agora);
  armazenamento.set(chave, registro);
  return { permitido: true, restante: maximo - registro.tentativas.length, reiniciaEm: janelaMs };
}

/** Extrai um IP razoável a partir dos headers (atrás de proxy/CDN). */
export function ipDaRequisicao(req: Request): string {
  const encaminhado = req.headers.get("x-forwarded-for");
  if (encaminhado) return encaminhado.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "desconhecido";
}

/**
 * Lockout de conta após N falhas consecutivas.
 * Bloqueia a conta por `bloqueioMs` após `maxFalhas` tentativas.
 */
const lockouts = new Map<string, { falhas: number; bloqueadoAte: number }>();

export interface LockoutOpcoes {
  /** Identificador da conta (ex.: `lockout:email@example.com`). */
  chave: string;
  maxFalhas: number;
  bloqueioMs: number;
}

export interface ResultadoLockout {
  bloqueado: boolean;
  restanteMs: number;
}

export function registrarFalhaLockout({ chave, maxFalhas, bloqueioMs }: LockoutOpcoes): ResultadoLockout {
  const agora = Date.now();
  const estado = lockouts.get(chave) ?? { falhas: 0, bloqueadoAte: 0 };
  if (estado.bloqueadoAte > agora) {
    return { bloqueado: true, restanteMs: estado.bloqueadoAte - agora };
  }
  estado.falhas += 1;
  if (estado.falhas >= maxFalhas) {
    estado.bloqueadoAte = agora + bloqueioMs;
    estado.falhas = 0;
    lockouts.set(chave, estado);
    return { bloqueado: true, restanteMs: bloqueioMs };
  }
  lockouts.set(chave, estado);
  return { bloqueado: false, restanteMs: 0 };
}

export function resetarLockout(chave: string): void {
  lockouts.delete(chave);
}
