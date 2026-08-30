/**
 * Copiloto Supremo do Super Admin — dono da plataforma (diferente do
 * Copiloto da Empresa, que é por tenant e só vê dados daquela empresa —
 * ver src/lib/copiloto/*).
 *
 * Objetivo: interpretar instruções em linguagem natural sobre A
 * PLATAFORMA INTEIRA (criar/configurar empresas, módulos, planos, tema,
 * landing page, diagnóstico) e traduzir em uma lista de AÇÕES de um
 * catálogo FECHADO — nunca gera ou executa código arbitrário, nunca
 * toca no banco sem passar pela validação abaixo.
 *
 * Três categorias de instrução:
 *   1. LEITURA (diagnóstico, listagens) — respondida NA HORA, sem
 *      confirmação, sempre a partir de dados reais
 *      (`obterDiagnosticoPlataforma()` — nunca inventa "está tudo bem").
 *   2. AÇÃO (módulos, tema, textos, plano, status da empresa, landing,
 *      criar plano) — vira uma PROPOSTA; só aplica depois que o Super
 *      Admin confirma exatamente a lista mostrada
 *      (`interpretarInstrucao()` → `aplicarAcoes()`).
 *   3. FORA DO ESCOPO — quando a instrução exige código novo (um módulo
 *      que não existe), a IA nunca inventa uma ação equivalente; gera
 *      uma especificação técnica para uso com uma ferramenta de
 *      desenvolvimento (`gerarEspecificacaoTecnica()`).
 *
 * Toda ação aplicada gera um registro em `HistoricoCopiloto` (antes/
 * depois) e pode ser desfeita (`desfazerHistorico()`).
 */

import { prisma } from "@/lib/prisma";
import { MODULOS, ehModuloValido, parseModulos, serializarModulos, type Modulo } from "@/lib/modulos";
import {
  parseTema,
  parseTextos,
  serializarTema,
  serializarTextos,
  type TemaEmpresa,
} from "@/lib/system-builder";
import { parseLandingConteudo, serializarLandingConteudo, type LandingConteudo } from "@/lib/landing-config";
import { registrarUsoIA } from "@/lib/uso-ia";
import { obterDiagnosticoPlataforma } from "@/lib/diagnostico-plataforma";
import { chamarIA } from "@/lib/ai-provider";
import { registrarAuditoriaSuperAdmin } from "@/lib/super-admin/auth";

export type AcaoAdmin =
  | { tipo: "habilitar_modulo"; empresaId: string; modulo: Modulo }
  | { tipo: "desabilitar_modulo"; empresaId: string; modulo: Modulo }
  | { tipo: "definir_plano"; empresaId: string; planoId: string; planoNome: string }
  | { tipo: "alterar_texto"; empresaId: string; chave: string; valor: string }
  | { tipo: "alterar_tema"; empresaId: string; campo: string; valor: string }
  | { tipo: "alterar_status_empresa"; empresaId: string; status: "ativa" | "suspensa" | "bloqueada" }
  | { tipo: "alterar_landing"; campo: string; valor: string }
  | { tipo: "criar_plano"; nome: string; slug: string; preco: number; modulos: Modulo[] }
  | { tipo: "sugestao_criar_empresa"; nomeSugerido: string; slugSugerido: string; modulosSugeridos: Modulo[] }
  | { tipo: "criar_usuario"; empresaId: string; nome: string; email: string; papel: string }
  | { tipo: "desativar_usuario"; usuarioId: string; nome: string }
  | { tipo: "reativar_usuario"; usuarioId: string; nome: string }
  | { tipo: "redefinir_senha_usuario"; usuarioId: string; nome: string; novaSenha: string }
  | { tipo: "fora_do_escopo"; motivo: string; especificacao?: string };

export interface AcaoComRotulo {
  acao: AcaoAdmin;
  rotulo: string; // frase pronta para exibir ao Super Admin ("Ativar módulo Estoque na Pastelaria X")
}

export interface ResultadoInterpretacao {
  modo: "proposta" | "resposta" | "ambiguo";
  acoes: AcaoComRotulo[];
  resumo: string; // frase curta acima da lista de ações, ou a RESPOSTA final (modo "resposta")
  empresasCandidatas?: { id: string; nome: string }[]; // quando o nome da empresa é ambíguo
}

const MODULOS_POR_PALAVRA: Record<string, Modulo> = {
  pdv: "pdv",
  balcao: "pdv",
  mesas: "mesas",
  garcom: "mesas",
  salao: "mesas",
  kds: "kds",
  cozinha: "kds",
  delivery: "delivery",
  entrega: "delivery",
  entregador: "entregador",
  entregadores: "entregador",
  estoque: "estoque",
  relatorios: "relatorios",
  whatsapp: "whatsapp",
  atendimento: "whatsapp",
  fiscal: "fiscal",
  nfce: "fiscal",
  "nfc-e": "fiscal",
  impressao: "impressao",
  copiloto: "copiloto",
};

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Resolve o nome de uma empresa citado na instrução contra o banco real
 * (busca por nome/slug, sem diferenciar maiúsculas/acentos). Devolve o
 * ID já validado — nunca confia em texto solto do usuário/LLM como
 * identificador de empresa.
 */
