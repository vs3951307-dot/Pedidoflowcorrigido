/**
 * Configurações — tipos e valores-padrão (vazios/neutros) da empresa,
 * emissão NFC-e, impressoras, produtos, taxas, backup e usuários.
 *
 * Os dados de verdade vêm de `GET/PUT /api/configuracoes`. Os valores
 * abaixo são só o fallback usado enquanto a resposta real não chega —
 * nenhum é exibido como se fosse dado real da empresa.
 */

import { PRODUTOS } from "./catalogo";

/* --------------------------------- Empresa ------------------------------- */

export interface EmpresaDados {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  inscricaoEstadual: string;
  rua: string;
  cidade: string;
  uf: string;
  cep: string;
  telefone: string;
  email: string;
  regime: string;
  /** Estimativa mensal (R$), usada no relatório Financeiro. 0 = não configurado. */
  despesaFolhaMensal: number;
}

// Valor inicial (placeholder) usado apenas como estado de carregamento no
// componente antes da resposta real de `GET /api/configuracoes` chegar —
// cada empresa tem seu próprio registro real no banco (tabela
// `Configuracao`, chave "empresa"). Deliberadamente genérico: nunca deve
// exibir dados de uma empresa específica (ex.: a Disk Pizza Rozeno) para
// outra enquanto a tela carrega.
export const EMPRESA_DADOS: EmpresaDados = {
  razaoSocial: "",
  nomeFantasia: "",
  cnpj: "",
  inscricaoEstadual: "",
  rua: "",
  cidade: "",
  uf: "",
  cep: "",
  telefone: "",
  email: "",
  regime: "Simples Nacional",
  despesaFolhaMensal: 0,
};

/* ---------------------------------- NFC-e -------------------------------- */

/**
 * Configuração da NFC-e persistida NO BANCO (chave "nfce"). Credenciais e
 * segredos (CSC, token, certificado) NUNCA ficam aqui — só em variáveis de
 * ambiente (ver `src/lib/fiscal/config.ts`).
 */
export interface NfceConfig {
  serie: number;
  proximoNumero: number;
  ambiente: "producao" | "homologacao";
  logo: boolean;
  emitirAutomatico: boolean;
  provedor: string;
}

export const NFCE_CONFIG: NfceConfig = {
  serie: 1,
  proximoNumero: 1,
  ambiente: "homologacao",
  logo: true,
  emitirAutomatico: true,
  provedor: "",
};

/* ------------------------------- Impressoras ----------------------------- */

export type StatusImpressora = "conectada" | "offline" | "configurar";

export interface Impressora {
  nome: string;
  tipo: "térmica 80mm" | "térmica 58mm" | "laser A4";
  conexao: string;
  padrao: boolean;
  status: StatusImpressora;
  /** Função no fluxo (PEDIDO 16): destino da fila de impressão. */
  destino: "cozinha" | "caixa" | null;
  /** Quantidade de vias em cada impressão (1–3). */
  vias: number;
  /** Impressão automática no evento (ex.: novo pedido, pagamento). */
  automatica: boolean;
}

/** Impressoras vêm do banco (GET /api/configuracoes, chave "impressoras") — nenhuma de exemplo. */
export const IMPRESSORAS: Impressora[] = [];

/* -------------------------------- Produtos ------------------------------- */

export interface ProdutoConfiguracao {
  id: string;
  nome: string;
  categoria: string;
  preco: number;
  emoji: string;
  ativo: boolean;
  destaque?: boolean;
  /** Dados fiscais (PEDIDO 19): usados na NFC-e. Vêm do banco; aqui só o tipo. */
  ncm?: string | null;
  cest?: string | null;
  csosn?: string | null;
  cfop?: string | null;
  unidade?: string | null;
  /** Caminho público da foto, quando cadastrada. */
  fotoUrl?: string | null;
}

export const PRODUTOS_CONFIGURACAO: ProdutoConfiguracao[] = PRODUTOS.map((produto) => ({
  id: produto.id,
  nome: produto.nome,
  categoria: produto.categoria,
  preco: produto.preco,
  emoji: produto.emoji,
  ativo: produto.id !== "be-agua",
  destaque: produto.destaque,
}));

/* ---------------------------------- Taxas --------------------------------- */

export type FormaTaxa = "pix" | "credito" | "debito" | "dinheiro";

export interface TaxaConfiguracao {
  forma: FormaTaxa;
  rotulo: string;
  taxaPct: number;
  valorFixo: number;
  prazo: string;
  ativo: boolean;
}

/** Regras da taxa de entrega (PEDIDO 17) — cálculo em `src/lib/delivery.ts`. */
export interface TaxaEntregaConfig {
  regra: "fixa" | "bairro";
  valorFixo: number;
  valorPadrao: number;
  gratisAcima: number;
  bairros: { bairro: string; valor: number }[];
}

/** Formas e taxas vêm do banco (GET /api/configuracoes, chave "taxas") — nenhuma de exemplo. */
export const TAXAS_PAGAMENTO: TaxaConfiguracao[] = [];

/**
 * Taxa de entrega por regras configuráveis (PEDIDO 17): `fixa` ou
 * `bairro`. O valor real vem do banco (chave "taxas"); este é apenas o
 * formato neutro vazio usado enquanto a tela carrega.
 */
export const TAXA_ENTREGA: TaxaEntregaConfig = {
  regra: "fixa",
  valorFixo: 0,
  valorPadrao: 0,
  gratisAcima: 0,
  bairros: [],
};

/* ---------------------------------- Backup -------------------------------- */

export type StatusBackup = "concluido" | "falhou" | "em_andamento";

export interface RegistroBackup {
  data: string;
  hora: string;
  tipo: "automático" | "manual";
  tamanho: string;
  destino: string;
  status: StatusBackup;
}

/** Histórico de backups vem do banco (GET /api/backups) — nenhum registro de exemplo. */
export const ULTIMO_BACKUP: {
  data: string;
  hora: string;
  tamanho: string;
  destino: string;
} | null = null;

export const BACKUPS: RegistroBackup[] = [];

/* --------------------------------- Usuários ------------------------------- */

export type PerfilUsuario = "gerente" | "caixa" | "garcom" | "cozinha" | "entregador";

export type StatusUsuario = "ativo" | "inativo";

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: PerfilUsuario;
  ultimoAcesso: string;
  status: StatusUsuario;
}

/** Usuários vêm do banco (GET /api/usuarios) — nenhum usuário de exemplo. */
export const USUARIOS: Usuario[] = [];
