/**
 * Tipos do módulo fiscal (PEDIDO 19) — NFC-e via provedor/API compatível.
 *
 * Contrato compartilhado entre o motor (`src/lib/fiscal/*`), as rotas da
 * API e a interface. Nenhum valor fiscal é fabricado aqui: tudo que é
 * "autorizado" vem da resposta do provedor (SEFAZ).
 */

/** Situações possíveis do documento fiscal na venda. */
export type StatusDocumentoFiscal =
  | "pendente" // aguardando envio/emissão
  | "enviado" // requisição enviada ao provedor (aguardando autorização)
  | "autorizado" // SEFAZ autorizou (protocolo presente)
  | "rejeitado" // SEFAZ rejeitou (cStat/xMotivo preenchidos)
  | "cancelado" // autorizado e depois cancelado (com justificativa)
  | "nao_configurado" // provedor/credenciais ausentes — NÃO é sucesso
  | "erro"; // falha técnica (rede, validação, resposta inesperada)

export const STATUS_FISCAL_ROTULOS: Record<StatusDocumentoFiscal, string> = {
  pendente: "Pendente",
  enviado: "Em processamento",
  autorizado: "Autorizado",
  rejeitado: "Rejeitado",
  cancelado: "Cancelado",
  nao_configurado: "Não configurado",
  erro: "Erro técnico",
};

export type AmbienteFiscal = "producao" | "homologacao";

export interface ConfigFiscalProvedor {
  provedor: string; // identificador livre (ex.: "focus", "nf-e.io", "webmania")
  urlBase: string; // base da API do provedor (sem segredo)
  timeoutMs: number;
}

/** O que a integração precisa para funcionar de verdade (sem segredos). */
export interface StatusConfiguracaoFiscal {
  configurado: boolean; // tudo que a emissão real exige está presente
  ambiente: AmbienteFiscal; // ambiente EFETIVO (env tem precedência sobre o banco)
  ambienteFonte: "env" | "banco";
  provedor: string;
  urlBase: string;
  faltando: string[]; // itens necessários e ausentes (credenciais, CSC, certificado…)
  observacoes: string[]; // avisos (ex.: ambiente de homologação, CSC placeholder)
  emitirAutomatico: boolean;
  serie: number | null;
  proximoNumero: number | null;
}

/** Item da NFC-e no payload enviado ao provedor. */
export interface ItemFiscalNFCe {
  numero: number;
  codigo: string; // id do produto (código interno)
  descricao: string; // nome + tamanho/sabores/adicionais (descrição da venda)
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  ncm: string;
  cfop: string;
  unidade: string; // unCom
  csosn: string;
  cest?: string;
}

/** Pagamento da NFC-e no payload (tPag + vPag). */
export interface PagamentoFiscalNFCe {
  forma: string; // código tPag: 01 dinheiro, 03 crédito, 04 débito, 15 pix
  valor: number;
  troco?: number;
}

/** Payload completo de emissão (contrato com o provedor — ver README). */
export interface PayloadEmissaoNFCe {
  numero: number;
  serie: number;
  ambiente: "1" | "2"; // 1 produção | 2 homologação (tAmb)
  naturezaOperacao: string;
  dataEmissao: string; // ISO 8601
  emitente: {
    cnpj: string;
    razaoSocial: string;
    nomeFantasia?: string;
    inscricaoEstadual?: string;
    endereco: string;
    municipio: string;
    uf: string;
    cep?: string;
    telefone?: string;
    regime: string; // ex.: "Simples Nacional"
  };
  destinatario?: {
    nome?: string;
    cpf?: string;
    cnpj?: string;
  };
  itens: ItemFiscalNFCe[];
  totais: {
    produtos: number;
    pagamento: number;
    troco?: number;
  };
  pagamentos: PagamentoFiscalNFCe[];
  informacoesAdicionais?: string;
}

/** Resposta normalizada de uma operação com o provedor. */
export interface ResultadoProvedor<T = unknown> {
  ok: boolean;
  status: StatusDocumentoFiscal;
  dados?: T;
  cStat?: string;
  xMotivo?: string;
  erro?: string; // detalhe técnico (não exibe segredos)
}

/** Dados úteis extraídos da resposta de emissão do provedor. */
export interface RetornoEmissao {
  chave?: string;
  numero?: number;
  serie?: number;
  protocolo?: string;
  cStat?: string;
  xMotivo?: string;
  xml?: string;
  danfeUrl?: string;
  qrcodeUrl?: string;
  qrcodeTexto?: string;
}

/** Resultado normalizado de emissão. */
export interface ResultadoEmissao {
  status: StatusDocumentoFiscal;
  retorno?: RetornoEmissao;
  erro?: string;
}

/** Resultado normalizado de consulta/cancelamento. */
export interface ResultadoConsulta {
  status: StatusDocumentoFiscal;
  protocolo?: string;
  cStat?: string;
  xMotivo?: string;
  xml?: string;
  danfeUrl?: string;
  qrcodeUrl?: string;
  qrcodeTexto?: string;
  erro?: string;
}

export interface ResultadoCancelamento {
  status: StatusDocumentoFiscal;
  protocolo?: string;
  cStat?: string;
  xMotivo?: string;
  erro?: string;
}

/** Resumo da configuração fiscal para o front (nunca contém segredos). */
export interface ConfiguracaoFiscalPublica {
  ambiente: AmbienteFiscal;
  ambienteFonte: "env" | "banco";
  provedor: string;
  urlBase: string;
  configurado: boolean;
  faltando: string[];
  observacoes: string[];
  emitirAutomatico: boolean;
  serie: number | null;
  proximoNumero: number | null;
  logo: boolean;
}