export async function resolverEmpresaPorTexto(
  texto: string
): Promise<{ empresa: { id: string; nome: string } | null; candidatas: { id: string; nome: string }[] }> {
  const empresas = await prisma.empresa.findMany({ select: { id: true, nome: true, slug: true } });
  const alvo = normalizar(texto);
  const encontradas = empresas.filter(
    (e) => alvo.includes(normalizar(e.nome)) || alvo.includes(normalizar(e.slug))
  );
  if (encontradas.length === 1) return { empresa: encontradas[0], candidatas: [] };
  if (encontradas.length > 1) return { empresa: null, candidatas: encontradas };
  return { empresa: null, candidatas: [] };
}

const PALAVRAS_DIAGNOSTICO = [
  "o que esta acontecendo",
  "o que está acontecendo",
  "erro",
  "problema",
  "funcionando",
  "diagnostic",
  "saude",
  "saúde",
  "status",
  "situacao",
  "situação",
  "por que",
  "porque",
];

const PALAVRAS_LISTAGEM = ["liste", "listar", "quantas empresas", "quais empresas", "mostre as empresas", "mostre empresas"];

function ehIntencaoDiagnostico(textoNormalizado: string): boolean {
  return PALAVRAS_DIAGNOSTICO.some((p) => textoNormalizado.includes(normalizar(p)));
}

function ehIntencaoListagem(textoNormalizado: string): boolean {
  return PALAVRAS_LISTAGEM.some((p) => textoNormalizado.includes(normalizar(p)));
}

/** Responde perguntas de LEITURA (diagnóstico/listagem) com dados REAIS — nunca inventa. */
async function responderLeitura(instrucao: string): Promise<ResultadoInterpretacao | null> {
  const texto = normalizar(instrucao);
  if (!ehIntencaoDiagnostico(texto) && !ehIntencaoListagem(texto)) return null;

  const diagnostico = await obterDiagnosticoPlataforma();

  if (ehIntencaoListagem(texto) && !ehIntencaoDiagnostico(texto)) {
    const linhas = diagnostico.empresas.map(
      (e) => `• ${e.nome} — ${e.status} — plano ${e.plano} — ${e.saudavel ? "✓ sem alertas" : `⚠ ${e.problemas.join("; ")}`}`
    );
    return {
      modo: "resposta",
      acoes: [],
      resumo: `${diagnostico.totalEmpresas} empresa(s) cadastradas, ${diagnostico.empresasComProblema} com alerta:\n${linhas.join("\n")}`,
    };
  }

  // Diagnóstico de UMA empresa citada, ou da plataforma inteira.
  const { empresa, candidatas } = await resolverEmpresaPorTexto(instrucao);
  if (candidatas.length > 1) {
    return {
      modo: "ambiguo",
      acoes: [],
      resumo: "Encontrei mais de uma empresa com esse nome — qual delas?",
      empresasCandidatas: candidatas,
    };
  }

  if (empresa) {
    const d = diagnostico.empresas.find((e) => e.id === empresa.id);
    if (!d) return { modo: "resposta", acoes: [], resumo: `Não encontrei dados de diagnóstico para ${empresa.nome}.` };
    const linhas = [
      `*${d.nome}* — status: ${d.status} — plano: ${d.plano}`,
      `${d.online ? "🟢 online agora" : "⚪ sem atividade recente"} — último acesso: ${d.ultimoAcessoUsuario ? new Date(d.ultimoAcessoUsuario).toLocaleString("pt-BR") : "nunca"}`,
      `${d.pedidos24h} pedido(s) nas últimas 24h`,
      `WhatsApp: ${d.whatsappConfigurado ? "configurado" : "não configurado"}`,
      `Impressão: ${d.impressaoConfigurada ? "configurada" : "não configurada"}${d.impressaoComErro > 0 ? ` — ${d.impressaoComErro} com erro` : ""}${d.impressaoPendenteAntiga > 0 ? ` — ${d.impressaoPendenteAntiga} pendente(s) há mais de 30min` : ""}`,
      `Fiscal: ${d.fiscalConfigurado ? "configurado" : "não configurado"}`,
      `IA: ${d.usoIAMesAtual} mensagem(ns) usada(s) este mês${d.limiteMensagensIA ? ` de ${d.limiteMensagensIA}` : " (sem limite)"}`,
      d.problemas.length > 0 ? `⚠ Alertas: ${d.problemas.join("; ")}` : "✓ Nenhum alerta encontrado.",
    ];
    return { modo: "resposta", acoes: [], resumo: linhas.join("\n") };
  }

  // Diagnóstico geral da plataforma.
  const comProblema = diagnostico.empresas.filter((e) => !e.saudavel);
  const resumo =
    comProblema.length === 0
      ? `✓ ${diagnostico.totalEmpresas} empresa(s) cadastradas, nenhuma com alerta no momento.`
      : `⚠ ${comProblema.length} de ${diagnostico.totalEmpresas} empresa(s) com alerta:\n` +
        comProblema.map((e) => `• ${e.nome}: ${e.problemas.join("; ")}`).join("\n");
  return { modo: "resposta", acoes: [], resumo };
}

/**
 * Interpretador determinístico (palavra-chave) — sempre disponível, sem
 * custo de API. Também valida qualquer resposta vinda de um LLM (nunca
 * se confia cegamente no LLM para nomes de módulo/empresa/plano).
 */
