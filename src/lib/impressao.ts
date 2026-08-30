/**
 * Impressão térmica (80 mm) — fila, dedupe e geração de conteúdo.
 *
 * O sistema NÃO imprime fisicamente: ele enfileira conteúdo formatado
 * para 80 mm e um AGENTE LOCAL (componente externo) consome a fila
 * via `GET /api/impressao/fila` (token) e imprime na impressora da
 * máquina. Ver `scripts/agente-impressao/` e o README (PEDIDO 16).
 *
 * Regras:
 * - Nada é marcado como concluído sem confirmação do agente (`/concluir`);
 * - Erro reportado (`/erro`) incrementa tentativas e NÃO conclui;
 * - Eventos automáticos usam dedupe: se já existe `pendente|erro` para a
 *   mesma (tipo, referência), não duplica;
 * - Reimpressão manual cria registro novo (intencional).
 */

import { createHash, randomBytes } from "node:crypto";
import { prisma, plataformaPrisma } from "./prisma";
import { formatarChave } from "./fiscal/chave";
import { emitirEventoTempoReal } from "./eventos-tempo-real";

/**
 * Duração do lease de impressão (PEDIDO 2: "usar um tempo seguro e
 * configurável", não um timeout cego fixo). O agente RENOVA o lease via
 * heartbeat enquanto imprime de verdade (várias vias, spooler lento) —
 * este valor só importa quando o agente PARA de responder (queda,
 * processo morto). Configurável via `IMPRESSAO_LEASE_MS`; padrão 45s —
 * folgado o bastante para uma impressão normal terminar antes do
 * primeiro heartbeat, mas não tanto que um agente morto trave a fila
 * por muito tempo.
 */
export const LEASE_DURACAO_MS = Number(process.env.IMPRESSAO_LEASE_MS) > 0 ? Number(process.env.IMPRESSAO_LEASE_MS) : 45_000;

/**
 * Função/destino de uma impressão. "cozinha" e "caixa" continuam sendo os
 * dois CANAIS físicos que `FilaImpressao.destino` sempre usou (preservado
 * — é o que decide qual papel vê o quê na fila, ver `GET /api/impressao`).
 * Os demais valores são as FUNÇÕES que uma impressora pode atender
 * (cadastro em Admin → Configurações → Impressoras, campo `destinos`,
 * múltipla escolha) — não mudam o canal de roteamento existente, só
 * deixam o cadastro da impressora mais expressivo do que "cozinha ou
 * caixa" (ex.: uma impressora pode atender balcão + retirada + delivery
 * + mesa ao mesmo tempo).
 */
export type DestinoImpressao =
  | "cozinha"
  | "caixa"
  | "balcao"
  | "retirada"
  | "delivery"
  | "mesa"
  | "fechamento_caixa"
  | "cupom_nao_fiscal"
  | "outros";

/** Só os dois canais físicos de roteamento da fila (preservado do comportamento existente). */
export type CanalImpressao = "cozinha" | "caixa";

export const DESTINOS_IMPRESSORA: { valor: DestinoImpressao; rotulo: string }[] = [
  { valor: "cozinha", rotulo: "Cozinha" },
  { valor: "caixa", rotulo: "Caixa (cupom do cliente)" },
  { valor: "balcao", rotulo: "Balcão" },
  { valor: "retirada", rotulo: "Retirada" },
  { valor: "delivery", rotulo: "Delivery" },
  { valor: "mesa", rotulo: "Comanda de mesa" },
  { valor: "fechamento_caixa", rotulo: "Fechamento de caixa" },
  { valor: "cupom_nao_fiscal", rotulo: "Cupom não fiscal" },
  { valor: "outros", rotulo: "Outros documentos internos" },
];

export type TipoImpressao =
  | "pedido-cozinha"
  | "pedido-balcao"
  | "retirada"
  | "delivery"
  | "cupom"
  | "fechamento-caixa"
  | "teste";

/** Largura do texto para térmica de 80 mm (fonte normal, 12 cpi). */
export const LARGURA_80MM = 42;

export const TITULOS_IMPRESSAO: Record<TipoImpressao, string> = {
  "pedido-cozinha": "COMANDA — COZINHA",
  "pedido-balcao": "COMANDA — BALCÃO",
  retirada: "COMANDA — RETIRADA",
  delivery: "COMANDA — DELIVERY",
  cupom: "CUPOM DO CLIENTE",
  "fechamento-caixa": "FECHAMENTO DE CAIXA",
  teste: "TESTE DE IMPRESSÃO",
};

/** Tipos de comanda de pedido (usados na reimpressão manual). */
export const TIPOS_PEDIDO: TipoImpressao[] = ["pedido-cozinha", "pedido-balcao", "retirada", "delivery"];

/** Comanda de cozinha sai no destino caixa? (balcão/retirada/delivery → caixa). */
export function tipoParaCanal(tipo: TipoImpressao): CanalImpressao {
  return tipo === "pedido-cozinha" ? "cozinha" : "caixa";
}

