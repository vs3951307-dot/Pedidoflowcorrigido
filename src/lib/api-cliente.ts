"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export type ApiErro = {
  erro?: string;
  mensagem?: string;
  /** Código estruturado opcional (PEDIDO 47 — "backend deve retornar
   *  códigos estruturados: ALREADY_APPLIED, NOT_FOUND, CONFLICT,
   *  INVALID_STATE"). Nem toda rota envia isto ainda — quando ausente,
   *  só a mensagem em texto está disponível. */
  codigo?: string;
};

/**
 * Erro de API que preserva o `codigo` estruturado da resposta (quando a
 * rota envia um), além da mensagem legível. Antes, `api()` jogava fora
 * o corpo inteiro e só propagava `new Error(mensagem)` — qualquer
 * consumidor que precisasse decidir algo com base no TIPO do erro (ex.:
 * "isto já foi aplicado, não precisa reenviar" vs "isto falhou de
 * verdade") só tinha a mensagem em texto pra adivinhar, um padrão frágil
 * (ver PEDIDO 47 e o antes/depois em `src/lib/offline-entregador.ts`).
 */
export class ApiException extends Error {
  codigo?: string;
  constructor(mensagem: string, codigo?: string) {
    super(mensagem);
    this.name = "ApiException";
    this.codigo = codigo;
  }
}

/** Rotas de autenticação públicas — 401 não redireciona (credenciais erradas). */
const ROTAS_AUTH_PUBLICAS = ["/api/auth/login", "/api/auth/recuperar", "/api/auth/redefinir"];

export async function api<T = unknown>(
  caminho: string,
  init?: RequestInit,
): Promise<T> {
  const resposta = await fetch(caminho, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    // Sessão expirada ou inválida: manda para o login (controle de sessão).
    if (resposta.status === 401 && !ROTAS_AUTH_PUBLICAS.includes(caminho)) {
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.assign("/login");
      }
    }
    const mensagem =
      (corpo as ApiErro | null)?.erro ??
      (corpo as ApiErro | null)?.mensagem ??
      `Erro ao acessar ${caminho}`;
    throw new ApiException(mensagem, (corpo as ApiErro | null)?.codigo);
  }
  return corpo as T;
}

type Estado<T> = {
  dados: T;
  carregando: boolean;
  erro: string | null;
  recarregar: () => void;
};

/**
 * Hook genérico de leitura: busca dados da API e mostra `padrao` como
 * estado inicial enquanto carrega.
 *
 * IMPORTANTE: se a requisição falhar, o valor de `padrao` continua na
 * tela (para a página não quebrar), mas o ERRO É SEMPRE AVISADO (toast)
 * — nenhuma tela deve exibir dado de exemplo/mock como se fosse real
 * sem o usuário saber que a busca de verdade falhou. Se você só
 * precisa do dado (sem tratar o erro você mesmo), ainda assim o aviso
 * aparece; para telas que já tratam o erro visualmente, isto some
 * sozinho na primeira carga bem-sucedida.
 */
export function useApi<T>(caminho: string, padrao: T, dependencias: unknown[] = []): Estado<T> {
  const [estado, setEstado] = useState<{ dados: T; carregando: boolean; erro: string | null }>({
    dados: padrao,
    carregando: true,
    erro: null,
  });
  const padraoRef = useRef(padrao);
  padraoRef.current = padrao;
  const primeiraCargaRef = useRef(true);

  const carregar = useCallback(async () => {
    try {
      const dados = await api<T>(caminho);
      setEstado({ dados, carregando: false, erro: null });
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "Falha ao carregar";
      setEstado({
        dados: padraoRef.current,
        carregando: false,
        erro: mensagem,
      });
      // Aviso sempre visível — sem isso, a tela mostraria o valor padrão
      // (geralmente uma lista vazia ou dado de exemplo) sem ninguém
      // perceber que a busca real falhou.
      toast.error(`Não foi possível carregar ${caminho}: ${mensagem}`);
    } finally {
      primeiraCargaRef.current = false;
    }
  }, [caminho]);

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencias, caminho]);

  return {
    dados: estado.dados,
    carregando: estado.carregando,
    erro: estado.erro,
    recarregar: carregar,
  };
}

export function novoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