async function interpretarPorPalavraChave(instrucao: string): Promise<ResultadoInterpretacao> {
  const respostaLeitura = await responderLeitura(instrucao);
  if (respostaLeitura) return respostaLeitura;

  const texto = normalizar(instrucao);

  // "Crie uma empresa/sistema/pastelaria/pizzaria/restaurante para..." —
  // isto SEMPRE vira uma SUGESTÃO (nunca cria direto): o Super Admin
  // ainda precisa informar o e-mail/senha do administrador inicial no
  // formulário que aparece junto da proposta (PEDIDO 2).
  if (/\b(cri[ae]|nov[ao])\b.*\b(empresa|sistema|cliente|pastelaria|pizzaria|restaurante|lanchonete|hamburgueria)\b/.test(texto)) {
    const modulosSugeridos = new Set<Modulo>(["pdv", "estoque", "relatorios"]);
    for (const [palavra, modulo] of Object.entries(MODULOS_POR_PALAVRA)) {
      if (texto.includes(palavra)) modulosSugeridos.add(modulo);
    }
    // "sem garçom"/"sem mesas" etc. também vale na criação.
    const partesNegativas = texto.match(/(?:sem|não quero|nao quero)\s+([a-zà-ú,\s]+)/g) ?? [];
    for (const trecho of partesNegativas) {
      for (const [palavra, modulo] of Object.entries(MODULOS_POR_PALAVRA)) {
        if (trecho.includes(palavra)) modulosSugeridos.delete(modulo);
      }
    }
    const nomeMatch =
      instrucao.match(/["“]([^"”]{2,60})["”]/) ??
      instrucao.match(/(?:chamad[ao]|empresa|cliente)\s+([A-ZÀ-Úa-zà-ú0-9\s]{2,40}?)(?:[,.]|$| com | sem )/);
    const nomeSugerido = nomeMatch ? nomeMatch[1].trim() : "Nova Empresa";
    const slugSugerido = normalizar(nomeSugerido)
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    return {
      modo: "proposta",
      acoes: [
        {
          acao: {
            tipo: "sugestao_criar_empresa",
            nomeSugerido,
            slugSugerido: slugSugerido || "nova-empresa",
            modulosSugeridos: [...modulosSugeridos],
          },
          rotulo: `Criar empresa "${nomeSugerido}" com os módulos: ${[...modulosSugeridos].join(", ")}`,
        },
      ],
      resumo: `Sugestão de novo sistema para "${nomeSugerido}" — confirme os módulos e informe o administrador inicial.`,
    };
  }

  const { empresa, candidatas } = await resolverEmpresaPorTexto(instrucao);
  if (candidatas.length > 1) {
    return {
      modo: "ambiguo",
      acoes: [],
      resumo: "Encontrei mais de uma empresa com esse nome — qual delas?",
      empresasCandidatas: candidatas,
    };
  }

  const acoes: AcaoComRotulo[] = [];
  const ehSobreFuncionario = /\b(garcom|entregador|caixa|cozinha|funcionari|usuari|administrador)\b/.test(texto);

  if (empresa) {
    // Usuários/funcionários (PEDIDO 1/5) — checado ANTES do status da
    // empresa, para "desative o entregador X" nunca ser confundido com
    // "desative a empresa".
    const PAPEIS_POR_PALAVRA: Record<string, string> = {
      garcom: "GARCOM",
      caixa: "CAIXA",
      entregador: "ENTREGADOR",
      cozinha: "COZINHA",
      administrador: "ADMINISTRADOR",
    };

    // "cadastre/crie [Nome] como [papel]"
    const criarUsuarioMatch = instrucao.match(
      /(?:cadastr[ae]|cri[ae])\s+(?:o\s+|a\s+)?([A-ZÀ-Úa-zà-ú]{2,30})\s+como\s+([a-zà-ú]+)/i
    );
    if (criarUsuarioMatch) {
      const nome = criarUsuarioMatch[1].trim();
      const papelTexto = normalizar(criarUsuarioMatch[2]);
      const papel = PAPEIS_POR_PALAVRA[papelTexto];
      if (papel) {
        acoes.push({
          acao: { tipo: "criar_usuario", empresaId: empresa.id, nome, email: "", papel },
          rotulo: `Criar acesso de ${papel.toLowerCase()} para "${nome}" em ${empresa.nome} (informe o e-mail na confirmação)`,
        });
      }
    }

    // "desative/remova o funcionário/garçom/entregador/etc [Nome]"
    const desativarUsuarioMatch = instrucao.match(
      /(?:desativ[ae]|remov[ae]|exclu[ai])\s+(?:o\s+|a\s+)?(?:garçom|garcom|caixa|entregador|cozinha|funcionári[oa]|usuári[oa])?\s*([A-ZÀ-Úa-zà-ú]{2,30})?/i
    );
    if (ehSobreFuncionario && desativarUsuarioMatch?.[1] && !/empresa/.test(texto)) {
      const nomeBusca = desativarUsuarioMatch[1].trim();
      const usuarioAlvo = await prisma.usuario.findFirst({
        where: { empresaId: empresa.id, nome: { contains: nomeBusca, mode: "insensitive" } },
      });
      if (usuarioAlvo) {
        acoes.push({
          acao: { tipo: "desativar_usuario", usuarioId: usuarioAlvo.id, nome: usuarioAlvo.nome },
          rotulo: `Desativar o acesso de ${usuarioAlvo.nome} em ${empresa.nome}`,
        });
      }
    }

    // "redefina a senha de [Nome]"
    const redefinirSenhaMatch = instrucao.match(/redefin[ai]\w*\s+(?:a\s+)?senha\s+d[eo]\s+([A-ZÀ-Úa-zà-ú]{2,30})/i);
    if (redefinirSenhaMatch) {
      const nomeBusca = redefinirSenhaMatch[1].trim();
      const usuarioAlvo = await prisma.usuario.findFirst({
        where: { empresaId: empresa.id, nome: { contains: nomeBusca, mode: "insensitive" } },
      });
      if (usuarioAlvo) {
        const novaSenha = Math.random().toString(36).slice(2, 10);
        acoes.push({
          acao: { tipo: "redefinir_senha_usuario", usuarioId: usuarioAlvo.id, nome: usuarioAlvo.nome, novaSenha },
          rotulo: `Redefinir a senha de ${usuarioAlvo.nome} (nova senha temporária: ${novaSenha})`,
        });
      }
    }

    // Ativar/suspender/bloquear/reativar a EMPRESA (só quando não é
    // claramente sobre um funcionário — ver `ehSobreFuncionario` acima).
    if (!ehSobreFuncionario && /(ativ[ae]r?|reativ[ae]r?)\b/.test(texto) && !/desativ/.test(texto)) {
      acoes.push({
        acao: { tipo: "alterar_status_empresa", empresaId: empresa.id, status: "ativa" },
        rotulo: `Ativar a empresa ${empresa.nome}`,
      });
    }
    if (!ehSobreFuncionario && /suspend|desativ/.test(texto)) {
      acoes.push({
        acao: { tipo: "alterar_status_empresa", empresaId: empresa.id, status: "suspensa" },
        rotulo: `Suspender a empresa ${empresa.nome}`,
      });
    }
    if (/bloque/.test(texto)) {
      acoes.push({
        acao: { tipo: "alterar_status_empresa", empresaId: empresa.id, status: "bloqueada" },
        rotulo: `Bloquear a empresa ${empresa.nome}`,
      });
    }

    // Módulos: "sem X, Y" → desabilitar
    const partesNegativas = texto.match(/(?:sem|não quero|nao quero|retir[ae]|remov[ae]|desativ[ae])\s+([a-zà-ú,\s]+)/g) ?? [];
    const negadas = new Set<string>();
    for (const trecho of partesNegativas) {
      for (const [palavra, modulo] of Object.entries(MODULOS_POR_PALAVRA)) {
        if (trecho.includes(palavra)) negadas.add(modulo);
      }
    }
    for (const [palavra, modulo] of Object.entries(MODULOS_POR_PALAVRA)) {
      if (!texto.includes(palavra)) continue;
      if (negadas.has(modulo)) {
        acoes.push({
          acao: { tipo: "desabilitar_modulo", empresaId: empresa.id, modulo },
          rotulo: `Desativar o módulo "${modulo}" em ${empresa.nome}`,
        });
      } else if (/ativ[ae]r?|habilit/.test(texto)) {
        acoes.push({
          acao: { tipo: "habilitar_modulo", empresaId: empresa.id, modulo },
          rotulo: `Ativar o módulo "${modulo}" em ${empresa.nome}`,
        });
      }
    }

    // Cor
    const corMatch = instrucao.match(/cor\s+(prim[aá]ria|secund[aá]ria)?\s*(?:para|=)?\s*(#[0-9a-fA-F]{3,6}|[a-zà-ú]+)/i);
    if (corMatch) {
      const campo = corMatch[1] && normalizar(corMatch[1]).startsWith("secund") ? "corSecundaria" : "corPrimaria";
      acoes.push({
        acao: { tipo: "alterar_tema", empresaId: empresa.id, campo, valor: corMatch[2] },
        rotulo: `Mudar ${campo === "corPrimaria" ? "a cor primária" : "a cor secundária"} de ${empresa.nome} para "${corMatch[2]}"`,
      });
    }

    // Plano
    const planoMatch = instrucao.match(/plano\s+["“]?([a-zà-ú0-9\s]+?)["”]?(?:\.|,|$)/i);
    if (planoMatch) {
      const nomePlano = planoMatch[1].trim();
      const plano = await prisma.plano.findFirst({
        where: { nome: { equals: nomePlano, mode: "insensitive" }, ativo: true },
      });
      if (plano) {
        acoes.push({
          acao: { tipo: "definir_plano", empresaId: empresa.id, planoId: plano.id, planoNome: plano.nome },
          rotulo: `Colocar ${empresa.nome} no plano ${plano.nome}`,
        });
      }
    }
  }

  // Landing page (não depende de empresa)
  const landingTitulo = instrucao.match(/t[ií]tulo (?:principal )?da landing.*?(?:para|:)\s*["“]([^"”]+)["”]/i);
  if (landingTitulo) {
    acoes.push({
      acao: { tipo: "alterar_landing", campo: "hero.titulo", valor: landingTitulo[1] },
      rotulo: `Mudar o título da landing page para "${landingTitulo[1]}"`,
    });
  }

  if (acoes.length === 0) {
    return {
      modo: "proposta",
      acoes: [
        {
          acao: {
            tipo: "fora_do_escopo",
            motivo:
              "Não consegui identificar uma ação conhecida (módulos, tema, plano, status da empresa, landing) nessa instrução, ou não identifiquei a empresa citada.",
          },
          rotulo: "Fora do catálogo de ações — gerar especificação técnica?",
        },
      ],
      resumo: "Não entendi uma ação clara. Se for algo que exige programação, posso gerar uma especificação técnica.",
    };
  }

  return { modo: "proposta", acoes, resumo: `Encontrei ${acoes.length} ação(ões) a partir da sua instrução.` };
}

/** Tenta interpretar via LLM (se configurado); sempre valida contra o catálogo real antes de aceitar. */
async function interpretarViaIa(instrucao: string): Promise<ResultadoInterpretacao | null> {
  const respostaLeitura = await responderLeitura(instrucao);
  if (respostaLeitura) return respostaLeitura;

  const empresas = await prisma.empresa.findMany({ select: { id: true, nome: true } });
  const prompt = `Você traduz a instrução de um Super Admin de plataforma SaaS em ações de um catálogo FECHADO.
Empresas cadastradas: ${empresas.map((e) => `"${e.nome}" (id=${e.id})`).join(", ") || "nenhuma"}.
Módulos válidos: ${MODULOS.join(", ")}.
Tipos de ação válidos (todos exigem empresaId real da lista acima, exceto alterar_landing/criar_plano):
habilitar_modulo{empresaId,modulo}, desabilitar_modulo{empresaId,modulo}, alterar_tema{empresaId,campo,valor},
alterar_texto{empresaId,chave,valor}, alterar_status_empresa{empresaId,status:ativa|suspensa|bloqueada},
alterar_landing{campo,valor}, fora_do_escopo{motivo}.
Instrução: "${instrucao}"
Responda APENAS um JSON: {"acoes":[{"acao":{...},"rotulo":"frase curta explicando a ação"}],"resumo":"..."}.
Nunca invente um empresaId que não esteja na lista — se não tiver certeza de qual empresa, use fora_do_escopo.`;
  try {
    const resposta = await chamarIA("copiloto_supremo", { prompt, temperatura: 0, json: true, timeoutMs: 15000 });
    if (!resposta) return null;
    registrarUsoIA(empresas[0]?.id ?? "plataforma", "admin", {
      tokensEntrada: resposta.tokensEntrada,
      tokensSaida: resposta.tokensSaida,
    }).catch(() => null);
    const bruto = JSON.parse(resposta.texto) as { acoes?: unknown[]; resumo?: string };
    if (!Array.isArray(bruto.acoes)) return null;

    const idsValidos = new Set(empresas.map((e) => e.id));
    const acoesValidas: AcaoComRotulo[] = [];
    for (const item of bruto.acoes) {
      const it = item as Record<string, unknown>;
      const a = it.acao as Record<string, unknown> | undefined;
      const rotulo = typeof it.rotulo === "string" ? it.rotulo : "Ação proposta pela IA";
      if (!a || typeof a.tipo !== "string") continue;

      if ((a.tipo === "habilitar_modulo" || a.tipo === "desabilitar_modulo") && ehModuloValido(a.modulo) && idsValidos.has(String(a.empresaId))) {
        acoesValidas.push({ acao: { tipo: a.tipo, empresaId: String(a.empresaId), modulo: a.modulo }, rotulo });
      } else if (a.tipo === "alterar_texto" && typeof a.chave === "string" && typeof a.valor === "string" && idsValidos.has(String(a.empresaId))) {
        acoesValidas.push({ acao: { tipo: "alterar_texto", empresaId: String(a.empresaId), chave: a.chave, valor: a.valor }, rotulo });
      } else if (a.tipo === "alterar_tema" && typeof a.campo === "string" && typeof a.valor === "string" && idsValidos.has(String(a.empresaId))) {
        acoesValidas.push({ acao: { tipo: "alterar_tema", empresaId: String(a.empresaId), campo: a.campo, valor: a.valor }, rotulo });
      } else if (
        a.tipo === "alterar_status_empresa" &&
        typeof a.status === "string" &&
        ["ativa", "suspensa", "bloqueada"].includes(a.status) &&
        idsValidos.has(String(a.empresaId))
      ) {
        acoesValidas.push({
          acao: { tipo: "alterar_status_empresa", empresaId: String(a.empresaId), status: a.status as "ativa" | "suspensa" | "bloqueada" },
          rotulo,
        });
      } else if (a.tipo === "alterar_landing" && typeof a.campo === "string" && typeof a.valor === "string") {
        acoesValidas.push({ acao: { tipo: "alterar_landing", campo: a.campo, valor: a.valor }, rotulo });
      } else if (a.tipo === "fora_do_escopo") {
        acoesValidas.push({ acao: { tipo: "fora_do_escopo", motivo: String(a.motivo ?? "Fora do escopo configurável.") }, rotulo });
      }
      // qualquer outro formato é silenciosamente descartado — nunca aplicado
    }
    if (acoesValidas.length === 0) return null;
    return { modo: "proposta", acoes: acoesValidas, resumo: String(bruto.resumo ?? "Ações interpretadas pela IA.") };
  } catch {
    return null;
  }
}

export async function interpretarInstrucao(instrucao: string): Promise<ResultadoInterpretacao> {
  const viaIa = await interpretarViaIa(instrucao);
  if (viaIa) return viaIa;
  return interpretarPorPalavraChave(instrucao);
}

interface SnapshotEmpresa {
  modulos?: string;
  tema?: string;
  textos?: string;
  planoId?: string | null;
  status?: string;
}

/**
 * Aplica uma lista de ações JÁ CONFIRMADAS pelo Super Admin, registrando
 * histórico (antes/depois) para permitir desfazer depois.
 */
/**
 * Human-in-the-loop de verdade (nunca confia na lista de ações que o
 * cliente reenvia): a proposta é guardada NO SERVIDOR sob um id
 * (`AcaoPendenteCopiloto`), com validade curta e vinculada a quem
 * pediu. A confirmação só precisa desse id — o backend aplica
 * exatamente o que ele mesmo gravou, nunca o que vier solto no corpo
 * da requisição de confirmação.
 */
export async function criarAcaoPendente(
  origem: "supremo" | "empresa",
  solicitanteId: string,
  empresaId: string | null,
  instrucaoOriginal: string,
  acoes: AcaoAdmin[]
): Promise<string> {
  const pendente = await prisma.acaoPendenteCopiloto.create({
    data: {
      origem,
      solicitanteId,
      empresaId,
      instrucaoOriginal,
      acoes: JSON.stringify(acoes),
      expiraEm: new Date(Date.now() + 10 * 60 * 1000), // 10 minutos
    },
  });
  return pendente.id;
}

/** Preenche um campo que faltava numa ação específica da proposta pendente (ex.: e-mail do novo usuário) antes de confirmar. */
export async function completarAcaoPendente(
  actionId: string,
  solicitanteId: string,
  indice: number,
  camposAdicionais: Record<string, unknown>
): Promise<{ ok: boolean; motivo?: string }> {
  const pendente = await prisma.acaoPendenteCopiloto.findUnique({ where: { id: actionId } });
  if (!pendente || pendente.solicitanteId !== solicitanteId) {
    return { ok: false, motivo: "Proposta não encontrada." };
  }
  if (pendente.resolvida || pendente.expiraEm < new Date()) {
    return { ok: false, motivo: "Esta proposta expirou ou já foi usada — peça de novo." };
  }
  const acoes = JSON.parse(pendente.acoes) as AcaoAdmin[];
  if (!acoes[indice]) return { ok: false, motivo: "Ação inválida." };
  acoes[indice] = { ...acoes[indice], ...camposAdicionais } as AcaoAdmin;
  await prisma.acaoPendenteCopiloto.update({ where: { id: actionId }, data: { acoes: JSON.stringify(acoes) } });
  return { ok: true };
}

/** Confirma e aplica uma proposta pendente — SEMPRE usando as ações gravadas no servidor, nunca as do corpo da requisição. */
export async function confirmarAcaoPendente(
  actionId: string,
  solicitanteId: string,
  superAdmin: { id: string; nome: string }
): Promise<
  | { ok: true; aplicadas: number; ignoradas: number; historicoId: string | null; usuariosCriados: { nome: string; email: string; senhaTemporaria: string }[] }
  | { ok: false; motivo: string }
> {
  const pendente = await prisma.acaoPendenteCopiloto.findUnique({ where: { id: actionId } });
  if (!pendente || pendente.solicitanteId !== solicitanteId) {
    return { ok: false, motivo: "Proposta não encontrada." };
  }
  if (pendente.resolvida) {
    return { ok: false, motivo: "Esta proposta já foi confirmada anteriormente." };
  }
  if (pendente.expiraEm < new Date()) {
    return { ok: false, motivo: "Esta proposta expirou — peça a ação de novo." };
  }

  const acoes = JSON.parse(pendente.acoes) as AcaoAdmin[];
  const resultado = await aplicarAcoes(acoes, superAdmin, pendente.instrucaoOriginal);
  await prisma.acaoPendenteCopiloto.update({ where: { id: actionId }, data: { resolvida: true } });
  return { ok: true, ...resultado };
}

export async function aplicarAcoes(
  acoes: AcaoAdmin[],
  superAdmin: { id: string; nome: string },
  instrucaoOriginal: string
): Promise<{
  aplicadas: number;
  ignoradas: number;
  historicoId: string | null;
  usuariosCriados: { nome: string; email: string; senhaTemporaria: string }[];
}> {
  const empresasEnvolvidas = new Map<string, { antes: SnapshotEmpresa; depois: SnapshotEmpresa }>();
  let landingAntes: LandingConteudo | null = null;
  let landingDepois: LandingConteudo | null = null;
  let aplicadas = 0;
  let ignoradas = 0;
  const usuariosCriados: { nome: string; email: string; senhaTemporaria: string }[] = [];

  async function empresaEmContexto(empresaId: string) {
    if (!empresasEnvolvidas.has(empresaId)) {
      const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
      if (!empresa) throw new Error("Empresa não encontrada.");
      const snapshot: SnapshotEmpresa = {
        modulos: empresa.modulos,
        tema: empresa.tema,
        textos: empresa.textos,
        planoId: empresa.planoId,
        status: empresa.status,
      };
      empresasEnvolvidas.set(empresaId, { antes: { ...snapshot }, depois: { ...snapshot } });
    }
    return empresasEnvolvidas.get(empresaId)!;
  }

  for (const acao of acoes) {
    try {
      switch (acao.tipo) {
        case "habilitar_modulo": {
          const ctx = await empresaEmContexto(acao.empresaId);
          const modulos = parseModulos(ctx.depois.modulos ?? "[]");
          if (!modulos.includes(acao.modulo)) ctx.depois.modulos = serializarModulos([...modulos, acao.modulo]);
          aplicadas++;
          break;
        }
        case "desabilitar_modulo": {
          const ctx = await empresaEmContexto(acao.empresaId);
          const modulos = parseModulos(ctx.depois.modulos ?? "[]");
          ctx.depois.modulos = serializarModulos(modulos.filter((m) => m !== acao.modulo));
          aplicadas++;
          break;
        }
        case "alterar_texto": {
          const ctx = await empresaEmContexto(acao.empresaId);
          const textos = parseTextos(ctx.depois.textos ?? "{}");
          ctx.depois.textos = serializarTextos({ ...textos, [acao.chave]: acao.valor });
          aplicadas++;
          break;
        }
        case "alterar_tema": {
          const ctx = await empresaEmContexto(acao.empresaId);
          const tema = parseTema(ctx.depois.tema ?? "{}");
          ctx.depois.tema = serializarTema({ ...tema, [acao.campo]: acao.valor } as TemaEmpresa);
          aplicadas++;
          break;
        }
        case "definir_plano": {
          const ctx = await empresaEmContexto(acao.empresaId);
          ctx.depois.planoId = acao.planoId;
          aplicadas++;
          break;
        }
        case "alterar_status_empresa": {
          const ctx = await empresaEmContexto(acao.empresaId);
          ctx.depois.status = acao.status;
          aplicadas++;
          break;
        }
        case "criar_usuario": {
          if (!acao.email) {
            ignoradas++; // sem e-mail ainda — o formulário de confirmação deve preenchê-lo antes
            break;
          }
          const jaExiste = await prisma.usuario.findUnique({ where: { email: acao.email } });
          if (jaExiste) {
            ignoradas++;
            break;
          }
          const bcrypt = await import("bcryptjs");
          const senhaTemporaria = Math.random().toString(36).slice(2, 10);
          await prisma.usuario.create({
            data: {
              empresaId: acao.empresaId,
              nome: acao.nome,
              email: acao.email,
              papel: acao.papel,
              senhaHash: bcrypt.hashSync(senhaTemporaria, 12),
              ativo: true,
            },
          });
          usuariosCriados.push({ nome: acao.nome, email: acao.email, senhaTemporaria });
          aplicadas++;
          break;
        }
        case "desativar_usuario": {
          await prisma.usuario.update({ where: { id: acao.usuarioId }, data: { ativo: false } });
          await prisma.sessao.deleteMany({ where: { usuarioId: acao.usuarioId } });
          aplicadas++;
          break;
        }
        case "reativar_usuario": {
          await prisma.usuario.update({ where: { id: acao.usuarioId }, data: { ativo: true } });
          aplicadas++;
          break;
        }
        case "redefinir_senha_usuario": {
          const bcrypt = await import("bcryptjs");
          await prisma.usuario.update({
            where: { id: acao.usuarioId },
            data: { senhaHash: bcrypt.hashSync(acao.novaSenha, 12) },
          });
          await prisma.sessao.deleteMany({ where: { usuarioId: acao.usuarioId } });
          aplicadas++;
          break;
        }
        case "alterar_landing": {
          if (!landingAntes) {
            const registro = await prisma.landingConfig.findUnique({ where: { id: "landing" } });
            landingAntes = registro ? parseLandingConteudo(registro.conteudo) : parseLandingConteudo("{}");
            landingDepois = JSON.parse(JSON.stringify(landingAntes));
          }
          // Campo em notação "secao.campo" (ex.: "hero.titulo")
          const [secao, campo] = acao.campo.split(".");
          if (landingDepois && secao && campo && secao in landingDepois) {
            (landingDepois as unknown as Record<string, Record<string, string>>)[secao][campo] = acao.valor;
          }
          aplicadas++;
          break;
        }
        case "criar_plano": {
          await prisma.plano.create({
            data: {
              nome: acao.nome,
              slug: acao.slug,
              preco: acao.preco,
              modulosPadrao: serializarModulos(acao.modulos),
            },
          });
          aplicadas++;
          break;
        }
        case "fora_do_escopo":
        case "sugestao_criar_empresa":
        default:
          ignoradas++;
          break;
      }
    } catch {
      ignoradas++;
    }
  }

  // Persiste as empresas alteradas.
  for (const [empresaId, { depois }] of empresasEnvolvidas) {
    await prisma.empresa.update({
      where: { id: empresaId },
      data: {
        ...(depois.modulos !== undefined ? { modulos: depois.modulos } : {}),
        ...(depois.tema !== undefined ? { tema: depois.tema } : {}),
        ...(depois.textos !== undefined ? { textos: depois.textos } : {}),
        ...(depois.planoId !== undefined ? { planoId: depois.planoId } : {}),
        ...(depois.status !== undefined ? { status: depois.status } : {}),
      },
    });
  }
  if (landingDepois) {
    await prisma.landingConfig.upsert({
      where: { id: "landing" },
      create: { id: "landing", conteudo: serializarLandingConteudo(landingDepois) },
      update: { conteudo: serializarLandingConteudo(landingDepois) },
    });
  }

  // Histórico (PEDIDO 8) — uma entrada por "sessão" de aplicação, cobrindo
  // todas as empresas/landing tocadas nesta chamada.
  let historicoId: string | null = null;
  if (aplicadas > 0) {
    const primeiraEmpresa = [...empresasEnvolvidas.keys()][0] ?? null;
    const empresaNome = primeiraEmpresa
      ? (await prisma.empresa.findUnique({ where: { id: primeiraEmpresa }, select: { nome: true } }))?.nome ?? null
      : null;
    const historico = await prisma.historicoCopiloto.create({
      data: {
        superAdminId: superAdmin.id,
        superAdminNome: superAdmin.nome,
        empresaId: empresasEnvolvidas.size === 1 ? primeiraEmpresa : null,
        empresaNome: empresasEnvolvidas.size === 1 ? empresaNome : null,
        instrucaoOriginal,
        acoesAplicadas: JSON.stringify(acoes),
        estadoAnterior: JSON.stringify({
          empresas: Object.fromEntries([...empresasEnvolvidas].map(([id, v]) => [id, v.antes])),
          landing: landingAntes,
        }),
        estadoNovo: JSON.stringify({
          empresas: Object.fromEntries([...empresasEnvolvidas].map(([id, v]) => [id, v.depois])),
          landing: landingDepois,
        }),
        sucesso: ignoradas === 0,
      },
    });
    historicoId = historico.id;
  }

  if (aplicadas > 0) {
    await registrarAuditoriaSuperAdmin(
      "copiloto_acoes_aplicadas",
      `Aplicadas ${aplicadas} ação(ões), ${ignoradas} ignorada(s). Instrução: ${instrucaoOriginal.slice(0, 200)}`,
      superAdmin.id
    );
  }

  return { aplicadas, ignoradas, historicoId, usuariosCriados };
}

/** Desfaz uma alteração aplicada pelo Copiloto Supremo (PEDIDO 8). */
export async function desfazerHistorico(historicoId: string): Promise<{ ok: boolean; motivo?: string }> {
  const registro = await prisma.historicoCopiloto.findUnique({ where: { id: historicoId } });
  if (!registro) return { ok: false, motivo: "Registro de histórico não encontrado." };
  if (registro.desfeitoEm) return { ok: false, motivo: "Esta alteração já foi desfeita anteriormente." };

  const estadoAnterior = JSON.parse(registro.estadoAnterior) as {
    empresas: Record<string, SnapshotEmpresa>;
    landing: LandingConteudo | null;
  };

  // Ações de usuário (criar/desativar/reativar/redefinir senha) ainda
  // não têm rollback automático — nunca finge que desfez algo que não
  // tem snapshot para reverter.
  if (Object.keys(estadoAnterior.empresas).length === 0 && !estadoAnterior.landing) {
    return {
      ok: false,
      motivo:
        "Esta ação (gestão de usuário) não tem reversão automática ainda — desfaça manualmente em Configurações → Usuários, se necessário.",
    };
  }

  for (const [empresaId, snapshot] of Object.entries(estadoAnterior.empresas)) {
    await prisma.empresa.update({
      where: { id: empresaId },
      data: {
        ...(snapshot.modulos !== undefined ? { modulos: snapshot.modulos } : {}),
        ...(snapshot.tema !== undefined ? { tema: snapshot.tema } : {}),
        ...(snapshot.textos !== undefined ? { textos: snapshot.textos } : {}),
        ...(snapshot.planoId !== undefined ? { planoId: snapshot.planoId } : {}),
        ...(snapshot.status !== undefined ? { status: snapshot.status } : {}),
      },
    });
  }
  if (estadoAnterior.landing) {
    await prisma.landingConfig.upsert({
      where: { id: "landing" },
      create: { id: "landing", conteudo: serializarLandingConteudo(estadoAnterior.landing) },
      update: { conteudo: serializarLandingConteudo(estadoAnterior.landing) },
    });
  }

  await prisma.historicoCopiloto.update({ where: { id: historicoId }, data: { desfeitoEm: new Date() } });
  return { ok: true };
}

/**
 * Gera uma especificação técnica estruturada para pedidos FORA do
 * catálogo de ações (exigem programação real) — PEDIDO 16. Nunca finge
 * que a funcionalidade existe; a especificação é o que o Super Admin
 * pode levar a uma ferramenta de desenvolvimento (Claude Code, etc.).
 */
export function gerarEspecificacaoTecnica(instrucao: string): string {
  return `# Especificação técnica — gerada pelo Copiloto Supremo

## Pedido original
"${instrucao}"

## Situação
Esta solicitação não corresponde a nenhuma ação do catálogo atual do
Copiloto Supremo (módulos, tema, textos, plano, status de empresa,
landing page) — exige desenvolvimento real (código novo).

## O que precisa ser levantado antes de implementar
1. **Objetivo**: o que exatamente o recurso deve fazer, para qual perfil
   de usuário (Administrador, Caixa, Garçom, Entregador, Cozinha)?
2. **Telas**: quais telas novas ou alteradas? Desktop, mobile, ou ambos?
3. **Banco de dados**: quais tabelas novas/campos novos? Pertencem ao
   schema da PLATAFORMA (public) ou ao schema de CADA EMPRESA (tenant)?
4. **APIs**: quais endpoints novos? Métodos, parâmetros, respostas.
5. **Permissões**: quais papéis podem usar (ADMINISTRADOR/CAIXA/GARCOM/
   COZINHA/ENTREGADOR)? Precisa de um recurso novo em
   \`src/lib/permissao.ts\`?
6. **Multiempresa**: os dados ficam isolados por \`empresaId\` e pelo
   schema do tenant, como o restante do sistema?
7. **Integrações**: depende de serviço externo (WhatsApp, fiscal,
   impressora, pagamento)?
8. **Impacto**: quais módulos/arquivos existentes seriam tocados?
9. **Testes**: como validar que funciona e que não quebrou o que já
   existe?
10. **Critérios de aceite**: o que precisa ser verdade para considerar
    pronto?

## Próximo passo
Leve esta especificação (preenchida com as respostas às perguntas
acima) para uma ferramenta de desenvolvimento (Claude Code ou
equivalente) — o Copiloto Supremo não altera código-fonte diretamente.`;
}
