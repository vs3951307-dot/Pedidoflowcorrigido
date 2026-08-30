/**
 * Configuração da integração fiscal (PEDIDO 19).
 *
 * Divisão de responsabilidades:
 *  - Banco (Configuracao "nfce"): série, numeração, ambiente, logo,
 *    emissão automática, identificação do provedor. Editável no Admin.
 *  - Variáveis de ambiente (NFCe_*): credenciais, URL do provedor e
 *    certificado — NUNCA ficam no banco nem em código.
 *
 * Precedência do ambiente: NFCe_AMBIENTE (env) > banco. Quando o env
 * força homologação, o sistema nunca emite como produção.
 *
 * Nenhum segredo é exposto pelas funções deste módulo (as públicas só
 * retornam o que falta, nunca o valor).
 */

import { prisma } from "@/lib/prisma";
import { criptografarSegredo, descriptografarSegredo } from "@/lib/crypto-segredos";
import type {
  AmbienteFiscal,
  ConfigFiscalProvedor,
  StatusConfiguracaoFiscal,
} from "@/lib/fiscal/tipos";

export interface NfceConfigBanco {
  serie: number;
  proximoNumero: number;
  ambiente: AmbienteFiscal;
  logo: boolean;
  emitirAutomatico: boolean;
  provedor: string; // identificador do provedor (ex.: "focus")
  // --------- Dados cadastrais/credenciais por empresa (PEDIDO 10) ---------
  // Cadastrais (não são segredo, mas isolados por empresa):
  cnpj?: string;
  inscricaoEstadual?: string;
  razaoSocial?: string;
  nomeFantasia?: string;
  enderecoFiscal?: string;
  regimeTributario?: string;
  // Credenciais (SEMPRE criptografadas em repouso — ver crypto-segredos.ts):
  csc?: string; // código de segurança do contribuinte
  cscId?: string;
  tokenProvedor?: string; // token de acesso do provedor fiscal
  certificadoBase64?: string; // conteúdo do .pfx (base64), quando enviado pelo painel
  certificadoSenha?: string;
}

/** Campos deste tipo que precisam estar criptografados no JSON persistido. */
const CAMPOS_SECRETOS = ["csc", "cscId", "tokenProvedor", "certificadoBase64", "certificadoSenha"] as const;

function criptografarCampos(dados: Partial<NfceConfigBanco>): Record<string, unknown> {
  const copia: Record<string, unknown> = { ...dados };
  for (const campo of CAMPOS_SECRETOS) {
    const valor = copia[campo];
    if (typeof valor === "string" && valor) {
      copia[campo] = criptografarSegredo(valor);
    }
  }
  return copia;
}

function descriptografarCampos(json: Record<string, unknown>): Record<string, unknown> {
  const copia: Record<string, unknown> = { ...json };
  for (const campo of CAMPOS_SECRETOS) {
    const valor = copia[campo];
    if (typeof valor === "string" && valor) {
      try {
        copia[campo] = descriptografarSegredo(valor);
      } catch {
        copia[campo] = ""; // valor corrompido/chave trocada — nunca quebra a leitura
      }
    }
  }
  return copia;
}

const CHAVE_BANCO = "nfce";

/** Variáveis de ambiente que a emissão real exige (credenciais/segredos). */
const ENV_NECESSARIAS: { env: string; rotulo: string }[] = [
  { env: "NFCe_PROVEDOR_URL", rotulo: "NFCe_PROVEDOR_URL (URL da API do provedor)" },
  { env: "NFCe_TOKEN", rotulo: "NFCe_TOKEN (token de acesso do provedor)" },
];

/** Variáveis obrigatórias dependendo do modo de autenticação do provedor. */
const ENV_OPCIONAIS: { env: string; rotulo: string }[] = [
  { env: "NFCe_CSC", rotulo: "NFCe_CSC (código de segurança do contribuinte)" },
  { env: "NFCe_CSC_ID", rotulo: "NFCe_CSC_ID (id do CSC)" },
  { env: "NFCe_CERT_PATH", rotulo: "NFCe_CERT_PATH (caminho do certificado A1 .pfx)" },
  { env: "NFCe_CERT_SENHA", rotulo: "NFCe_CERT_SENHA (senha do certificado)" },
];

