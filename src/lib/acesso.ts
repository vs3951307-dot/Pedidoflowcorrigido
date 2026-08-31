import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { usuarioDaSessao, STATUS_EMPRESA_ATIVOS } from "@/lib/auth";
import { temPermissao, type Recurso, type UsuarioComPermissoes } from "@/lib/permissao";
import { parseModulos, MODULO_DO_RECURSO } from "@/lib/modulos";
import { ativarTenant } from "@/lib/tenant-db";
import { situacaoAssinatura, mensagemBloqueioAssinatura } from "@/lib/assinatura";

// Símbolos puros (papéis, recursos, rótulos) — re-exportados para os
// consumidores de server (rotas da API e páginas).
export {
  PAPEIS,
  ROTULOS_PAPEL,
  RECURSOS,
  ehPapelValido,
  recursosDoPapel,
  temPermissao,
  usuarioSeguro,
  type Papel,
  type Recurso,
  type UsuarioComPermissoes,
} from "@/lib/permissao";

/**
 * Guardas de autorização (PEDIDO 14, adaptado para SaaS multiempresa) —
 * server-only.
 *
 * Toda API valida aqui (`autorizar`) e toda rota de página de módulo
 * exige sessão + recurso (`exigirRota`). O backend sempre valida: não
 * depende de esconder botões no frontend.
 *
 * MULTI-TENANT: `autorizar()` é o ÚNICO ponto que resolve o `empresaId`
 * da sessão. Ele NUNCA aceita um `empresaId` vindo do corpo da
 * requisição, de query string ou de header — sempre da sessão validada
 * no banco. Toda rota de API deve usar `acesso.empresaId` em TODO
 * `where` de consulta/alteração/exclusão e em todo `create`.
 */
export type Autorizacao =
  | { ok: true; usuario: UsuarioComPermissoes; empresaId: string; assinaturaWarning?: boolean; diasRestantesCarencia?: number }
  | { ok: false; resposta: NextResponse };

/**
 * Guarda de APIs: valida sessão (expiração + usuário ativo + empresa
 * ativa), permissão de papel E módulo contratado pela empresa.
 * Retorna `{ ok: true, usuario, empresaId }` ou uma resposta 401/403/402
 * pronta. `empresaId` é a ÚNICA fonte de verdade de tenant no restante
 * da rota — nunca leia `empresaId` do corpo/query da requisição.
 */
export async function autorizar(...recursos: Recurso[]): Promise<Autorizacao> {
  const token = cookies().get("sessao")?.value;
  const usuario = await usuarioDaSessao(token);
  if (!usuario || usuario.ativo === false) {
    return {
      ok: false,
      resposta: NextResponse.json(
        { erro: "Sessão inválida ou expirada. Entre novamente." },
        { status: 401 }
      ),
    };
  }
  if (!STATUS_EMPRESA_ATIVOS.has(usuario.empresa.status)) {
    return {
      ok: false,
      resposta: NextResponse.json(
        {
          erro:
            usuario.empresa.status === "bloqueada"
              ? "Esta empresa está bloqueada. Fale com o suporte do PedidoFlow."
              : "Esta empresa está suspensa ou inativa. Fale com o suporte do PedidoFlow.",
        },
        { status: 402 }
      ),
    };
  }
  // CORREÇÃO (PEDIDO 36 — "empresa vencida não pode continuar utilizando
  // normalmente apenas porque status ainda está 'teste' ou 'ativa'"):
  // antes, `trialFimEm`/`vencimentoEm` existiam no cadastro, apareciam
  // no painel do Super Admin, mas NUNCA eram checados aqui — uma
  // empresa em teste vencido continuava usando o sistema normalmente
  // pra sempre, a menos que um Super Admin mudasse o status manualmente.
  // Super Admin continua acessível (autenticação completamente separada,
  // não passa por este `autorizar`) — dados nunca são apagados, só o
  // uso normal é bloqueado até regularizar.
  const agora = new Date();
  if (usuario.empresa.status === "teste" && usuario.empresa.trialFimEm && usuario.empresa.trialFimEm < agora) {
    return {
      ok: false,
      resposta: NextResponse.json(
        { erro: "Seu período de teste terminou. Fale com o suporte do PedidoFlow para escolher um plano e continuar usando." },
        { status: 402 }
      ),
    };
  }
  // CARÊNCIA (PEDIDO: "7 dias corridos de tolerância após o vencimento
  // antes de bloqueio"): como antes, um vencimento passado NÃO bloqueia
  // na hora — a empresa entra em carência por `CARENCIA_DIAS` dias
  // (campo `carenciaAte`). Só bloqueia quando a carência também esgota.
  const sitAssinatura = situacaoAssinatura(usuario.empresa);
  if (sitAssinatura.estado === "vencida") {
    return {
      ok: false,
      resposta: NextResponse.json(
        { erro: mensagemBloqueioAssinatura(usuario.empresa) },
        { status: 402 }
      ),
    };
  }
  ativarTenant(usuario.empresa);
  if (recursos.length > 0 && !recursos.some((recurso) => temPermissao(usuario, recurso))) {
    return {
      ok: false,
      resposta: NextResponse.json(
        { erro: "Você não tem permissão para esta ação." },
        { status: 403 }
      ),
    };
  }
  // Módulo contratado: CORREÇÃO (bug confirmado) — antes, se QUALQUER
  // recurso da lista não exigisse módulo (ex.: "admin"), a checagem de
  // módulo inteira era pulada, mesmo que outro recurso da MESMA lista
  // exigisse um módulo não contratado (ex.: `autorizar("admin",
  // "entregas")` liberava acesso a dados de entrega para uma empresa
  // sem o módulo Entregador, só por causa do "admin" na lista).
  //
  // Regra correta: papel/permissão (já validado acima) e módulo
  // contratado são checagens INDEPENDENTES — as duas precisam passar.
  // Só pula a checagem de módulo quando NENHUM recurso da lista exige
  // módulo algum (rotas puramente de papel, como dashboard/Copiloto).
  const modulosNecessarios = recursos
    .map((r) => MODULO_DO_RECURSO[r])
    .filter((m): m is NonNullable<typeof m> => !!m);
  if (modulosNecessarios.length > 0) {
    const modulosAtivos = parseModulos(usuario.empresa.modulos);
    if (!modulosNecessarios.some((m) => modulosAtivos.includes(m))) {
      return {
        ok: false,
        resposta: NextResponse.json(
          { erro: "Este módulo não está disponível no plano da sua empresa." },
          { status: 402 }
        ),
      };
    }
  }
  return {
    ok: true,
    usuario: usuario as UsuarioComPermissoes,
    empresaId: usuario.empresaId,
    // Carência detectada → o frontend pode exibir um banner de aviso
    // sem bloquear o uso (a operação segue permitida).
    assinaturaWarning: sitAssinatura.estado === "carência",
    diasRestantesCarencia: sitAssinatura.estado === "carência" ? sitAssinatura.diasRestantesCarencia : undefined,
  };
}