/** Tipo de comanda correspondente ao canal do pedido. */
export function tipoParaCanalPedido(canal: string): TipoImpressao {
  switch (canal) {
    case "salao":
      return "pedido-cozinha";
    case "retirada":
      return "retirada";
    case "delivery":
      return "delivery";
    default:
      return "pedido-balcao";
  }
}

/* ------------------------------ Formatação ------------------------------ */

export function centralizar(texto: string, largura = LARGURA_80MM): string {
  const t = texto.trim();
  if (t.length >= largura) return t.slice(0, largura);
  const espacos = Math.max(0, Math.floor((largura - t.length) / 2));
  return " ".repeat(espacos) + t;
}

export function alinharEsquerda(texto: string, largura = LARGURA_80MM): string {
  return (texto + " ".repeat(largura)).slice(0, largura);
}

export function alinharDireita(texto: string, largura = LARGURA_80MM): string {
  return (" ".repeat(largura) + texto).slice(-largura);
}

/** Quebra um texto longo em linhas de até `largura` colunas (palavras inteiras). */
export function embrulhar(texto: string, largura = LARGURA_80MM): string[] {
  const palavras = String(texto ?? "").trim().split(/\s+/);
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of palavras) {
    if ((atual + " " + palavra).trim().length <= largura) {
      atual = (atual + " " + palavra).trim();
    } else {
      if (atual) linhas.push(atual);
      atual = palavra.length > largura ? palavra.slice(0, largura) : palavra;
    }
  }
  if (atual) linhas.push(atual);
  return linhas.length ? linhas : [""];
}

export function dinheiro(valor: number): string {
  return "R$ " + (valor ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const LINHA_SIMPLES = "-".repeat(LARGURA_80MM);
export const LINHA_DUPLA = "=".repeat(LARGURA_80MM);

/** Linha "rótulo ......... R$ valor" com exatamente `LARGURA_80MM` colunas. */
export function linhaValor80mm(rotulo: string, valor: number): string {
  const preco = alinharDireita(dinheiro(valor), 14);
  return alinharEsquerda(rotulo, LARGURA_80MM - preco.length - 1) + " " + preco;
}

/* -------------------------------- Config -------------------------------- */

export interface ImpressaoConfig {
  largura: string;
}

export const IMPRESSAO_CONFIG_PADRAO: ImpressaoConfig = {
  largura: "80mm",
};

/** Impressora com `destinos` já decodificado (evita repetir JSON.parse em toda tela). */
export interface ImpressoraResolvida {
  id: string;
  nome: string;
  modelo: string | null;
  fabricante: string | null;
  tipoConexao: string;
  nomeWindows: string | null;
  enderecoIp: string | null;
  porta: string | null;
  larguraPapel: string;
  vias: number;
  impressaoAutomatica: boolean;
  destinos: DestinoImpressao[];
  computadorVinculado: string | null;
  ultimaComunicacaoEm: Date | null;
  statusOnline: boolean;
  ativa: boolean;
}

function decodificarDestinos(json: string): DestinoImpressao[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as DestinoImpressao[]) : [];
  } catch {
    return [];
  }
}

/** Mesmo limite usado no status geral do agente (ver /api/impressao/status). */
const LIMITE_OFFLINE_MS = 30_000;

/** Todas as impressoras ATIVAS desta empresa (Admin → Configurações → Impressoras). */
export async function lerImpressoras(empresaId: string): Promise<ImpressoraResolvida[]> {
  const registros = await prisma.impressora.findMany({
    where: { empresaId, ativa: true },
    orderBy: { criadaEm: "asc" },
  });
  return registros.map((r) => {
    // `statusOnline` gravado no banco só é ligado pelo heartbeat — nunca
    // desligado sozinho quando o agente para. Recalcular pela idade do
    // último contato é o que faz a impressora "ficar offline" de verdade
    // quando a máquina desliga, sem precisar de um job periódico à parte.
    const online =
      r.statusOnline &&
      !!r.ultimaComunicacaoEm &&
      Date.now() - r.ultimaComunicacaoEm.getTime() < LIMITE_OFFLINE_MS;
    return {
      id: r.id,
      nome: r.nome,
      modelo: r.modelo,
      fabricante: r.fabricante,
      tipoConexao: r.tipoConexao,
      nomeWindows: r.nomeWindows,
      enderecoIp: r.enderecoIp,
      porta: r.porta,
      larguraPapel: r.larguraPapel,
      vias: r.vias,
      impressaoAutomatica: r.impressaoAutomatica,
      destinos: decodificarDestinos(r.destinos),
      computadorVinculado: r.computadorVinculado,
      ultimaComunicacaoEm: r.ultimaComunicacaoEm,
      statusOnline: online,
      ativa: r.ativa,
    };
  });
}

