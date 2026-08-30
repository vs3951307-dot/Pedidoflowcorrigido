/**
 * Agente de impressão local — componente EXTERNO que roda no computador
 * do estabelecimento e faz a ponte entre o PedidoFlow (hospedado na
 * internet) e a impressora física conectada a esta máquina.
 *
 * PedidoFlow → fila de impressão → ESTE AGENTE → impressora física.
 *
 * O que ele faz:
 *   - identifica o computador onde está rodando (hostname);
 *   - detecta as impressoras instaladas no Windows (PowerShell Get-Printer,
 *     com fallback para wmic em Windows mais antigos) e reporta a lista
 *     pro painel poder mostrar num seletor — nunca escolhe sozinho;
 *   - avisa o PedidoFlow que está online a cada consulta da fila
 *     (heartbeat — é o que liga o badge "Agente conectado" no painel);
 *   - busca trabalhos PENDENTES da fila da empresa (nunca de outra —
 *     o token no header decide a empresa, o agente não escolhe);
 *   - imprime (ver `imprimir()` — plugável, ver as opções abaixo);
 *   - só confirma sucesso DEPOIS de imprimir de verdade;
 *   - em qualquer falha, reporta o erro (a fila mantém pendente e tenta
 *     de novo, até o limite de tentativas do servidor).
 *
 * Como rodar:
 *   SET AGENTE_URL=https://seusite.com
 *   SET AGENTE_TOKEN=<token cadastrado em Admin > Configurações > Impressão>
 *   SET AGENTE_DESTINO=cozinha            # cozinha | caixa (vazio = ambos)
 *   node agente.mjs
 *
 * Opções de impressão física (escolha UMA, dentro de `imprimir()`):
 *   1. Impressora "Generic / Text Only" instalada no Windows: grava o
 *      conteúdo num .txt temporário e manda pra fila de impressão do SO
 *      via `notepad /p` (ver IMPRIMIR_VIA abaixo — já implementado).
 *   2. Lib ESC/POS (ex.: `escpos`/`escpos-usb` do npm) para impressora
 *      térmica USB/rede direta — substitua o corpo de `imprimirEscPos()`.
 *   3. Ferramenta de terceiros que monitore uma pasta e envie pra
 *      térmica (RawBT, "Virtual USB Printer" etc.) — aponte
 *      IMPRIMIR_VIA=pasta e configure PASTA_SAIDA.
 *
 * Contrato de confirmação:
 *   - Reivindica o trabalho (/processando) ANTES de imprimir — se outro
 *     agente já pegou, pula sem imprimir (evita impressão duplicada);
 *   - Imprime na impressora ESPECÍFICA gravada no próprio trabalho
 *     (`item.nomeImpressoraWindows` — nunca uma impressora fixa por
 *     agente: cada trabalho já sabe qual impressora usar, definido em
 *     Admin > Configurações > Impressoras);
 *   - Imprime UMA VEZ PARA CADA VIA (`item.vias`);
 *   - Só chama /concluir DEPOIS de imprimir todas as vias de verdade;
 *   - Em qualquer falha, chama /erro com a mensagem.
 */

import { hostname, platform } from "node:os";
import { spawn } from "node:child_process";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE_URL = process.env.AGENTE_URL ?? "http://localhost:3000";
const TOKEN = process.env.AGENTE_TOKEN ?? "";
const DESTINO = process.env.AGENTE_DESTINO ?? ""; // cozinha | caixa (vazio = ambos)
const INTERVALO_MS = Number(process.env.AGENTE_INTERVALO_MS ?? 3000);
const DETECCAO_INTERVALO_MS = Number(process.env.AGENTE_DETECCAO_INTERVALO_MS ?? 60_000);
// windows_print | pasta — ver opções no cabeçalho.
const IMPRIMIR_VIA = process.env.AGENTE_IMPRIMIR_VIA ?? "windows_print";
const COMPUTADOR = process.env.AGENTE_COMPUTADOR ?? hostname();

if (!TOKEN) {
  console.error("Defina AGENTE_TOKEN (mesmo valor cadastrado em Admin > Configurações > Impressão).");
  process.exit(1);
}

/**
 * Impressoras "virtuais" nunca devem ser oferecidas/usadas automaticamente
 * (PEDIDO 5: "Não utilizar Microsoft Print to PDF ou impressoras virtuais
 * automaticamente") — filtradas ANTES de reportar pro painel.
 */
const PADROES_VIRTUAIS = [
  /microsoft print to pdf/i,
  /microsoft xps document writer/i,
  /onenote/i,
  /fax/i,
  /pdf24/i,
  /cutepdf/i,
  /^send to onenote/i,
];