function lerEnv(nome: string): string {
  return process.env[nome]?.trim() ?? "";
}

export function ambienteDoEnv(): AmbienteFiscal | null {
  const valor = lerEnv("NFCe_AMBIENTE").toLowerCase();
  if (valor === "homologacao" || valor === "homologação" || valor === "2" || valor === "teste") {
    return "homologacao";
  }
  if (valor === "producao" || valor === "1") {
    return "producao";
  }
  return null;
}

export function configProvedorDoEnv(): ConfigFiscalProvedor {
  const url = lerEnv("NFCe_PROVEDOR_URL");
  const timeout = Number(lerEnv("NFCe_TIMEOUT_MS") || "15000");
  return {
    provedor: lerEnv("NFCe_PROVEDOR") || "provedor-nfce",
    urlBase: url.replace(/\/+$/, ""),
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 15000,
  };
}

export function tokenDoEnv(): string {
  return lerEnv("NFCe_TOKEN");
}

/** Token do provedor EFETIVO desta empresa: cadastro próprio > .env (legado). */
export async function tokenEfetivo(empresaId: string): Promise<string> {
  const banco = await lerConfigNfceBanco(empresaId);
  return banco.tokenProvedor || tokenDoEnv();
}

/** Lê a configuração de NFC-e persistida no banco DESTA EMPRESA (fallback = valores padrão). Credenciais já vêm descriptografadas. */
export async function lerConfigNfceBanco(empresaId: string): Promise<NfceConfigBanco> {
  const registro = await prisma.configuracao.findUnique({
    where: { empresaId_chave: { empresaId, chave: CHAVE_BANCO } },
  });
  const base: NfceConfigBanco = {
    serie: 1,
    proximoNumero: 1,
    ambiente: "homologacao",
    logo: true,
    emitirAutomatico: true,
    provedor: "",
  };
  if (!registro) return base;
  try {
    const bruto = descriptografarCampos(JSON.parse(registro.valor));
    const v = bruto as Partial<NfceConfigBanco>;
    return {
      serie: Number.isFinite(Number(v.serie)) ? Number(v.serie) : base.serie,
      proximoNumero:
        Number.isFinite(Number(v.proximoNumero)) ? Number(v.proximoNumero) : base.proximoNumero,
      ambiente: v.ambiente === "producao" ? "producao" : "homologacao",
      logo: typeof v.logo === "boolean" ? v.logo : base.logo,
      emitirAutomatico:
        typeof v.emitirAutomatico === "boolean" ? v.emitirAutomatico : base.emitirAutomatico,
      provedor: typeof v.provedor === "string" ? v.provedor : base.provedor,
      cnpj: v.cnpj, inscricaoEstadual: v.inscricaoEstadual, razaoSocial: v.razaoSocial,
      nomeFantasia: v.nomeFantasia, enderecoFiscal: v.enderecoFiscal, regimeTributario: v.regimeTributario,
      csc: v.csc, cscId: v.cscId, tokenProvedor: v.tokenProvedor,
      certificadoBase64: v.certificadoBase64, certificadoSenha: v.certificadoSenha,
    };
  } catch {
    return base;
  }
}

/**
 * Ambiente EFETIVO da emissão: NFCe_AMBIENTE (env) tem precedência sobre
 * o banco — um servidor com env de homologação nunca emite em produção.
 */
export async function ambienteEfetivo(empresaId: string): Promise<{
  ambiente: AmbienteFiscal;
  fonte: "env" | "banco";
}> {
  const doEnv = ambienteDoEnv();
  if (doEnv) return { ambiente: doEnv, fonte: "env" };
  const banco = await lerConfigNfceBanco(empresaId);
  return { ambiente: banco.ambiente, fonte: "banco" };
}