/** Token do agente de impressão desta empresa (por empresa/dispositivo — PEDIDO 20). */
export async function lerConfigImpressao(empresaId: string): Promise<ImpressaoConfig> {
  const r = await prisma.configuracao.findUnique({
    where: { empresaId_chave: { empresaId, chave: "impressao" } },
  });
  if (!r) return IMPRESSAO_CONFIG_PADRAO;
  try {
    const v = JSON.parse(r.valor) as Partial<ImpressaoConfig>;
    return { ...IMPRESSAO_CONFIG_PADRAO, ...v };
  } catch {
    return IMPRESSAO_CONFIG_PADRAO;
  }
}

/**
 * Resolve a empresa dona de um token de agente — SEMPRE por HASH, nunca
 * comparando texto puro (PEDIDO 5 anterior: "banco deve guardar hash
 * seguro do token").
 *
 * CORREÇÃO CRÍTICA (PEDIDO 1 — bloqueador real, não só risco): antes,
 * esta função consultava `prisma.configuracao` (modelo de TENANT — cada
 * empresa tem seu PRÓPRIO schema Postgres, não é uma linha filtrada por
 * empresaId) tentando "procurar em todas as empresas" — algo
 * estruturalmente impossível de fazer numa única consulta quando cada
 * tenant é um schema separado, e que além disso o Proxy de
 * `src/lib/prisma.ts` bloqueia explicitamente (lança erro ao acessar
 * model de tenant sem tenant ativo no contexto — e aqui, por definição,
 * ainda não sabemos qual tenant ativar). Resultado: todo agente de
 * impressão falhava ao se autenticar, sempre.
 *
 * Agora consulta `Empresa.agenteImpressaoTokenHash` — campo de
 * PLATAFORMA (schema `public`, sempre acessível sem tenant ativo,
 * `@unique` no banco). Só DEPOIS de resolver a empresa aqui é que o
 * chamador ativa o tenant dela (`ativarTenant`) para usar a fila de
 * impressão de verdade.
 */
export async function encontrarEmpresaPorTokenAgente(token: string): Promise<string | null> {
  if (!token) return null;
  const hash = createHash("sha256").update(token).digest("hex");
  const empresa = await plataformaPrisma.empresa.findUnique({
    where: { agenteImpressaoTokenHash: hash },
    select: { id: true },
  });
  return empresa?.id ?? null;
}

/**
 * Acha a impressora configurada para uma FUNÇÃO (`destino`) desta empresa.
 * Prioriza impressora online; se nenhuma estiver online, ainda devolve
 * uma offline (o job fica pendente na fila até o agente voltar — ver
 * PEDIDO 6, "se a impressora estiver offline, o trabalho permanece
 * pendente"). `null` só quando NENHUMA impressora ativa atende a função.
 */
export function impressoraDoDestino(
  impressoras: ImpressoraResolvida[],
  destino: DestinoImpressao
): ImpressoraResolvida | null {
  const candidatas = impressoras.filter((i) => i.destinos.includes(destino));
  return candidatas.find((i) => i.statusOnline) ?? candidatas[0] ?? null;
}

/**
 * Roteamento final de impressão por FUNÇÃO real (correção: antes,
 * balcão/retirada/delivery/cupom/fechamento eram todos resolvidos como
 * "caixa" — uma impressora cadastrada só com `destinos: ["caixa"]` não
 * atende retirada, por exemplo, mas o sistema mandava pra ela do mesmo
 * jeito). Cada tipo de pedido agora vira a função exata que o cadastro
 * de impressoras usa para decidir qual impressora atende:
 *
 *   pedido de salão/mesa → "mesa"  (se alguma impressora tiver "mesa"
 *                           cadastrado) OU "cozinha" (senão) — a mesma
 *                           impressora pode atender as duas funções ao
 *                           mesmo tempo (ver exemplo da ELGIN i9).
 *   balcão   → "balcao"
 *   retirada → "retirada"
 *   delivery → "delivery"
 *   cozinha (ticket de produção, todo pedido) → "cozinha"
 *   cupom    → "cupom_nao_fiscal" (se configurado) OU "caixa" (senão)
 *   fechamento de caixa → "fechamento_caixa"
 */
export function destinoRealDoTipo(tipo: TipoImpressao, impressoras: ImpressoraResolvida[]): DestinoImpressao {
  switch (tipo) {
    case "pedido-cozinha":
      return impressoras.some((i) => i.destinos.includes("mesa")) ? "mesa" : "cozinha";
    case "pedido-balcao":
      return "balcao";
    case "retirada":
      return "retirada";
    case "delivery":
      return "delivery";
    case "cupom":
      return impressoras.some((i) => i.destinos.includes("cupom_nao_fiscal")) ? "cupom_nao_fiscal" : "caixa";
    case "fechamento-caixa":
      return "fechamento_caixa";
    case "teste":
      return "outros";
    default:
      return "caixa";
  }
}

/* ------------------------------- Enfileirar ------------------------------ */