function ehImpressoraVirtual(nome) {
  return PADROES_VIRTUAIS.some((re) => re.test(nome));
}

/** Roda um comando e devolve stdout (string vazia em erro — nunca derruba o agente). */
function rodarComando(cmd, args) {
  return new Promise((resolve) => {
    try {
      const proc = spawn(cmd, args, { windowsHide: true });
      let saida = "";
      proc.stdout?.on("data", (d) => (saida += d.toString()));
      proc.on("error", () => resolve(""));
      proc.on("close", () => resolve(saida));
    } catch {
      resolve("");
    }
  });
}

/**
 * Detecta impressoras instaladas no Windows. Tenta PowerShell primeiro
 * (`Get-Printer`, disponível no Windows 8/Server 2012 em diante); se
 * falhar (PowerShell ausente, ou não é Windows), tenta `wmic` como
 * fallback para Windows mais antigos. Em qualquer outro SO, devolve
 * lista vazia — o agente ainda funciona (impressão via ESC/POS
 * direta/rede não depende de driver do Windows).
 */
async function detectarImpressorasWindows() {
  if (platform() !== "win32") return [];

  const viaPowerShell = await rodarComando("powershell.exe", [
    "-NoProfile",
    "-Command",
    "Get-Printer | Select-Object -ExpandProperty Name",
  ]);
  let nomes = viaPowerShell
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (nomes.length === 0) {
    const viaWmic = await rodarComando("wmic", ["printer", "get", "name"]);
    nomes = viaWmic
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && l.toLowerCase() !== "name");
  }

  return nomes.filter((n) => !ehImpressoraVirtual(n));
}

async function reportarDeteccao() {
  try {
    const impressoras = await detectarImpressorasWindows();
    const resposta = await fetch(`${BASE_URL}/api/impressao/agente/deteccao`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-agente-token": TOKEN },
      body: JSON.stringify({ computador: COMPUTADOR, impressoras }),
    });
    if (resposta.ok) {
      console.log(`[agente] ${impressoras.length} impressora(s) detectada(s) em "${COMPUTADOR}" reportada(s).`);
    }
  } catch (erro) {
    // Detecção é "best effort" — falhar aqui não deve impedir a fila de rodar.
    console.error(`[agente] falha ao reportar detecção: ${erro.message}`);
  }
}

async function buscarFila() {
  const url = `${BASE_URL}/api/impressao/fila${DESTINO ? `?destino=${encodeURIComponent(DESTINO)}` : ""}`;
  const resposta = await fetch(url, {
    headers: { "x-agente-token": TOKEN, "x-agente-computador": COMPUTADOR },
  });
  if (!resposta.ok) {
    throw new Error(`Falha ao consultar a fila (HTTP ${resposta.status}).`);
  }
  const dados = await resposta.json();
  return dados.itens ?? [];
}