export async function salvarConfigNfceBanco(empresaId: string, dados: Partial<NfceConfigBanco>): Promise<void> {
  const atual = await lerConfigNfceBanco(empresaId);
  const novo: NfceConfigBanco = {
    ...atual,
    ...dados,
    serie: Number(dados.serie) > 0 ? Number(dados.serie) : atual.serie,
    proximoNumero: Number(dados.proximoNumero) >= 0 ? Number(dados.proximoNumero) : atual.proximoNumero,
  };
  const paraGravar = criptografarCampos(novo);
  await prisma.configuracao.upsert({
    where: { empresaId_chave: { empresaId, chave: CHAVE_BANCO } },
    create: { empresaId, chave: CHAVE_BANCO, valor: JSON.stringify(paraGravar) },
    update: { valor: JSON.stringify(paraGravar) },
  });
}

/**
 * Estado da configuração (público, sem segredos): lista exatamente o que
 * falta para a emissão real e o ambiente efetivo. `configurado=false`
 * significa que NENHUMA nota será emitida — o sistema não simula sucesso.
 */
/**
 * NOTA (SaaS multiempresa): a configuração de SÉRIE/NUMERAÇÃO/AMBIENTE
 * já é isolada por empresa (tabela Configuracao). As CREDENCIAIS reais do
 * provedor (token, CSC, certificado A1) ainda vêm do `.env` do processo —
 * ou seja, servem hoje para UMA empresa emissora por instância. Isolar
 * credenciais fiscais por empresa no banco requer um cofre de segredos
 * com criptografia em repouso (não implementado nesta etapa) — ver
 * relatório de auditoria final.
 */
export async function statusConfiguracaoFiscal(empresaId: string): Promise<StatusConfiguracaoFiscal> {
  const [banco, efetivo] = await Promise.all([
    lerConfigNfceBanco(empresaId),
    ambienteEfetivo(empresaId),
  ]);
  const provedorEnv = configProvedorDoEnv();
  const faltando: string[] = [];
  const observacoes: string[] = [];

  // Credenciais: preferência para o que a EMPRESA cadastrou pelo painel
  // (Configurações → Fiscal/NFC-e); cai para o .env só quando a empresa
  // não configurou nada (modo legado/instalação de uma empresa só).
  const csc = banco.csc || lerEnv("NFCe_CSC");
  const cscId = banco.cscId || lerEnv("NFCe_CSC_ID");
  const tokenProvedor = banco.tokenProvedor || tokenDoEnv();
  const certificado = banco.certificadoBase64 || lerEnv("NFCe_CERT_PATH");
  const certificadoSenha = banco.certificadoSenha || lerEnv("NFCe_CERT_SENHA");
  const urlBase = provedorEnv.urlBase; // URL do provedor continua por instância (infraestrutura, não credencial do cliente)

  if (!urlBase) faltando.push("NFCe_PROVEDOR_URL (URL da API do provedor — configuração da instância)");
  if (!tokenProvedor) faltando.push("Token do provedor fiscal (cadastre em Configurações → Fiscal, ou NFCe_TOKEN no .env)");
  if (!csc) faltando.push("CSC — código de segurança do contribuinte (fornecido pela SEFAZ/contador)");
  if (!cscId) faltando.push("ID do CSC");

  if (efetivo.ambiente === "producao") {
    if (!certificado) faltando.push("Certificado digital A1 (.pfx) do emitente");
    if (!certificadoSenha) faltando.push("Senha do certificado digital");
  } else {
    observacoes.push("Ambiente de HOMOLOGAÇÃO: notas emitidas aqui NÃO têm validade fiscal.");
    if (certificado || certificadoSenha) {
      observacoes.push("Certificado A1 informado — será usado apenas em produção.");
    }
  }

  const cscValido = /^[A-F0-9]{32,36}$/i.test(csc) && /^\d+$/.test(cscId);
  if (csc && !cscValido) faltando.push("CSC/ID do CSC em formato inválido — confira com o contador/provedor.");

  return {
    configurado: faltando.length === 0 && Boolean(urlBase),
    ambiente: efetivo.ambiente,
    ambienteFonte: efetivo.fonte,
    provedor: banco.provedor || provedorEnv.provedor,
    urlBase,
    faltando,
    observacoes,
    emitirAutomatico: banco.emitirAutomatico,
    serie: banco.serie,
    proximoNumero: banco.proximoNumero,
  };
}