/**
 * Guarda de páginas (layouts de módulo): exige sessão válida, empresa
 * ativa e permissão; redireciona para /login (desautenticado/empresa
 * inativa) ou / (sem permissão/módulo).
 */
export async function exigirRota(
  ...recursos: Recurso[]
): Promise<UsuarioComPermissoes & { empresaId: string; empresaNome: string; empresaLogoUrl: string | null; empresaTema: Record<string, unknown> | null; modulosAtivos: string[]; assinaturaWarning: boolean; diasRestantesCarencia: number }> {
  const token = cookies().get("sessao")?.value;
  const usuario = await usuarioDaSessao(token);
  if (!usuario || usuario.ativo === false) {
    redirect("/login");
  }
  if (!STATUS_EMPRESA_ATIVOS.has(usuario.empresa.status)) {
    redirect("/login");
  }
  // Mesma correção do item 36 aplicada em `autorizar()` — trial/
  // vencimento vencidos bloqueiam o acesso à PÁGINA também, não só à
  // API (senão a página carregava normalmente e só as chamadas
  // internas de API falhavam, uma experiência confusa). Agora com
  // carência de 7 dias: só bloqueia quando a carência esgota.
  const agora = new Date();
  if (usuario.empresa.status === "teste" && usuario.empresa.trialFimEm && usuario.empresa.trialFimEm < agora) {
    redirect("/login?erro=trial_vencido");
  }
  const sitAssinatura = situacaoAssinatura(usuario.empresa);
  if (sitAssinatura.estado === "vencida") {
    redirect("/login?erro=assinatura_vencida");
  }
  ativarTenant(usuario.empresa);
  if (recursos.length > 0 && !recursos.some((recurso) => temPermissao(usuario, recurso))) {
    redirect("/");
  }
  // CORREÇÃO (mesmo bug do item 33, agora também aqui): antes, um
  // recurso sem módulo associado (ex.: "admin") na lista fazia a
  // checagem de módulo inteira ser pulada — mesma vulnerabilidade que
  // corrigi em `autorizar()`, só que esta função (`exigirRota`) protege
  // PÁGINAS inteiras, não só chamadas de API, e tinha ficado pra trás.
  const modulosAtivos = parseModulos(usuario.empresa.modulos);
  const modulosNecessarios = recursos.map((r) => MODULO_DO_RECURSO[r]).filter((m): m is NonNullable<typeof m> => !!m);
  if (modulosNecessarios.length > 0 && !modulosNecessarios.some((m) => modulosAtivos.includes(m))) {
    redirect("/");
  }
  return {
    ...(usuario as UsuarioComPermissoes),
    empresaId: usuario.empresaId,
    empresaNome: usuario.empresa.nome,
    empresaLogoUrl: usuario.empresa.logoUrl ?? null,
    empresaTema: (usuario.empresa.tema && typeof usuario.empresa.tema === "object" ? usuario.empresa.tema : null) as Record<string, unknown> | null,
    modulosAtivos,
    assinaturaWarning: sitAssinatura.estado === "carência",
    diasRestantesCarencia: sitAssinatura.estado === "carência" ? sitAssinatura.diasRestantesCarencia : 0,
  };
}

/** Registra um evento na trilha de auditoria (falhas não derrubam a ação). */
export async function registrarAuditoria(
  acao: string,
  detalhe?: string,
  usuario?: { id: string; nome: string } | null,
  ip?: string,
  empresaId?: string | null
) {
  await prisma.auditoria
    .create({
      data: {
        acao,
        detalhe,
        usuarioId: usuario?.id ?? null,
        usuarioNome: usuario?.nome ?? null,
        ip: ip ?? null,
        empresaId: empresaId ?? null,
      },
    })
    .catch(() => null);
}