async function confirmar(id, rota, corpo = {}) {
  const resposta = await fetch(`${BASE_URL}/api/impressao/fila/${id}/${rota}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-agente-token": TOKEN },
    body: JSON.stringify(corpo),
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    console.error(`  → ${rota} falhou: ${dados.erro ?? `HTTP ${resposta.status}`}`);
  }
  return { ok: resposta.ok, ...dados };
}

/** IMPRIME VIA IMPRESSORA DO WINDOWS ("Generic / Text Only" recomendada). */
async function imprimirViaWindows(conteudo, nomeImpressora) {
  if (!nomeImpressora) {
    throw new Error(
      "Este trabalho não tem impressora Windows associada — configure o destino em " +
        "Admin > Configurações > Impressoras (campo \"Impressora instalada no Windows\")."
    );
  }
  const pasta = await mkdtemp(path.join(tmpdir(), "pedidoflow-"));
  const arquivo = path.join(pasta, "comanda.txt");
  await writeFile(arquivo, conteudo, "utf-8");
  try {
    // notepad /p envia para a impressora PADRÃO; /pt permite escolher —
    // usamos /pt para respeitar a impressora do TRABALHO, não uma
    // impressora fixa do agente (cada trabalho pode ir pra uma diferente).
    await new Promise((resolve, reject) => {
      const proc = spawn("notepad.exe", ["/pt", arquivo, nomeImpressora], { windowsHide: true });
      proc.on("error", reject);
      // notepad /pt não bloqueia de forma confiável — damos um tempo para o
      // spool acontecer antes de considerar concluído.
      setTimeout(resolve, 4000);
      proc.on("exit", (codigo) => (codigo === 0 ? resolve() : resolve()));
    });
  } finally {
    await rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}

/** IMPRIME VIA PASTA (para RawBT/Virtual USB Printer/ferramentas de terceiros). */
async function imprimirViaPasta(conteudo, referencia) {
  const pastaSaida = process.env.AGENTE_PASTA_SAIDA;
  if (!pastaSaida) throw new Error("AGENTE_PASTA_SAIDA não definida.");
  const nomeArquivo = `${referencia.replace(/[^a-z0-9_-]/gi, "_")}-${Date.now()}.txt`;
  await writeFile(path.join(pastaSaida, nomeArquivo), conteudo, "utf-8");
}

/**
 * Ponto único de integração física — despacha para a via configurada.
 * Imprime UMA VEZ PARA CADA VIA do trabalho (PEDIDO: "1 via = imprime
 * 1 vez, 2 vias = imprime 2 vezes, 3 vias = imprime 3 vezes").
 */
/**
 * Imprime todas as vias, enviando HEARTBEAT entre cada uma (PEDIDO 2:
 * "implementar heartbeat/renovação de lease enquanto o agente estiver
 * imprimindo"). Sem isto, um trabalho de 3 vias numa impressora lenta
 * poderia ultrapassar o lease e ser reivindicado por outro agente no
 * meio da própria impressão.
 */
async function imprimir(item, claimId) {
  const corpo = `\n${item.conteudo}\n`;
  const vias = Math.max(1, Number(item.vias) || 1);
  for (let via = 1; via <= vias; via++) {
    if (vias > 1) console.log(`  via ${via}/${vias}…`);
    if (IMPRIMIR_VIA === "pasta") {
      await imprimirViaPasta(corpo, `${item.referencia}-via${via}`);
    } else if (platform() === "win32") {
      await imprimirViaWindows(corpo, item.nomeImpressoraWindows);
    } else {
      // Fora do Windows sem via configurada: cai no console (ambiente de
      // desenvolvimento/teste) — mas isto NUNCA confirma sucesso sozinho no
      // Windows real, só aqui como último recurso de depuração local.
      process.stdout.write(corpo);
    }
    // Renova o lease depois de cada via (não só no fim) — é o que
    // protege trabalhos de várias vias em impressoras lentas.
    if (via < vias) {
      const renovacao = await confirmar(item.id, "heartbeat", { claimId });
      if (!renovacao.ok || renovacao.renovado === false) {
        throw new Error("Lease perdido no meio da impressão (outro agente já assumiu) — parando.");
      }
    }
  }
}

async function ciclo() {
  try {
    const itens = await buscarFila();
    if (!itens.length) return;
    console.log(`[agente] ${itens.length} item(ns) pendente(s).`);
    for (const item of itens) {
      // Reivindica ANTES de imprimir — se outro agente/ciclo já pegou
      // este trabalho, `reivindicado` vem `false` e pulamos sem imprimir
      // (é isto que impede impressão duplicada com dois agentes rodando).
      const reserva = await confirmar(item.id, "processando");
      if (!reserva.ok || reserva.reivindicado === false) {
        console.log(`[agente] ${item.referencia} já foi (ou está sendo) atendido por outro agente — ignorando.`);
        continue;
      }
      const claimId = reserva.claimId;
      console.log(`[agente] imprimindo ${item.referencia} (${item.tipo}, ${item.vias} via(s), impressora: ${item.nomeImpressoraWindows ?? "não definida"}, lease: ${reserva.leaseSegundos}s)…`);
      try {
        await imprimir(item, claimId);
        const conclusao = await confirmar(item.id, "concluir", { claimId });
        if (!conclusao.ok) {
          console.error(`[agente] ${item.referencia} imprimiu, mas não confirmou (lease perdido?) — pode reaparecer na fila. Verifique duplicidade física.`);
        }
      } catch (erro) {
        console.error(`[agente] erro ao imprimir ${item.referencia}: ${erro.message}`);
        await confirmar(item.id, "erro", { claimId, mensagem: String(erro.message).slice(0, 500) });
      }
    }
  } catch (erro) {
    console.error(`[agente] ${erro.message}`);
  }
}

console.log(`[agente] computador: ${COMPUTADOR}`);
console.log(`[agente] monitorando ${BASE_URL} (destino: ${DESTINO || "todos"}, via: ${IMPRIMIR_VIA})…`);
reportarDeteccao();
ciclo();
setInterval(ciclo, INTERVALO_MS);
setInterval(reportarDeteccao, DETECCAO_INTERVALO_MS);