export interface EnfileirarImpressao {
  tipo: TipoImpressao;
  destino: DestinoImpressao;
  referencia: string;
  conteudo: string;
  vias?: number;
  criadoPor?: string;
  /** Impressora específica deste trabalho — ver `Impressora.id`. */
  impressoraId?: string | null;
  /** Snapshot do nome no Windows no momento do enfileiramento. */
  nomeImpressoraWindows?: string | null;
}

export async function enfileirarImpressao(
  empresaId: string,
  opts: EnfileirarImpressao,
  dedupe = true
) {
  if (dedupe) {
    const existente = await prisma.filaImpressao.findFirst({
      where: {
        empresaId,
        tipo: opts.tipo,
        referencia: opts.referencia,
        status: { in: ["pendente", "processando", "erro"] },
      },
      orderBy: { criadoEm: "desc" },
    });
    if (existente) return { registro: existente, duplicado: true };
  }
  const registro = await prisma.filaImpressao.create({
    data: {
      empresaId,
      tipo: opts.tipo,
      destino: opts.destino,
      referencia: opts.referencia,
      conteudo: opts.conteudo,
      vias: Math.max(1, opts.vias ?? 1),
      criadoPor: opts.criadoPor ?? null,
      impressoraId: opts.impressoraId ?? null,
      nomeImpressoraWindows: opts.nomeImpressoraWindows ?? null,
    },
  });
  return { registro, duplicado: false };
}

/**
 * Enfileira um evento automático se houver impressora configurada para o
 * destino com impressão automática ligada. Retorna null se não imprimir.
 */
export async function enfileirarAutomatica(empresaId: string, opts: EnfileirarImpressao) {
  const impressoras = await lerImpressoras(empresaId);
  const impressora = impressoraDoDestino(impressoras, opts.destino);
  if (!impressora || !impressora.impressaoAutomatica) return null;
  const resultado = await enfileirarImpressao(
    empresaId,
    {
      ...opts,
      vias: Math.max(1, impressora.vias ?? 1),
      impressoraId: impressora.id,
      nomeImpressoraWindows: impressora.tipoConexao === "windows" ? impressora.nomeWindows : null,
    },
    true
  );
  emitirEventoTempoReal(empresaId, "impressao", { referencia: opts.referencia });
  return resultado;
}

/* ----------------------------- Geradores 80 mm ---------------------------- */

export interface ItemParaImpressao {
  nome: string;
  quantidade: number;
  precoUnit: number;
  tamanho?: string | null;
  sabores?: string[] | null;
  adicionais?: { nome: string; preco: number }[] | null;
  observacao?: string | null;
}

export interface PedidoParaImpressao {
  numero: number;
  canal: string;
  clienteNome?: string | null;
  mesaNumero?: number | null;
  observacao?: string | null;
  total: number;
  criadoEm: Date;
  entrega?: { endereco?: string | null; bairro?: string | null } | null;
  itens: ItemParaImpressao[];
}

export interface EmpresaParaImpressao {
  nomeFantasia: string;
  razaoSocial: string;
  cnpj: string;
  rua: string;
  cidade: string;
  telefone: string;
}

export async function lerEmpresaParaImpressao(empresaId: string): Promise<EmpresaParaImpressao> {
  const r = await prisma.configuracao.findUnique({
    where: { empresaId_chave: { empresaId, chave: "empresa" } },
  });
  const padrao: EmpresaParaImpressao = {
    nomeFantasia: "Minha Empresa",
    razaoSocial: "Minha Empresa LTDA",
    cnpj: "",
    rua: "",
    cidade: "",
    telefone: "",
  };
  if (!r) return padrao;
  try {
    const v = JSON.parse(r.valor) as Partial<EmpresaParaImpressao>;
    return { ...padrao, ...v };
  } catch {
    return padrao;
  }
}

export interface ConfigPizza {
  /** Acréscimo por sabor premium adicional (especial/doce). */
  acrescimoPorSaborPremium: number;
  /** Se pode misturar sabores doces com salgados no mesmo item. */
  permitirMisturarDoceSalgada: boolean;
}

/**
 * Lê a configuração de preço de pizza da empresa.
 *
 * ETAPA 1 — NÃO há fallback silencioso: se a empresa não tiver a chave
 * "pizza" configurada, retorna `null`. Quem chama DEVE recusar a operação
 * (409) quando o item tiver 2+ sabores premium, em vez de chutar um valor
 * e cobrar a mais/menos sem o dono saber. Cobrar errado em silêncio é pior
 * que falhar.
 */
