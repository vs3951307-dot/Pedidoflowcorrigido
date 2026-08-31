import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda de arquitetura: o atendimento do WhatsApp NÃO pode ter a própria
 * criação de pedido.
 *
 * O QUE ESTE TESTE IMPEDE DE VOLTAR:
 * `motor.ts` tinha uma segunda implementação de criação de pedido,
 * escrevendo direto no Prisma (`tx.pedido.create`) e calculando o preço
 * com `lib/precificacao.ts` — que ignora sabores. Consequência real: uma
 * pizza Família com 3 sabores especiais saía por R$ 72 pelo WhatsApp e
 * R$ 92 pelo PDV, e o índice único de idempotência nunca era usado nesse
 * caminho (reenvio da Meta = pedido duplicado).
 *
 * O bug sobreviveu tanto tempo porque nenhum teste comparava os dois
 * caminhos. Este aqui é barato e roda sem banco: ele lê o arquivo e
 * verifica a propriedade estrutural — o WhatsApp delega ao mesmo
 * `criarPedido()` do PDV.
 *
 * O teste de VALOR (mesmo pedido, mesmo total nos dois canais) exige
 * Postgres e vive nas suítes de banco; este cobre a regressão silenciosa.
 */

const MOTOR = join(process.cwd(), "src/lib/atendente/motor.ts");
const fonte = readFileSync(MOTOR, "utf8");

describe("motor do WhatsApp usa o motor de pedidos compartilhado", () => {
  it("importa criarPedido de lib/pedidos/criar-pedido", () => {
    expect(fonte).toMatch(/import\s*\{[^}]*criarPedido[^}]*\}\s*from\s*["']@\/lib\/pedidos\/criar-pedido["']/);
  });

  it("chama criarPedido(", () => {
    expect(fonte).toMatch(/await\s+criarPedido\(/);
  });

  it("NÃO cria Pedido direto no Prisma", () => {
    // Qualquer `pedido.create(` (via tx ou prisma) significa que alguém
    // reabriu o caminho paralelo.
    expect(fonte).not.toMatch(/\b(tx|prisma)\.pedido\.create\s*\(/);
  });

  it("NÃO cria Entrega nem Pagamento direto no Prisma", () => {
    expect(fonte).not.toMatch(/\b(tx|prisma)\.entrega\.create\s*\(/);
    expect(fonte).not.toMatch(/\b(tx|prisma)\.pagamento\.create\s*\(/);
  });

  it("envia uma chave de idempotência ao criar o pedido", () => {
    // Sem isso, o reenvio da Meta cria um segundo pedido real.
    expect(fonte).toMatch(/idempotencyKey:\s*estado\.chaveIdempotencia/);
  });

  it("gera a chave de idempotência antes da confirmação, junto do carrinho", () => {
    expect(fonte).toMatch(/estado\.chaveIdempotencia\s*=\s*novaChaveIdempotencia\(\)/);
  });

  it("descarta o estado de uma conversa que ficou tempo demais sem uso (sessão expirada)", () => {
    // Guarda contra a volta do bug de sessão: sem timeout, um cliente que
    // abandonou o pedido voltava dias depois mandando "sim" e confirmava um
    // carrinho velho como pedido novo.
    expect(fonte).toMatch(/TEMPO_MAXIMO_INATIVIDADE_MS/);
    expect(fonte).toMatch(/conversaOciosa\(/);
    expect(fonte).toMatch(/estadoZerado\(/);
    expect(fonte).toMatch(/carrinhoLimpadoPorInatividade/);
  });
});