export async function lerConfigPizza(empresaId: string): Promise<ConfigPizza | null> {
  const r = await prisma.configuracao.findUnique({
    where: { empresaId_chave: { empresaId, chave: "pizza" } },
  });
  if (!r) return null;
  try {
    const v = JSON.parse(r.valor) as unknown;
    if (v && typeof v === "object") {
      const obj = v as Record<string, unknown>;
      const acrescimo = Number(
        obj.acrescimoPorSaborPremium ?? obj.precoEspecialSegundoSabor ?? 10
      );
      if (!isNaN(acrescimo)) {
        const misturar =
          obj.permitirMisturarDoceSalgada === undefined
            ? true
            : Boolean(obj.permitirMisturarDoceSalgada);
        return {
          acrescimoPorSaborPremium: Math.max(0, acrescimo),
          permitirMisturarDoceSalgada: misturar,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function cabecalhoEmpresa(empresa: EmpresaParaImpressao): string[] {
  return [
    centralizar(empresa.nomeFantasia.toUpperCase()),
    centralizar(empresa.razaoSocial),
    centralizar(`${empresa.rua} · ${empresa.cidade}`),
    centralizar(`CNPJ: ${empresa.cnpj}`),
    centralizar(`Fone: ${empresa.telefone}`),
    LINHA_DUPLA,
  ];
}

function formatarDataHora(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const ROTULO_CANAL: Record<string, string> = {
  balcao: "BALCÃO",
  salao: "SALÃO",
  retirada: "RETIRADA",
  delivery: "DELIVERY",
};

function linhasDeItens(pedido: PedidoParaImpressao, comPrecos: boolean): string[] {
  const linhas: string[] = [];
  /** Embrulha o texto com recuo fixo de 3 colunas. */
  const comRecuo = (texto: string) => embrulhar(texto, LARGURA_80MM - 3).map((l) => `   ${l}`);
  pedido.itens.forEach((item, i) => {
    const seq = String(i + 1).padStart(2, "0");
    const desc = `${item.quantidade}x ${item.nome.toUpperCase()}`;
    const preco = comPrecos
      ? " " + dinheiro(item.precoUnit * item.quantidade)
      : "";
    const larguraDisponivel = LARGURA_80MM - (preco ? preco.length + 1 : 0);
    const partes = embrulhar(desc, larguraDisponivel - 6);
    const primeira = partes[0] ?? "";
    linhas.push(`${seq} ${(primeira + " ".repeat(larguraDisponivel - 6)).slice(0, larguraDisponivel - 6)}${preco}`);
    for (const resto of partes.slice(1)) {
      linhas.push("   " + resto);
    }
    if (item.tamanho) linhas.push(`   Tam: ${item.tamanho}`);
    if (item.sabores?.length) {
      for (const l of comRecuo(`Sabores: ${item.sabores.join(" + ")}`)) linhas.push(l);
    }
    if (item.adicionais?.length) {
      for (const a of item.adicionais) {
        for (const l of comRecuo(`Adic.: ${a.nome} (+${dinheiro(a.preco)})`)) linhas.push(l);
      }
    }
    if (item.observacao) {
      for (const o of comRecuo(`Obs.: ${item.observacao}`)) linhas.push(o);
    }
  });
  return linhas;
}

/** Comanda da cozinha/balcão/retirada/delivery (sem preços na cozinha). */
export function gerarTextoPedido(pedido: PedidoParaImpressao, tipo: TipoImpressao, empresa: EmpresaParaImpressao): string {
  const linhas: string[] = [];
  linhas.push(...cabecalhoEmpresa(empresa));
  linhas.push(centralizar(TITULOS_IMPRESSAO[tipo]));
  linhas.push(centralizar(`PEDIDO Nº ${pedido.numero}`));
  linhas.push(`Canal: ${ROTULO_CANAL[pedido.canal] ?? pedido.canal.toUpperCase()}`);
  if (pedido.mesaNumero) linhas.push(`Mesa: ${String(pedido.mesaNumero).padStart(2, "0")}`);
  if (pedido.clienteNome) {
    for (const c of embrulhar(`Cliente: ${pedido.clienteNome}`)) linhas.push(c);
  }
  if (pedido.entrega?.endereco || pedido.entrega?.bairro) {
    const end = [pedido.entrega.endereco, pedido.entrega.bairro].filter(Boolean).join(" — ");
    for (const e of embrulhar(`Entrega: ${end}`)) linhas.push(e);
  }
  linhas.push(`Hora: ${formatarDataHora(pedido.criadoEm)}`);
  linhas.push(LINHA_SIMPLES);
  const comPrecos = tipo !== "pedido-cozinha";
  linhas.push(...linhasDeItens(pedido, comPrecos));
  linhas.push(LINHA_SIMPLES);
  if (pedido.observacao) {
    for (const o of embrulhar(`Obs.: ${pedido.observacao}`)) linhas.push(o);
    linhas.push(LINHA_SIMPLES);
  }
  if (comPrecos) {
    linhas.push(linhaValor80mm("TOTAL", pedido.total));
    linhas.push(LINHA_SIMPLES);
  }
  linhas.push(centralizar("AGUARDANDO PAGAMENTO / RETIRADA"));
  linhas.push("");
  linhas.push(centralizar(empresa.telefone));
  linhas.push("");
  return linhas.join("\n");
}

export interface PagamentoParaImpressao {
  forma: string;
  valor: number;
  troco: number;
  criadoEm: Date;
}

const ROTULO_FORMA: Record<string, string> = {
  pix: "PIX",
  dinheiro: "DINHEIRO",
  credito: "CRÉDITO",
  debito: "DÉBITO",
};

/** Cupom/comprovante do cliente após o pagamento. */
export function gerarTextoCupom(pedido: PedidoParaImpressao, pagamento: PagamentoParaImpressao, empresa: EmpresaParaImpressao): string {
  const linhas: string[] = [];
  linhas.push(...cabecalhoEmpresa(empresa));
  linhas.push(centralizar(TITULOS_IMPRESSAO.cupom));
  linhas.push(centralizar(`PEDIDO Nº ${pedido.numero}`));
  linhas.push(`Canal: ${ROTULO_CANAL[pedido.canal] ?? pedido.canal.toUpperCase()}`);
  if (pedido.mesaNumero) linhas.push(`Mesa: ${String(pedido.mesaNumero).padStart(2, "0")}`);
  if (pedido.clienteNome) {
    for (const c of embrulhar(`Cliente: ${pedido.clienteNome}`)) linhas.push(c);
  }
  linhas.push(`Data: ${formatarDataHora(pedido.criadoEm)}`);
  linhas.push(LINHA_SIMPLES);
  pedido.itens.forEach((item) => {
    const preco = dinheiro(item.precoUnit * item.quantidade);
    const desc = `${item.quantidade}x ${item.nome.toUpperCase()}`;
    const larguraDisponivel = LARGURA_80MM - (preco.length + 1);
    for (const parte of embrulhar(desc, larguraDisponivel - 3)) {
      linhas.push((parte + " ".repeat(larguraDisponivel - 3)).slice(0, larguraDisponivel - 3) + " " + preco);
    }
    if (item.tamanho) linhas.push(`   Tam: ${item.tamanho}`);
    if (item.adicionais?.length) {
      for (const a of item.adicionais) {
        for (const l of embrulhar(`   Adic.: ${a.nome} (+${dinheiro(a.preco)})`, LARGURA_80MM)) linhas.push(l);
      }
    }
  });
  linhas.push(LINHA_SIMPLES);
  const linhaValor = (rotulo: string, valor: number) => linhaValor80mm(rotulo, valor);
  linhas.push(linhaValor("Subtotal", pedido.total));
  const totalPago = pagamento.valor + Math.max(0, pagamento.troco);
  linhas.push(linhaValor(`${ROTULO_FORMA[pagamento.forma] ?? pagamento.forma.toUpperCase()}`, totalPago));
  if (pagamento.troco > 0) linhas.push(linhaValor("Troco", pagamento.troco));
  linhas.push(linhaValor("TOTAL", totalPago));
  linhas.push(LINHA_DUPLA);
  linhas.push(centralizar("OBRIGADO PELA PREFERÊNCIA!"));
  linhas.push(centralizar(empresa.telefone));
  linhas.push("");
  return linhas.join("\n");
}

export interface MovimentacaoParaImpressao {
  tipo: string;
  valor: number;
  metodo: string | null;
  descricao: string | null;
  criadoEm: Date;
}

export interface ResumoCaixaParaImpressao {
  saldoInicial: number;
  vendasDinheiro: number;
  vendasOutras: number;
  trocos: number;
  sangrias: number;
  entradas: number;
}

/** Relatório de fechamento de caixa (impresso no destino caixa). */
export function gerarTextoFechamentoCaixa(
  caixa: { abertoEm: Date; fechadoEm: Date | null },
  resumo: ResumoCaixaParaImpressao,
  movimentacoes: MovimentacaoParaImpressao[],
  empresa: EmpresaParaImpressao
): string {
  const linhas: string[] = [];
  linhas.push(...cabecalhoEmpresa(empresa));
  linhas.push(centralizar(TITULOS_IMPRESSAO["fechamento-caixa"]));
  linhas.push(`Abertura:  ${formatarDataHora(caixa.abertoEm)}`);
  linhas.push(`Fechamento: ${formatarDataHora(caixa.fechadoEm ?? new Date())}`);
  linhas.push(LINHA_DUPLA);
  const linhaValor = (rotulo: string, valor: number) => linhaValor80mm(rotulo, valor);
  linhas.push(linhaValor("Saldo inicial", resumo.saldoInicial));
  linhas.push(linhaValor("Vendas (dinheiro)", resumo.vendasDinheiro));
  linhas.push(linhaValor("Vendas (outras)", resumo.vendasOutras));
  linhas.push(linhaValor("Trocos", resumo.trocos));
  linhas.push(linhaValor("Sangrias", resumo.sangrias));
  linhas.push(linhaValor("Entradas", resumo.entradas));
  linhas.push(LINHA_SIMPLES);
  linhas.push(linhaValor("DINHEIRO EM CAIXA", resumo.saldoInicial + resumo.vendasDinheiro - resumo.trocos - resumo.sangrias + resumo.entradas));
  linhas.push(LINHA_SIMPLES);
  if (movimentacoes.length) {
    linhas.push(centralizar("MOVIMENTAÇÕES"));
    for (const m of movimentacoes) {
      const rotulo = `${String(new Date(m.criadoEm).getHours()).padStart(2, "0")}:${String(new Date(m.criadoEm).getMinutes()).padStart(2, "0")} ${m.tipo.toUpperCase()}${m.metodo ? ` (${m.metodo})` : ""}`;
      const larguraRotulo = LARGURA_80MM - 15;
      const partesRotulo = embrulhar(rotulo, larguraRotulo);
      linhas.push(`${(partesRotulo[0] + " ".repeat(larguraRotulo)).slice(0, larguraRotulo)} ${alinharDireita(dinheiro(m.valor), 14)}`);
      for (const resto of partesRotulo.slice(1)) {
        linhas.push("    " + resto);
      }
      if (m.descricao) {
        for (const d of embrulhar(m.descricao, LARGURA_80MM - 4)) linhas.push("    " + d);
      }
    }
  }
  linhas.push("");
  return linhas.join("\n");
}

/** Texto de teste de impressão (perfil/destino). */
export function gerarTextoTeste(destino: DestinoImpressao, impressora: string | null, nomeEmpresa?: string): string {
  const linhas: string[] = [
    LINHA_DUPLA,
    centralizar("PEDIDOFLOW"),
    centralizar("Teste de impressão"),
    LINHA_DUPLA,
    nomeEmpresa ? `Empresa: ${nomeEmpresa}` : null,
    `Destino: ${destino.toUpperCase()}`,
    impressora ? `Impressora: ${impressora}` : "Impressora: (não configurada)",
    `Data/Hora: ${formatarDataHora(new Date())}`,
    LINHA_SIMPLES,
    "Caracteres:",
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    "abcdefghijklmnopqrstuvwxyz0123456789",
    LINHA_SIMPLES,
    centralizar("Se você está lendo isto,"),
    centralizar("a impressora foi configurada"),
    centralizar("corretamente."),
    LINHA_DUPLA,
    "",
  ].filter((l): l is string => l !== null);
  return linhas.join("\n");
}

/* --------------------------- Carregar e enfileirar ----------------------- */

export function referenciaPedido(numero: number): string {
  return `pedido:${numero}`;
}

export function referenciaCaixa(id: string): string {
  return `caixa:${id}`;
}

export async function carregarPedidoParaImpressao(
  empresaId: string,
  numero: number
): Promise<PedidoParaImpressao | null> {
  const pedido = await prisma.pedido.findUnique({
    where: { empresaId_numero: { empresaId, numero } },
    include: {
      itens: true,
      mesa: { select: { numero: true } },
      entrega: { select: { endereco: true, bairro: true } },
    },
  });
  if (!pedido) return null;
  return {
    numero: pedido.numero,
    canal: pedido.canal,
    clienteNome: pedido.clienteNome,
    mesaNumero: pedido.mesa?.numero ?? null,
    observacao: pedido.observacao,
    total: pedido.total,
    criadoEm: pedido.criadoEm,
    entrega: pedido.entrega,
    itens: pedido.itens.map((i) => ({
      nome: i.nome,
      quantidade: i.quantidade,
      precoUnit: i.precoUnit,
      tamanho: i.tamanho,
      sabores: parseJsonArray(i.sabores),
      adicionais: parseAdicionais(i.adicionais),
      observacao: i.observacao,
    })),
  };
}

function parseJsonArray(valor: string | null): string[] | null {
  if (!valor) return null;
  try {
    const v: unknown = JSON.parse(valor);
    if (!Array.isArray(v)) return null;
    // Aceita tanto o formato antigo [nome] quanto o novo
    // [{ saborId, nome, tipo }] (ETAPA 1).
    return v.map((s) =>
      s && typeof s === "object" && "nome" in (s as Record<string, unknown>)
        ? String((s as Record<string, unknown>).nome)
        : String(s)
    );
  } catch {
    return null;
  }
}

function parseAdicionais(valor: string | null): { nome: string; preco: number }[] | null {
  if (!valor) return null;
  try {
    const v: unknown = JSON.parse(valor);
    if (!Array.isArray(v)) return null;
    return v.map((a) => {
      const b = a as { nome?: unknown; preco?: unknown };
      return { nome: String(b.nome ?? ""), preco: Number(b.preco ?? 0) };
    });
  } catch {
    return null;
  }
}

/**
 * Gera o conteúdo de impressão de um pedido a partir do número — usado
 * pela reimpressão manual e pelo enfileiramento automático de comandas.
 */
export async function gerarConteudoPedido(
  empresaId: string,
  numero: number,
  tipo: TipoImpressao
): Promise<string | null> {
  const pedido = await carregarPedidoParaImpressao(empresaId, numero);
  if (!pedido) return null;
  const empresa = await lerEmpresaParaImpressao(empresaId);
  return gerarTextoPedido(pedido, tipo, empresa);
}

/** Cupom/comprovante do cliente — reimpressão (usa o último pagamento). */
export async function gerarConteudoCupom(empresaId: string, numero: number): Promise<string | null> {
  const pedido = await prisma.pedido.findUnique({
    where: { empresaId_numero: { empresaId, numero } },
    include: { itens: true, mesa: { select: { numero: true } }, documentoFiscal: true },
  });
  if (!pedido) return null;
  const pagamento = await prisma.pagamento.findFirst({
    where: { pedidoId: pedido.id, empresaId },
    orderBy: { criadoEm: "desc" },
  });
  if (!pagamento) return null;
  const empresa = await lerEmpresaParaImpressao(empresaId);
  const texto = gerarTextoCupom(
    {
      numero: pedido.numero,
      canal: pedido.canal,
      clienteNome: pedido.clienteNome,
      mesaNumero: pedido.mesa?.numero ?? null,
      observacao: pedido.observacao,
      total: pedido.total,
      criadoEm: pedido.criadoEm,
      entrega: null,
      itens: pedido.itens.map((i) => ({
        nome: i.nome,
        quantidade: i.quantidade,
        precoUnit: i.precoUnit,
        tamanho: i.tamanho,
        sabores: parseJsonArray(i.sabores),
        adicionais: parseAdicionais(i.adicionais),
        observacao: i.observacao,
      })),
    },
    { forma: pagamento.forma, valor: pagamento.valor, troco: pagamento.troco, criadoEm: pagamento.criadoEm },
    empresa
  );

  // Bloco fiscal (PEDIDO 19): quando a NFC-e foi AUTORIZADA pela SEFAZ,
  // o cupom imprime chave e protocolo reais. Sem autorização o comprovante
  // é apenas não fiscal — nada é simulado.
  const doc = pedido.documentoFiscal;
  if (doc?.status === "autorizado" && doc.chave) {
    const linhasFiscais: string[] = [
      LINHA_SIMPLES,
      "DOCUMENTO FISCAL — NFC-e",
      `NFC-e nº ${doc.numero ?? "—"} · Série ${doc.serie ?? "—"}`,
      `Ambiente: ${doc.ambiente === "producao" ? "PRODUÇÃO" : "HOMOLOGAÇÃO"}`,
      ...embrulhar(`Chave: ${formatarChave(doc.chave)}`, LARGURA_80MM),
    ];
    if (doc.protocolo) linhasFiscais.push(`Protocolo: ${doc.protocolo}`);
    if (doc.autorizadaEm) {
      linhasFiscais.push(`Autorizada em: ${formatarDataHora(doc.autorizadaEm)}`);
    }
    linhasFiscais.push(LINHA_SIMPLES);
    return `${texto}\n${linhasFiscais.join("\n")}`;
  }

  return texto;
}

/** Relatório de fechamento de caixa — reimpressão. */
export async function gerarConteudoFechamentoCaixa(empresaId: string, id: string): Promise<string | null> {
  const caixa = await prisma.caixa.findFirst({
    where: { id, empresaId },
    include: { movimentacoes: true },
  });
  if (!caixa) return null;
  const resumo = calcularResumoCaixa(
    caixa.movimentacoes.map((m) => ({ tipo: m.tipo, valor: m.valor, metodo: m.metodo })),
    caixa.saldoInicial
  );
  const empresa = await lerEmpresaParaImpressao(empresaId);
  return gerarTextoFechamentoCaixa(
    { abertoEm: caixa.abertoEm, fechadoEm: caixa.fechadoEm },
    resumo,
    caixa.movimentacoes.map((m) => ({
      tipo: m.tipo,
      valor: m.valor,
      metodo: m.metodo,
      descricao: m.descricao,
      criadoEm: m.criadoEm,
    })),
    empresa
  );
}

export function calcularResumoCaixa(
  movimentacoes: { tipo: string; valor: number; metodo: string | null }[],
  saldoInicial: number
): ResumoCaixaParaImpressao {
  let vendasDinheiro = 0;
  let vendasOutras = 0;
  let trocos = 0;
  let sangrias = 0;
  let entradas = 0;
  for (const m of movimentacoes) {
    if (m.tipo === "venda") {
      if (m.metodo === "dinheiro") vendasDinheiro += m.valor;
      else vendasOutras += m.valor;
    } else if (m.tipo === "troco") trocos += m.valor;
    else if (m.tipo === "sangria") sangrias += m.valor;
    else if (m.tipo === "entrada") entradas += m.valor;
  }
  return { saldoInicial, vendasDinheiro, vendasOutras, trocos, sangrias, entradas };
}
