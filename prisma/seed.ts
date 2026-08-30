/**
 * PedidoFlow — seed do banco de dados (SQLite).
 *
 * Cria: usuários, categorias, produtos, sabores, tamanhos, adicionais,
 * mesas, clientes/endereços, configurações, estoque, entregadores, notas
 * fiscais, backups e pedidos de demonstração dos últimos 14 dias (para que
 * Dashboard, Relatórios e Financeiro exibam dados reais).
 *
 * Idempotente: apaga tudo e recria. Rodar com `npm run db:seed`.
 */

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma, plataformaPrisma } from "@/lib/prisma";
import { provisionarSchemaEmpresa } from "@/lib/tenant-provisionamento";
import { ativarTenant, nomeSchemaDoSlug } from "@/lib/tenant-db";
import { serializarModulos } from "@/lib/modulos";

/* ------------------------------ PRNG determinístico ------------------------------ */

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(42);
function entre(min: number, max: number) {
  return Math.floor(rnd() * (max - min + 1)) + min;
}
function escolher<T>(itens: T[]): T {
  return itens[Math.floor(rnd() * itens.length)];
}

function diaAtras(dias: number, horaMin = 8, horaMax = 23) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  d.setHours(entre(horaMin, horaMax), entre(0, 59), entre(0, 59), 0);
  return d;
}

function brl(v: number) {
  return `R$ ${v.toFixed(2)}`;
}

const arredondar2 = (v: number) => Math.round(v * 100) / 100;

/* ------------------------------------ Dados ------------------------------------ */

const CATEGORIAS = [
  "Pizzas Tradicionais",
  "Pizzas Especiais",
  "Pizzas Doces",
  "Porções",
  "Refrigerantes",
  "Lanches Artesanais",
  "Lanches",
  "Adicionais",
];

/** Produto do catálogo; campos fiscais (PEDIDO 19) têm padrão alimentício. */
interface ProdutoSeed {
  id: string;
  nome: string;
  descricao: string;
  preco: number;
  categoria: string;
  emoji: string;
  destaque?: boolean;
  ativo?: boolean;
  ncm?: string;
  cest?: string;
  csosn?: string;
  cfop?: string;
  unidade?: string;
  /** Preços reais por tamanho (pizzas); sem isso usa o padrão base/fator. */
  tamanhos?: { media: number; grande: number; familia: number };
}

// Cardápio real da Disk Pizza Rozeno (cortesia WhatsApp, 02/08/2026).
const PRODUTOS_SEED: ProdutoSeed[] = [
  // ------------------------------ Pizzas salgadas ------------------------------
  // Tradicionais — Média R$46 / Grande R$56 / Família R$66
  { id: "pz-mussarela", nome: "Mussarela", descricao: "Molho, mussarela, tomate, azeitona, cebola e orégano.", preco: 46, categoria: "Pizzas salgadas", emoji: "🍕", tamanhos: { media: 46, grande: 56, familia: 66 } },
  { id: "pz-calabresa", nome: "Calabresa", descricao: "Molho, mussarela, calabresa, tomate, azeitona, cebola e orégano.", preco: 46, categoria: "Pizzas salgadas", emoji: "🍕", destaque: true, tamanhos: { media: 46, grande: 56, familia: 66 } },
  { id: "pz-moda-casa", nome: "Moda da Casa", descricao: "Molho, mussarela, frango, palmito, milho, calabresa, tomate, azeitona, cebola e orégano.", preco: 46, categoria: "Pizzas salgadas", emoji: "🍕", destaque: true, tamanhos: { media: 46, grande: 56, familia: 66 } },
  { id: "pz-baiana", nome: "Baiana", descricao: "Molho, mussarela, calabresa ralada, bacon, ovo cozido, tomate, pimenta, azeitona, cebola e orégano.", preco: 46, categoria: "Pizzas salgadas", emoji: "🍕", tamanhos: { media: 46, grande: 56, familia: 66 } },
  { id: "pz-bacon", nome: "Bacon", descricao: "Molho, mussarela, bacon, tomate, azeitona, cebola e orégano.", preco: 46, categoria: "Pizzas salgadas", emoji: "🍕", tamanhos: { media: 46, grande: 56, familia: 66 } },
  { id: "pz-salame", nome: "Salame", descricao: "Molho, mussarela, salame, tomate, azeitona, cebola e orégano.", preco: 46, categoria: "Pizzas salgadas", emoji: "🍕", tamanhos: { media: 46, grande: 56, familia: 66 } },
  { id: "pz-peperone", nome: "Peperone", descricao: "Molho, mussarela, peperone, tomate, azeitona, cebola e orégano.", preco: 46, categoria: "Pizzas salgadas", emoji: "🍕", tamanhos: { media: 46, grande: 56, familia: 66 } },
  { id: "pz-lombo-catupiry", nome: "Lombo Canadense com Catupiry", descricao: "Molho, mussarela, lombo, catupiry, tomate, azeitona, cebola e orégano.", preco: 46, categoria: "Pizzas salgadas", emoji: "🍕", tamanhos: { media: 46, grande: 56, familia: 66 } },
  { id: "pz-atum", nome: "Atum", descricao: "Molho, mussarela, atum, tomate, azeitona, cebola e orégano.", preco: 46, categoria: "Pizzas salgadas", emoji: "🍕", tamanhos: { media: 46, grande: 56, familia: 66 } },
  { id: "pz-catupiry", nome: "Catupiry", descricao: "Molho, mussarela, catupiry, tomate, azeitona, cebola e orégano.", preco: 46, categoria: "Pizzas salgadas", emoji: "🍕", tamanhos: { media: 46, grande: 56, familia: 66 } },
  { id: "pz-frango-catupiry", nome: "Frango com Catupiry", descricao: "Molho, mussarela, frango, catupiry, tomate, azeitona, cebola e orégano.", preco: 46, categoria: "Pizzas salgadas", emoji: "🍕", destaque: true, tamanhos: { media: 46, grande: 56, familia: 66 } },
  { id: "pz-palmito", nome: "Palmito", descricao: "Molho, mussarela, palmito, tomate, azeitona, cebola e orégano.", preco: 46, categoria: "Pizzas salgadas", emoji: "🍕", tamanhos: { media: 46, grande: 56, familia: 66 } },
  { id: "pz-quatro-queijos", nome: "4 Queijos", descricao: "Molho, mussarela, provolone, parmesão, catupiry, tomate, azeitona, cebola e orégano.", preco: 46, categoria: "Pizzas salgadas", emoji: "🍕", tamanhos: { media: 46, grande: 56, familia: 66 } },
  { id: "pz-marguerita", nome: "Marguerita", descricao: "Molho, mussarela, manjericão, tomate, azeitona, cebola e orégano.", preco: 46, categoria: "Pizzas salgadas", emoji: "🍕", tamanhos: { media: 46, grande: 56, familia: 66 } },
  { id: "pz-portuguesa", nome: "Portuguesa", descricao: "Molho, mussarela, ovo cozido, presunto, palmito, tomate, azeitona, cebola e orégano.", preco: 46, categoria: "Pizzas salgadas", emoji: "🍕", tamanhos: { media: 46, grande: 56, familia: 66 } },
  { id: "pz-brocolis", nome: "Brócolis", descricao: "Molho, mussarela, brócolis, tomate, azeitona, cebola e orégano.", preco: 46, categoria: "Pizzas salgadas", emoji: "🍕", tamanhos: { media: 46, grande: 56, familia: 66 } },
  { id: "pz-vegetariana", nome: "Vegetariana", descricao: "Molho, mussarela, brócolis, couve-flor, palmito, milho, ovo cozido, tomate, azeitona, cebola e orégano.", preco: 46, categoria: "Pizzas salgadas", emoji: "🥬", tamanhos: { media: 46, grande: 56, familia: 66 } },
  { id: "pz-alho-oleo", nome: "Alho e Óleo", descricao: "Molho, mussarela, alho, azeite, tomate, azeitona, cebola e orégano.", preco: 46, categoria: "Pizzas salgadas", emoji: "🍕", tamanhos: { media: 46, grande: 56, familia: 66 } },
  // Especiais — Média R$52 / Grande R$62 / Família R$72
  { id: "pz-calabresa-coberta", nome: "Calabresa Coberta", descricao: "Molho, mussarela, calabresa, catupiry, ovo cozido, tomate, azeitona, cebola e orégano.", preco: 52, categoria: "Pizzas salgadas", emoji: "🍕", destaque: true, tamanhos: { media: 52, grande: 62, familia: 72 } },
  { id: "pz-carne-sol", nome: "Carne de Sol", descricao: "Molho, mussarela, carne de sol, banana, catupiry, tomate, azeitona, cebola e orégano.", preco: 52, categoria: "Pizzas salgadas", emoji: "🍕", tamanhos: { media: 52, grande: 62, familia: 72 } },
  { id: "pz-menina", nome: "Menina", descricao: "Molho, mussarela, creme de milho, bacon, calabresa, tomate, azeitona, cebola e orégano.", preco: 52, categoria: "Pizzas salgadas", emoji: "🍕", tamanhos: { media: 52, grande: 62, familia: 72 } },
  { id: "pz-lombo-creme", nome: "Lombo ao Creme", descricao: "Molho, mussarela, lombo, creme, tomate, azeitona, cebola e orégano.", preco: 52, categoria: "Pizzas salgadas", emoji: "🍕", tamanhos: { media: 52, grande: 62, familia: 72 } },
  { id: "pz-doritos", nome: "Doritos", descricao: "Molho, mussarela, bacon, cheddar e Doritos.", preco: 52, categoria: "Pizzas salgadas", emoji: "🍕", destaque: true, tamanhos: { media: 52, grande: 62, familia: 72 } },
  { id: "pz-file-chapa", nome: "Filé na Chapa", descricao: "Molho, mussarela, filé, catupiry, tomate, azeitona, cebola e orégano.", preco: 52, categoria: "Pizzas salgadas", emoji: "🍕", tamanhos: { media: 52, grande: 62, familia: 72 } },
  { id: "pz-estrogonofe-frango", nome: "Estrogonofe de Frango", descricao: "Molho, mussarela, estrogonofe de frango, azeitona, cebola e orégano.", preco: 52, categoria: "Pizzas salgadas", emoji: "🍕", tamanhos: { media: 52, grande: 62, familia: 72 } },
  { id: "pz-estrogonofe-carne", nome: "Estrogonofe de Carne", descricao: "Molho, mussarela, estrogonofe de carne, azeitona, cebola e orégano.", preco: 52, categoria: "Pizzas salgadas", emoji: "🍕", tamanhos: { media: 52, grande: 62, familia: 72 } },
  { id: "pz-tomate-seco", nome: "Tomate Seco", descricao: "Molho, mussarela, tomate seco, parmesão, manjericão, azeitona, cebola e orégano.", preco: 52, categoria: "Pizzas salgadas", emoji: "🍕", tamanhos: { media: 52, grande: 62, familia: 72 } },

  // ------------------------------- Pizzas doces --------------------------------
  // Média R$52 / Grande R$72 / Família R$82
  { id: "pz-banoffe", nome: "Banoffe", descricao: "Creme de leite, mussarela, chocolate branco fornejável, banana e caramelo.", preco: 52, categoria: "Pizzas doces", emoji: "🍌", destaque: true, tamanhos: { media: 52, grande: 72, familia: 82 } },
  { id: "pz-prestigio", nome: "Prestígio", descricao: "Creme de leite, mussarela, chocolate ao leite e coco.", preco: 52, categoria: "Pizzas doces", emoji: "🥥", tamanhos: { media: 52, grande: 72, familia: 82 } },
  { id: "pz-chocolate", nome: "Chocolate com Morango", descricao: "Creme de leite, mussarela, chocolate ao leite e morango.", preco: 52, categoria: "Pizzas doces", emoji: "🍫", destaque: true, tamanhos: { media: 52, grande: 72, familia: 82 } },

  // --------------------------------- Lanches -----------------------------------
  { id: "lx-prensado", nome: "Prensado", descricao: "Pão, catupiry, alface, tomate e ketchup.", preco: 14, categoria: "Lanches", emoji: "🥪" },
  { id: "lx-x-tudo", nome: "X-Tudo", descricao: "Pão, catupiry, alface, tomate, mussarela, calabresa, bacon, salsicha, ovo, hambúrguer e batata palha.", preco: 25, categoria: "Lanches", emoji: "🍔", destaque: true },
  { id: "lx-x-rozeno", nome: "X-Rozeno", descricao: "Pão, catupiry, alface, tomate, mussarela, bacon e 2 hambúrgueres.", preco: 26, categoria: "Lanches", emoji: "🍔", destaque: true },
  { id: "lx-x-burguer", nome: "X-Burguer", descricao: "Pão, catupiry, alface, tomate, mussarela e hambúrguer.", preco: 16, categoria: "Lanches", emoji: "🍔" },
  { id: "lx-x-salada", nome: "X-Salada", descricao: "Pão, catupiry, alface, tomate, mussarela, hambúrguer e ovo.", preco: 18, categoria: "Lanches", emoji: "🍔" },
  { id: "lx-x-frango", nome: "X-Frango", descricao: "Pão, catupiry, alface, tomate, mussarela e frango.", preco: 19, categoria: "Lanches", emoji: "🍔" },
  { id: "lx-x-calabresa", nome: "X-Calabresa", descricao: "Pão, catupiry, alface, tomate, mussarela e calabresa.", preco: 22, categoria: "Lanches", emoji: "🍔" },
  { id: "lx-x-bacon", nome: "X-Bacon", descricao: "Pão, catupiry, alface, tomate, mussarela, hambúrguer e bacon.", preco: 22, categoria: "Lanches", emoji: "🍔" },

  // --------------------------- Burguers artesanais -----------------------------
  // Hambúrguer 150g + barbecue, mussarela, cheddar, alface, tomate e cebola.
  { id: "bg-simples", nome: "Simples", descricao: "Hambúrguer 150g, barbecue, mussarela, cheddar, alface, tomate e cebola.", preco: 23, categoria: "Burguers artesanais", emoji: "🍔" },
  { id: "bg-calabresa", nome: "Calabresa", descricao: "Hambúrguer 150g, barbecue, mussarela, cheddar, calabresa, alface, tomate e cebola.", preco: 26, categoria: "Burguers artesanais", emoji: "🍔" },
  { id: "bg-bacon", nome: "Bacon", descricao: "Hambúrguer 150g, barbecue, mussarela, cheddar, bacon, alface, tomate e cebola.", preco: 26, categoria: "Burguers artesanais", emoji: "🍔" },
  { id: "bg-frango", nome: "Frango", descricao: "Hambúrguer 150g, barbecue, mussarela, cheddar, frango desfiado, alface, tomate e cebola.", preco: 26, categoria: "Burguers artesanais", emoji: "🍔" },
  { id: "bg-mega", nome: "Mega", descricao: "Hambúrguer 150g, barbecue, mussarela, cheddar, calabresa, bacon e batata palha.", preco: 30, categoria: "Burguers artesanais", emoji: "🍔", destaque: true },

  // ---------------------------------- Porções ----------------------------------
  { id: "po-batata-frita", nome: "Batata Frita", descricao: "Porção de batata frita.", preco: 36, categoria: "Porções", emoji: "🍟", destaque: true },
  { id: "po-calabresa", nome: "Calabresa", descricao: "Porção de calabresa acebolada.", preco: 46, categoria: "Porções", emoji: "🍢" },
  { id: "po-contra-file", nome: "Contra Filé", descricao: "Contra filé grelhado, porção.", preco: 60, categoria: "Porções", emoji: "🥩" },
  { id: "po-file-chapa", nome: "Filé na Chapa", descricao: "Filé na chapa, porção.", preco: 65, categoria: "Porções", emoji: "🥩" },
  { id: "po-file-tilapia", nome: "Filé de Tilápia", descricao: "Filé de tilápia empanado, porção.", preco: 70, categoria: "Porções", emoji: "🐟" },
  { id: "po-picanha", nome: "Picanha 800g", descricao: "Picanha grelhada, 800g.", preco: 71, categoria: "Porções", emoji: "🥩", destaque: true },
  { id: "po-torre", nome: "Torre", descricao: "Torre de bacon, calabresa e frango com cheddar e filé.", preco: 74, categoria: "Porções", emoji: "🥓", destaque: true },

  // ------------------------------- Refrigerantes -------------------------------
  { id: "be-refri-2l", nome: "Refrigerante 2L", descricao: "Coca-Cola, Coca-Cola Zero, Fanta Uva, Fanta Laranja, Sprite ou Guaraná Kuat — 2L.", preco: 16, categoria: "Bebidas", emoji: "🥤", destaque: true, ncm: "2202.10.00" },
  { id: "be-refri-1500", nome: "Refrigerante 1,5L", descricao: "Coca-Cola ou Coca-Cola Zero — 1,5L.", preco: 13, categoria: "Bebidas", emoji: "🥤", ncm: "2202.10.00" },
  { id: "be-refri-1l-vidro", nome: "Refrigerante 1L (vidro)", descricao: "Coca-Cola — garrafa de vidro 1L.", preco: 13, categoria: "Bebidas", emoji: "🥤", ncm: "2202.10.00" },
  { id: "be-refri-600", nome: "Refrigerante 600ml", descricao: "Sprite, Coca-Cola, Coca-Cola Zero ou Fanta Laranja — 600ml.", preco: 8, categoria: "Bebidas", emoji: "🥤", ncm: "2202.10.00" },
  { id: "be-refri-lata", nome: "Refrigerante lata 350ml", descricao: "Sprite, Coca-Cola, Coca-Cola Zero, Fanta Uva, Fanta Laranja ou Guaraná Kuat — 350ml.", preco: 6, categoria: "Bebidas", emoji: "🥤", ncm: "2202.10.00" },
  { id: "be-refri-220", nome: "Refrigerante 220ml", descricao: "Fanta Uva ou Fanta Laranja — 220ml.", preco: 5, categoria: "Bebidas", emoji: "🥤", ncm: "2202.10.00" },
];

const SABORES = [
  { nome: "Mussarela", tipo: "tradicional", produtos: ["pz-mussarela"] },
  { nome: "Calabresa", tipo: "tradicional", produtos: ["pz-calabresa"] },
  { nome: "Moda da Casa", tipo: "tradicional", produtos: ["pz-moda-casa"] },
  { nome: "Baiana", tipo: "tradicional", produtos: ["pz-baiana"] },
  { nome: "Bacon", tipo: "tradicional", produtos: ["pz-bacon"] },
  { nome: "Salame", tipo: "tradicional", produtos: ["pz-salame"] },
  { nome: "Peperone", tipo: "tradicional", produtos: ["pz-peperone"] },
  { nome: "Lombo Canadense com Catupiry", tipo: "tradicional", produtos: ["pz-lombo-catupiry"] },
  { nome: "Atum", tipo: "tradicional", produtos: ["pz-atum"] },
  { nome: "Catupiry", tipo: "tradicional", produtos: ["pz-catupiry"] },
  { nome: "Frango com Catupiry", tipo: "tradicional", produtos: ["pz-frango-catupiry"] },
  { nome: "Palmito", tipo: "tradicional", produtos: ["pz-palmito"] },
  { nome: "4 Queijos", tipo: "tradicional", produtos: ["pz-quatro-queijos"] },
  { nome: "Marguerita", tipo: "tradicional", produtos: ["pz-marguerita"] },
  { nome: "Portuguesa", tipo: "tradicional", produtos: ["pz-portuguesa"] },
  { nome: "Brócolis", tipo: "tradicional", produtos: ["pz-brocolis"] },
  { nome: "Vegetariana", tipo: "tradicional", produtos: ["pz-vegetariana"] },
  { nome: "Alho e Óleo", tipo: "tradicional", produtos: ["pz-alho-oleo"] },
  { nome: "Calabresa Coberta", tipo: "especial", produtos: ["pz-calabresa-coberta"] },
  { nome: "Carne de Sol", tipo: "especial", produtos: ["pz-carne-sol"] },
  { nome: "Menina", tipo: "especial", produtos: ["pz-menina"] },
  { nome: "Lombo ao Creme", tipo: "especial", produtos: ["pz-lombo-creme"] },
  { nome: "Doritos", tipo: "especial", produtos: ["pz-doritos"] },
  { nome: "Filé na Chapa", tipo: "especial", produtos: ["pz-file-chapa"] },
  { nome: "Estrogonofe de Frango", tipo: "especial", produtos: ["pz-estrogonofe-frango"] },
  { nome: "Estrogonofe de Carne", tipo: "especial", produtos: ["pz-estrogonofe-carne"] },
  { nome: "Tomate Seco", tipo: "especial", produtos: ["pz-tomate-seco"] },
  { nome: "Banoffe", tipo: "doce", produtos: ["pz-banoffe"] },
  { nome: "Prestígio", tipo: "doce", produtos: ["pz-prestigio"] },
  { nome: "Chocolate", tipo: "doce", produtos: ["pz-chocolate"] },
];

// CORREÇÃO (item 7 da auditoria — meia a meia / 2 e 3 sabores não
// funcionavam): `maxSabores` existia no schema (com o comentário
// "Backfill: Média=2, Grande=2, Família=3"), mas a migration só criava
// a coluna com `DEFAULT 1` e o seed NUNCA informava o valor. Resultado
// em qualquer ambiente novo: TODO tamanho ficava com maxSabores = 1, e
// `calcularPrecoItem` recusava qualquer pizza com 2+ sabores com "Este
// tamanho aceita no máximo 1 sabore(s)". Ou seja: meia a meia, 2 sabores
// e 3 sabores eram impossíveis de vender. O único lugar com o valor
// correto era `scripts/backfill-etapa1.ts`, que não fazia parte de
// nenhum fluxo automático de deploy.
//
// O valor agora nasce certo aqui (ambiente novo) E é corrigido em
// ambientes existentes por `npm run db:backfill-etapa1`, que passou a
// integrar o `npm run deploy:migrar`.
const TAMANHOS = [
  { nome: "Padrão", fator: 1, maxSabores: 1 },
  { nome: "Média", fator: 1, maxSabores: 2 },
  { nome: "Grande", fator: 1.35, maxSabores: 2 },
  { nome: "Família", fator: 1.7, maxSabores: 3 },
];

const ADICIONAIS = [
  { nome: "Hambúrguer", preco: 10.0 },
  { nome: "Bacon", preco: 5.0 },
  { nome: "Calabresa", preco: 5.0 },
  { nome: "Frango", preco: 5.0 },
  { nome: "Cheddar", preco: 3.0 },
  { nome: "Batata frita", preco: 10.0 },
];

const MESAS_SEED = [
  { numero: 1, capacidade: 4, status: "ocupada", pessoas: 2, garcom: "Garçom", abertaEm: diaAtras(0, 17, 18) },
  { numero: 2, capacidade: 4, status: "livre" },
  { numero: 3, capacidade: 4, status: "aguardando", pessoas: 4, garcom: "Garçom", abertaEm: diaAtras(0, 19, 20) },
  { numero: 4, capacidade: 4, status: "pedido_enviado", pessoas: 3, garcom: "Garçom", abertaEm: diaAtras(0, 19, 20) },
  { numero: 5, capacidade: 4, status: "livre" },
  { numero: 6, capacidade: 4, status: "conta", pessoas: 2, garcom: "Garçom", abertaEm: diaAtras(0, 18, 19) },
  { numero: 7, capacidade: 4, status: "livre" },
  { numero: 8, capacidade: 6, status: "ocupada", pessoas: 5, garcom: "Garçom", abertaEm: diaAtras(0, 19, 20) },
  { numero: 9, capacidade: 4, status: "livre" },
  { numero: 10, capacidade: 2, status: "aguardando", pessoas: 2, garcom: "Garçom", abertaEm: diaAtras(0, 20, 21) },
  { numero: 11, capacidade: 4, status: "livre" },
  { numero: 12, capacidade: 6, status: "pedido_enviado", pessoas: 6, garcom: "Garçom", abertaEm: diaAtras(0, 20, 21) },
];

const CLIENTES = [
  { nome: "Maria Souza", telefone: "(11) 98811-2233", enderecos: [{ rotulo: "casa", rua: "Av. Paulista, 1200 — ap. 34", bairro: "Bela Vista", complemento: "ap. 34", referencia: "Prédio comercial, portaria 24h" }] },
  { nome: "João Pereira", telefone: "(11) 97722-3344", enderecos: [{ rotulo: "casa", rua: "Rua Vergueiro, 500", bairro: "Paraíso", complemento: "casa 2", referencia: "Ao lado da farmácia" }, { rotulo: "trabalho", rua: "Av. Faria Lima, 800", bairro: "Itaim Bibi", complemento: "10º andar", referencia: "Torre A" }] },
  { nome: "Ana Lima", telefone: "(11) 96633-4455", enderecos: [{ rotulo: "casa", rua: "Rua Augusta, 2500", bairro: "Consolação", referencia: "Em frente ao metrô" }] },
  { nome: "Carlos Mendes", telefone: "(11) 95544-5566", enderecos: [{ rotulo: "casa", rua: "Alameda Santos, 900", bairro: "Jardins", complemento: "bloco B, ap. 78", referencia: "Portaria da padaria São Bento" }] },
  { nome: "Fernanda Costa", telefone: "(11) 94455-6677", enderecos: [{ rotulo: "casa", rua: "Rua Oscar Freire, 300", bairro: "Cerqueira César", referencia: "Casa cinza com portão azul" }] },
];

const ESTOQUE = [
  { nome: "Massa de pizza 30cm", categoria: "Massa", unidade: "un", quantidade: 86, minimo: 40, custoUnitario: 6.5 },
  { nome: "Queijo mussarela", categoria: "Frios", unidade: "kg", quantidade: 24, minimo: 15, custoUnitario: 39.9 },
  { nome: "Molho de tomate", categoria: "Conservas", unidade: "kg", quantidade: 18, minimo: 10, custoUnitario: 8.9 },
  { nome: "Calabresa", categoria: "Frios", unidade: "kg", quantidade: 12, minimo: 8, custoUnitario: 24.9 },
  { nome: "Frango desfiado", categoria: "Frios", unidade: "kg", quantidade: 9, minimo: 6, custoUnitario: 21.9 },
  { nome: "Catupiry 2kg", categoria: "Frios", unidade: "un", quantidade: 4, minimo: 5, custoUnitario: 84.9 },
  { nome: "Refrigerante 350ml", categoria: "Bebidas", unidade: "un", quantidade: 72, minimo: 48, custoUnitario: 3.4 },
  { nome: "Refrigerante 2L", categoria: "Bebidas", unidade: "un", quantidade: 30, minimo: 24, custoUnitario: 8.2 },
  { nome: "Suco 500ml", categoria: "Bebidas", unidade: "un", quantidade: 14, minimo: 12, custoUnitario: 5.1 },
  { nome: "Cerveja long neck", categoria: "Bebidas", unidade: "un", quantidade: 48, minimo: 36, custoUnitario: 6.8 },
  { nome: "Batata congelada 3kg", categoria: "Congelados", unidade: "pacote", quantidade: 6, minimo: 8, custoUnitario: 32.0 },
  { nome: "Chocolate ao leite", categoria: "Confeitaria", unidade: "kg", quantidade: 5, minimo: 4, custoUnitario: 29.9 },
];

const NOTAS = [
  { numero: "NF-2026-0041", fornecedor: "Distribuidora Vale", emissao: diaAtras(2, 9, 18), itens: 12, valor: 1842.5 },
  { numero: "NF-2026-0042", fornecedor: "Laticínios Fazenda Boa", emissao: diaAtras(4, 9, 18), itens: 6, valor: 958.0 },
  { numero: "NF-2026-0043", fornecedor: "Atacadão do Povo", emissao: diaAtras(6, 9, 18), itens: 9, valor: 1104.3 },
  { numero: "NF-2026-0044", fornecedor: "Frigorífico Boi Forte", emissao: diaAtras(8, 9, 18), itens: 4, valor: 721.8, status: "pendente" },
  { numero: "NF-2026-0045", fornecedor: "Empório das Massas", emissao: diaAtras(10, 9, 18), itens: 3, valor: 445.0 },
  { numero: "NF-2026-0046", fornecedor: "Ceasa Hortifruti", emissao: diaAtras(12, 9, 18), itens: 8, valor: 612.4, status: "cancelada" },
];

const IMPRESSORAS = [
  { nome: "Cupom do balcão", tipo: "térmica 80mm", conexao: "Agente local · USB COM4", padrao: true, status: "conectada", destino: "caixa", vias: 1, automatica: true },
  { nome: "Cozinha", tipo: "térmica 80mm", conexao: "Agente local · Wi-Fi 192.168.0.15", padrao: false, status: "conectada", destino: "cozinha", vias: 1, automatica: true },
  { nome: "Cupom de retirada", tipo: "térmica 58mm", conexao: "Agente local · Bluetooth", padrao: false, status: "configurar", destino: "caixa", vias: 1, automatica: false },
  { nome: "Relatórios", tipo: "laser A4", conexao: "Agente local · Wi-Fi 192.168.0.18", padrao: false, status: "offline", destino: null, vias: 1, automatica: false },
];

const TAXAS = [
  { forma: "pix", rotulo: "Pix", taxaPct: 0.0, valorFixo: 0, prazo: "Imediato", ativo: true },
  { forma: "credito", rotulo: "Crédito", taxaPct: 3.49, valorFixo: 0.6, prazo: "2 dias úteis", ativo: true },
  { forma: "debito", rotulo: "Débito", taxaPct: 1.99, valorFixo: 0.4, prazo: "1 dia útil", ativo: true },
  { forma: "dinheiro", rotulo: "Dinheiro", taxaPct: 0.0, valorFixo: 0, prazo: "Imediato", ativo: true },
];

const FORMAS_PAGAMENTO = [
  { value: "dinheiro", label: "Dinheiro", ativo: true },
  { value: "debito", label: "Débito", ativo: true },
  { value: "credito", label: "Crédito", ativo: true },
  { value: "pix", label: "Pix", ativo: true },
];

const USUARIOS = [
  { nome: "Administrador", email: "admin@rozeno.com.br", papel: "ADMINISTRADOR" },
  { nome: "Rozeno", email: "rozeno@rozeno.com.br", papel: "ADMINISTRADOR" },
  { nome: "Caixa", email: "caixa@rozeno.com.br", papel: "CAIXA" },
  { nome: "Garçom", email: "garcom@rozeno.com.br", papel: "GARCOM" },
  { nome: "Cozinha", email: "cozinha@rozeno.com.br", papel: "COZINHA" },
  { nome: "Samuel", email: "samuel@rozeno.com.br", papel: "ENTREGADOR" },
  { nome: "Ari", email: "ari@rozeno.com.br", papel: "ENTREGADOR" },
  { nome: "Marlon", email: "marlon@rozeno.com.br", papel: "ENTREGADOR" },
];

const BAIXAS = ["Bela Vista", "Paraíso", "Consolação", "Jardins", "Itaim Bibi", "Vila Mariana"];

// Taxa de entrega por bairro (regra `bairro` — espelha a config taxas).
const TAXA_BAIRROS: Record<string, number> = {
  "Bela Vista": 6.5,
  "Paraíso": 8.0,
  "Consolação": 7.5,
  "Jardins": 8.5,
  "Itaim Bibi": 9.5,
  "Vila Mariana": 10.5,
};

/* ------------------------------------ Seed ------------------------------------ */

async function main() {
  // PEDIDO 59: "não permitir deploy público usando credenciais previsíveis...
  // seed demo deve ser explicitamente habilitado; não rodar automaticamente
  // em produção". Antes disto era só um COMENTÁRIO pedindo pra não rodar em
  // produção — nada impedia de fato. Este script é DESTRUTIVO (apaga e
  // recria o banco inteiro), então a barreira precisa ser código, não aviso.
  if (process.env.NODE_ENV === "production" && process.env.PERMITIR_SEED_DESTRUTIVO !== "true") {
    console.error(
      "\n❌ Recusando rodar: NODE_ENV=production e este script APAGA E RECRIA o banco inteiro.\n" +
        "   Se você tem CERTEZA (ex.: ambiente de demonstração descartável, nunca produção real),\n" +
        "   rode de novo com PERMITIR_SEED_DESTRUTIVO=true definido explicitamente.\n"
    );
    process.exit(1);
  }

  console.log("🗑️  Limpando banco…");
  // Empresas apagadas primeiro... não: a ORDEM aqui importa. Os dados
  // operacionais (pedidos, clientes, caixa…) moram no schema PostgreSQL
  // dedicado da empresa e referenciam `Empresa` por FK (ex.: Cliente →
  // Empresa). Se uma rodada anterior deste seed (ou da aplicação) já
  // criou esses dados, `empresa.deleteMany()` abaixo falha com P2003
  // ANTES do DROP SCHEMA. Por isso o schema de tenant é removido PRIMEIRO
  // (CASCADE), e só então as tabelas da plataforma são limpas.
  await plataformaPrisma.$executeRawUnsafe(
    `DROP SCHEMA IF EXISTS "${nomeSchemaDoSlug("disk-pizza-rozeno")}" CASCADE`
  );
  await plataformaPrisma.$executeRawUnsafe(
    `DROP SCHEMA IF EXISTS "${nomeSchemaDoSlug("empresa-teste-b")}" CASCADE`
  );
  // Ainda assim, o reset abaixo é destrutivo NA PLATAFORMA INTEIRA (todos
  // os usuários, sessões e a empresa "disk-pizza-rozeno") — adequado para
  // ambiente de desenvolvimento/demonstração. NUNCA rode `npm run
  // db:seed` contra um banco de produção com clientes reais.
  await prisma.auditoria.deleteMany();
  await prisma.tokenRecuperacao.deleteMany();
  await prisma.permissaoUsuario.deleteMany();
  await prisma.sessao.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.sessaoSuperAdmin.deleteMany();
  await prisma.superAdmin.deleteMany();
  await prisma.empresa.deleteMany();
  await prisma.plano.deleteMany();

  console.log("\uD83D\uDCB3 Planos comerciais…");
  const planoCompleto = await prisma.plano.create({
    data: {
      nome: "Completo",
      slug: "completo",
      preco: 399.9,
      descricao: "Todos os módulos: PDV, mesas, garçom, delivery, entregador, estoque, WhatsApp/IA, fiscal.",
      modulosPadrao: serializarModulos([
        "pdv", "mesas", "kds", "delivery", "entregador", "estoque",
        "relatorios", "whatsapp", "fiscal", "impressao", "copiloto",
      ]),
      iaIncluida: true,
      ordem: 3,
    },
  });
  await prisma.plano.create({
    data: {
      nome: "Intermediário",
      slug: "intermediario",
      preco: 249.9,
      descricao: "PDV, mesas, delivery, estoque, relatórios e WhatsApp/IA.",
      modulosPadrao: serializarModulos(["pdv", "mesas", "delivery", "estoque", "relatorios", "whatsapp", "impressao"]),
      iaIncluida: true,
      ordem: 2,
    },
  });
  await prisma.plano.create({
    data: {
      nome: "Básico",
      slug: "basico",
      preco: 119.9,
      descricao: "PDV, balcão, caixa, estoque e relatórios essenciais.",
      modulosPadrao: serializarModulos(["pdv", "estoque", "relatorios", "impressao"]),
      limiteMensagensIA: 200,
      iaIncluida: false,
      ordem: 1,
    },
  });

  console.log("\uD83C\uDFE2 Empresa (primeiro tenant da plataforma — Disk Pizza Rozeno)…");
  const schemaBanco = nomeSchemaDoSlug("disk-pizza-rozeno");
  // Provisiona o schema PostgreSQL dedicado ANTES de criar o registro da
  // empresa (isolamento estrutural — ver src/lib/tenant-provisionamento.ts).
  // CORREÇÃO: DDL (CREATE SCHEMA/TABLE) prefere a conexão DIRETA quando o
  // provedor usa pooler (Supabase) — mesmo padrão já usado em
  // POST /api/superadmin/empresas; o seed usava só DATABASE_URL direto,
  // que pode não suportar as sequências de DDL num pooler em modo
  // transação.
  await provisionarSchemaEmpresa(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, schemaBanco);

  const empresa = await prisma.empresa.create({
    data: {
      nome: "Disk Pizza Rozeno",
      slug: "disk-pizza-rozeno",
      razaoSocial: "Pizzaria Rozeno LTDA",
      cnpj: "12.345.678/0001-90",
      telefone: "(11) 4002-8922",
      email: "contato@rozeno.com.br",
      status: "ativa",
      plano: "completo",
      planoId: planoCompleto.id,
      modulos: planoCompleto.modulosPadrao,
      planoInicioEm: new Date(),
      schemaBanco,
    },
  });
  const empresaId = empresa.id;
  // A partir daqui, todo `prisma.<model de tenant>` (produto, pedido,
  // cliente, caixa, estoque…) resolve para o schema desta empresa —
  // ver src/lib/tenant-context.ts.
  ativarTenant(empresa);

  console.log("\uD83D\uDEE1\uFE0F  Super Admin (dono da plataforma)…");
  // PEDIDO 59: senha ALEATÓRIA, não mais "superadmin123" fixa e
  // adivinhável — gerada agora e só impressa no console no fim deste
  // script (nunca gravada em texto puro em lugar nenhum além disso).
  const senhaSuperAdmin = crypto.randomBytes(9).toString("base64url");
  await prisma.superAdmin.create({
    data: {
      nome: "Super Admin PedidoFlow",
      email: "superadmin@pedidoflow.com.br",
      senhaHash: bcrypt.hashSync(senhaSuperAdmin, 10),
      ativo: true,
    },
  });

  console.log("\uD83D\uDC64 Usuários…");
  // Mesma correção: senha aleatória, não mais "pizza123" fixa e adivinhável.
  const senhaDemoTexto = crypto.randomBytes(6).toString("base64url");
  const senha = bcrypt.hashSync(senhaDemoTexto, 10);
  for (const u of USUARIOS) {
    await prisma.usuario.create({
      data: { empresaId, nome: u.nome, email: u.email, senhaHash: senha, papel: u.papel, ativo: true },
    });
  }

  console.log("🍕 Catálogo (categorias, produtos, sabores, tamanhos, adicionais)…");
  for (const [i, nome] of CATEGORIAS.entries()) {
    await prisma.categoria.create({ data: { empresaId, nome, ordem: i } });
  }
  const categorias = await prisma.categoria.findMany({ where: { empresaId } });
  const catPorNome = new Map(categorias.map((c) => [c.nome, c.id]));

  for (const p of PRODUTOS_SEED) {
    await prisma.produto.create({
      data: {
        id: p.id,
        empresaId,
        nome: p.nome,
        descricao: p.descricao,
        preco: p.preco,
        emoji: p.emoji,
        destaque: p.destaque ?? false,
        ativo: p.ativo !== false,
        categoriaId: catPorNome.get(p.categoria)!,
        // Dados fiscais (PEDIDO 19): NCM/CFOP/CSOSN padrão para alimentos
        // (Simples Nacional). Ajuste por produto antes da produção.
        ncm: p.ncm ?? "1905.90.90",
        cest: p.cest ?? "",
        csosn: p.csosn ?? "102",
        cfop: p.cfop ?? "5102",
        unidade: p.unidade ?? "UN",
      },
    });
  }

  for (const s of SABORES) {
    await prisma.sabor.create({
      data: {
        empresaId,
        nome: s.nome,
        tipo: s.tipo,
        produtos: { create: s.produtos.map((produtoId) => ({ produtoId })) },
      },
    });
  }

  const ehPizza = new Set(PRODUTOS_SEED.filter((p) => p.categoria.startsWith("Pizzas")).map((p) => p.id));
  for (const t of TAMANHOS) {
    await prisma.tamanho.create({
      data: { empresaId, nome: t.nome, fatorPreco: t.fator, maxSabores: t.maxSabores },
    });
  }
  const tamanhos = await prisma.tamanho.findMany({ where: { empresaId } });
  const padrao = tamanhos.find((t) => t.nome === "Padrão")!;
  const media = tamanhos.find((t) => t.nome === "Média")!;
  const grande = tamanhos.find((t) => t.nome === "Grande")!;
  const familia = tamanhos.find((t) => t.nome === "Família")!;

  for (const p of PRODUTOS_SEED) {
    if (ehPizza.has(p.id)) {
      // Preços reais do cardápio (Média/Grande/Família); sem `tamanhos`
      // informado, deriva da base como antes.
      const t = p.tamanhos ?? { media: p.preco, grande: arredondar2(p.preco * 1.35), familia: arredondar2(p.preco * 1.7) };
      await prisma.precoTamanho.createMany({
        data: [
          { produtoId: p.id, tamanhoId: media.id, valor: t.media },
          { produtoId: p.id, tamanhoId: grande.id, valor: t.grande },
          { produtoId: p.id, tamanhoId: familia.id, valor: t.familia },
        ],
      });
    } else {
      await prisma.precoTamanho.create({
        data: { produtoId: p.id, tamanhoId: padrao.id, valor: p.preco },
      });
    }
  }

  for (const a of ADICIONAIS) {
    await prisma.adicional.create({ data: { ...a, empresaId } });
  }

  console.log("🪑 Mesas…");
  for (const m of MESAS_SEED) {
    await prisma.mesa.create({ data: { ...m, empresaId } });
  }
  const mesas = await prisma.mesa.findMany({ where: { empresaId } });

  console.log("👥 Clientes…");
  for (const c of CLIENTES) {
    await prisma.cliente.create({ data: { empresaId, nome: c.nome, telefone: c.telefone, enderecos: { create: c.enderecos } } });
  }
  const clientes = await prisma.cliente.findMany({ where: { empresaId }, include: { enderecos: true } });

  console.log("⚙️  Configurações…");
  const configs: Record<string, unknown> = {
    empresa: {
      razaoSocial: "Pizzaria Rozeno LTDA",
      nomeFantasia: "Disk Pizza Rozeno",
      cnpj: "12.345.678/0001-90",
      inscricaoEstadual: "987.654.321",
      rua: "Rua das Acácias, 120",
      cidade: "Centro — São Paulo/SP",
      uf: "SP",
      cep: "01310-100",
      telefone: "(11) 4002-8922",
      email: "contato@rozeno.com.br",
      regime: "Simples Nacional",
    },
    nfce: {
      serie: 1,
      proximoNumero: 1,
      ambiente: "homologacao",
      logo: true,
      emitirAutomatico: true,
      provedor: "",
    },
    impressoras: IMPRESSORAS,
    impressao: {
      // Token exigido do agente local (header `x-agente-token`) que
      // imprime fisicamente. Troque antes de usar em produção.
      agenteToken: "agente-demo-2026",
      largura: "80mm",
    },
    taxas: {
      formas: TAXAS,
      taxaEntrega: {
        regra: "bairro",
        valorFixo: 5.0,
        valorPadrao: 9.9,
        gratisAcima: 0,
        bairros: [
          { bairro: "Centro", valor: 5.0 },
          { bairro: "Bela Vista", valor: 6.5 },
          { bairro: "Consolação", valor: 7.5 },
          { bairro: "Jardins", valor: 8.5 },
          { bairro: "Paraíso", valor: 8.0 },
          { bairro: "Itaim Bibi", valor: 9.5 },
          { bairro: "Vila Mariana", valor: 10.5 },
          { bairro: "Cerqueira César", valor: 9.0 },
        ],
      },
    },
    formas_pagamento: FORMAS_PAGAMENTO,
  };
  for (const [chave, valor] of Object.entries(configs)) {
    await prisma.configuracao.create({ data: { empresaId, chave, valor: JSON.stringify(valor) } });
  }

  console.log("📦 Estoque…");
  for (const e of ESTOQUE) {
    await prisma.estoqueProduto.create({ data: { ...e, empresaId } });
  }
  const estoqueItens = await prisma.estoqueProduto.findMany({ where: { empresaId } });
  for (const [i, e] of estoqueItens.entries()) {
    await prisma.movimentacaoEstoque.create({
      data: {
        empresaId,
        produtoId: e.id,
        tipo: "entrada",
        quantidade: e.quantidade,
        fornecedor: i % 2 === 0 ? "Distribuidora Vale" : "Atacadão do Povo",
        valorTotal: arredondar2(e.quantidade * e.custoUnitario),
        responsavel: "Ana Rozeno",
        criadoEm: diaAtras(13 - i, 9, 18),
      },
    });
  }

  console.log("🧾 Notas fiscais…");
  for (const n of NOTAS) {
    await prisma.notaFiscal.create({ data: { ...n, empresaId } });
  }

  console.log("🛵 Entregadores…");
  const ENTREGADORES_SEED = [
    { nome: "Samuel", email: "samuel@rozeno.com.br", avaliacao: 4.8, statusHoje: "ativo" },
    { nome: "Ari", email: "ari@rozeno.com.br", avaliacao: 4.7, statusHoje: "ativo" },
    { nome: "Marlon", email: "marlon@rozeno.com.br", avaliacao: 4.6, statusHoje: "ativo" },
  ];
  for (const e of ENTREGADORES_SEED) {
    await prisma.entregador.create({ data: { ...e, empresaId } });
  }
  const entregadores = await prisma.entregador.findMany({ where: { empresaId } });

  console.log("💾 Backups…");
  const backups = [
    { dias: 0, tipo: "automático", tamanho: "128 MB" },
    { dias: 1, tipo: "automático", tamanho: "127 MB" },
    { dias: 2, tipo: "automático", tamanho: "127 MB", status: "falhou" },
    { dias: 3, tipo: "manual", tamanho: "126 MB" },
    { dias: 4, tipo: "automático", tamanho: "126 MB" },
  ];
  for (const b of backups) {
    await prisma.backup.create({
      data: { empresaId, data: diaAtras(b.dias, 4, 20), tipo: b.tipo, tamanho: b.tamanho, destino: "Google Drive", status: b.status ?? "concluido" },
    });
  }

  console.log("🧾 Pedidos de demonstração (14 dias)…");
  const canais = ["salao", "salao", "delivery", "delivery", "retirada", "balcao"];
  // Hoje o KDS precisa mostrar todos os estágios da produção.
  const statusPorCanal: Record<string, string[]> = {
    balcao: ["concluido", "andamento", "andamento", "preparando"],
    salao: ["concluido", "andamento", "preparando", "pronto"],
    retirada: ["concluido", "retirado", "pronto", "preparando"],
    delivery: ["concluido", "andamento", "preparando", "andamento"],
  };
  const formas = ["pix", "dinheiro", "debito", "credito", "pix", "dinheiro"];
  const produtos = await prisma.produto.findMany({ where: { empresaId }, include: { categoria: true } });
  const deliveryPorDia: { pedidoId: string; endereco: string; bairro: string; complemento: string | null; referencia: string | null; telefone: string | null; criadoEm: Date }[] = [];

  function produzirItens(pedidoTotal: number): {
    produtoId: string;
    nome: string;
    precoUnit: number;
    quantidade: number;
    tamanho?: string;
    sabores?: string;
    adicionais?: string;
  }[] {
    const itensSelecionados: (typeof produtos)[number][] = [];
    for (let i = 0; i < pedidoTotal; i++) itensSelecionados.push(produtos[entre(0, produtos.length - 1)]);
    return itensSelecionados.map((p) => {
      const item: Record<string, unknown> = {
        produtoId: p.id,
        nome: p.nome,
        precoUnit: p.preco,
        quantidade: entre(1, 2),
      };
      const ehPizza = p.categoria?.nome?.includes("Pizza");
      if (ehPizza && rnd() > 0.35) {
        item.tamanho = escolher(TAMANHOS).nome;
        const sabores = [...SABORES].sort(() => rnd() - 0.5).slice(0, rnd() > 0.5 ? 2 : 1);
        item.sabores = JSON.stringify(sabores.map((s) => s.nome));
        if (rnd() > 0.5) {
          const adicionais = [...ADICIONAIS].sort(() => rnd() - 0.5).slice(0, entre(1, 2));
          item.adicionais = JSON.stringify(adicionais.map((a) => ({ nome: a.nome, preco: a.preco })));
          item.precoUnit = arredondar2(p.preco + adicionais.reduce((acc, a) => acc + a.preco, 0));
        }
      }
      return item as {
        produtoId: string;
        nome: string;
        precoUnit: number;
        quantidade: number;
        tamanho?: string;
        sabores?: string;
        adicionais?: string;
      };
    });
  }

  function producaoDoStatus(status: string) {
    if (status === "preparando") return "em_preparo";
    if (status === "pronto") return "pronto";
    if (status === "concluido" || status === "retirado") return "finalizado";
    return "recebido";
  }

  function temposDeProducao(criadoEm: Date, producao: string) {
    const preparoIniciadoEm = new Date(criadoEm.getTime() + (3 + entre(0, 5)) * 60_000);
    const prontoEm = new Date(preparoIniciadoEm.getTime() + (8 + entre(0, 7)) * 60_000);
    const finalizadoEm = new Date(prontoEm.getTime() + (1 + entre(0, 4)) * 60_000);
    return {
      recebidoEm: criadoEm,
      preparoIniciadoEm: producao === "em_preparo" || producao === "pronto" || producao === "finalizado" ? preparoIniciadoEm : null,
      prontoEm: producao === "pronto" || producao === "finalizado" ? prontoEm : null,
      finalizadoEm: producao === "finalizado" ? finalizadoEm : null,
    };
  }

  let numero = 1000;
  for (let dias = 13; dias >= 0; dias--) {
    const diaSemana = new Date(diaAtras(dias)).getDay();
    const base = dias === 0 ? 8 : 9 + entre(0, 4) + (diaSemana === 0 || diaSemana === 6 ? 4 : 0);
    for (let n = 0; n < base; n++) {
      const canal = escolher(canais);
      const criadoEm = diaAtras(dias, 11, 22);
      const totalItens = entre(1, 3);
      const itens = produzirItens(totalItens);
      const subtotal = arredondar2(itens.reduce((acc, i) => acc + Number(i.precoUnit) * Number(i.quantidade), 0));
      const status = dias === 0 ? escolher(statusPorCanal[canal]) : "concluido";
      const producao = producaoDoStatus(status);
      const mesa = canal === "salao" ? escolher(mesas).id : null;
      const cliente = canal === "delivery" || canal === "retirada" ? escolher(clientes) : null;
      const bairro = canal === "delivery" ? escolher(BAIXAS) : null;
      // Taxa de entrega por regra configurada (PEDIDO 17).
      const taxaEntrega = canal === "delivery" ? arredondar2(TAXA_BAIRROS[bairro ?? ""] ?? 9.9) : 0;
      const total = arredondar2(subtotal + taxaEntrega);

      const pedido = await prisma.pedido.create({
        data: {
          empresaId,
          numero,
          canal,
          status,
          producao,
          ...temposDeProducao(criadoEm, producao),
          clienteNome: cliente?.nome ?? (canal === "balcao" ? "Cliente balcão" : null),
          clienteTelefone: cliente?.telefone ?? null,
          clienteId: cliente?.id,
          mesaId: mesa,
          observacao: totalItens === 3 && rnd() > 0.6 ? "Sem cebola" : null,
          previsao: canal === "delivery" ? `${entre(25, 55)} min` : null,
          taxaEntrega,
          trocoPara: canal === "delivery" && rnd() > 0.7 ? 100 : 0,
          formaPagamentoEntrega: canal === "delivery" ? escolher(formas) : null,
          total,
          criadoEm,
          itens: { create: itens },
        },
      });
      numero++;

      if (canal === "delivery" && bairro && cliente) {
        const endereco = cliente.enderecos?.[0] ?? { rua: "Rua das Acácias, 120", bairro, complemento: null, referencia: null };
        deliveryPorDia.push({
          pedidoId: pedido.id,
          endereco: endereco.rua,
          bairro: endereco.bairro ?? bairro,
          complemento: endereco.complemento ?? null,
          referencia: endereco.referencia ?? null,
          telefone: cliente.telefone ?? null,
          criadoEm,
        });
      }

      if (status === "concluido" || status === "retirado") {
        await prisma.pagamento.create({
          data: { empresaId, pedidoId: pedido.id, forma: escolher(formas), valor: total, criadoEm },
        });
      } else if (canal === "delivery" && dias === 0 && rnd() > 0.5) {
        // Delivery de hoje ainda em andamento: pagamento pendente (na entrega).
        await prisma.pagamento.create({
          data: { empresaId, pedidoId: pedido.id, forma: escolher(formas), valor: total, status: "pendente", criadoEm },
        });
      }
    }
  }

  console.log("🛵 Entregas…");
  for (const d of deliveryPorDia) {
    const entregador = entregadores[entre(0, entregadores.length - 1)];
    const status = escolher(["entregue", "entregue", "entregue", "rota", "rota", "aguardando"]);
    await prisma.entrega.create({
      data: {
        empresaId,
        pedidoId: d.pedidoId,
        entregadorId: status === "aguardando" ? null : entregador.id,
        endereco: d.endereco,
        bairro: d.bairro,
        complemento: d.complemento,
        referencia: d.referencia,
        telefone: d.telefone,
        status,
        km: arredondar2(1.5 + rnd() * 8),
        gorjeta: arredondar2(rnd() > 0.5 ? 2 + rnd() * 8 : 0),
        previsao: `${entre(25, 55)} min`,
        iniciadaEm: status === "rota" ? d.criadoEm : null,
        concluidaEm: status === "entregue" ? d.criadoEm : null,
        criadoEm: d.criadoEm,
      },
    });
  }

  console.log("💰 Caixa (ontem fechado + hoje aberto)…");
  const caixaOntem = await prisma.caixa.create({
    data: { empresaId, abertoEm: diaAtras(1, 18, 18), fechadoEm: diaAtras(1, 23, 23), saldoInicial: 100, status: "fechado" },
  });
  await prisma.movimentacaoCaixa.create({
    data: { empresaId, caixaId: caixaOntem.id, tipo: "abertura", valor: 100, descricao: "Abertura de caixa" },
  });

  const caixaHoje = await prisma.caixa.create({
    data: { empresaId, abertoEm: diaAtras(0, 8, 8), saldoInicial: 150, status: "aberto" },
  });
  await prisma.movimentacaoCaixa.create({
    data: { empresaId, caixaId: caixaHoje.id, tipo: "abertura", valor: 150, descricao: "Abertura de caixa" },
  });

  const pedidosHoje = await prisma.pedido.findMany({
    where: { empresaId, criadoEm: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }, status: { in: ["concluido", "retirado"] } },
    include: { pagamentos: true },
  });
  for (const p of pedidosHoje) {
    const forma = p.pagamentos[0]?.forma ?? "pix";
    await prisma.movimentacaoCaixa.create({
      data: { empresaId, caixaId: caixaHoje.id, tipo: "venda", valor: p.total, metodo: forma, descricao: `Pedido #${p.numero}` },
    });
  }
  await prisma.movimentacaoCaixa.create({
    data: { empresaId, caixaId: caixaHoje.id, tipo: "troco", valor: 10, metodo: "dinheiro", descricao: "Troco — Pedido #" + pedidosHoje[0]?.numero },
  });

  const totalVendas = pedidosHoje.reduce((acc, p) => acc + p.total, 0);

  console.log("💬 WhatsApp (conversa demo com pedido vinculado)…");
  const whatsCliente = await prisma.cliente.create({
    data: {
      empresaId,
      nome: "Bruno Ribeiro",
      telefone: "5511999990000",
      enderecos: { create: [{ rotulo: "casa", rua: "Rua dos Pinheiros, 320", bairro: "Bela Vista", complemento: "ap. 12", referencia: "Portaria do edifício verde" }] },
    },
  });
  const whatsCriadoEm = diaAtras(0, 19, 40);
  const whatsPedido = await prisma.pedido.create({
    data: {
      empresaId,
      numero,
      canal: "retirada",
      status: "preparando",
      producao: "em_preparo",
      recebidoEm: whatsCriadoEm,
      preparoIniciadoEm: new Date(whatsCriadoEm.getTime() + 3 * 60_000),
      clienteNome: whatsCliente.nome,
      clienteTelefone: whatsCliente.telefone,
      clienteId: whatsCliente.id,
      origem: "whatsapp",
      previsao: "30 min",
      taxaEntrega: 0,
      total: 86.32,
      criadoEm: whatsCriadoEm,
      itens: {
        create: [
          {
            produtoId: "pz-calabresa",
            nome: "Pizza Calabresa",
            precoUnit: 86.32,
            quantidade: 1,
            tamanho: "Grande",
            sabores: JSON.stringify(["Calabresa"]),
            adicionais: JSON.stringify([{ nome: "Borda recheada de catupiry", preco: 14.9 }]),
          },
        ],
      },
    },
  });
  numero++;
  const whatsEstado = JSON.stringify({
    itens: [
      {
        produtoId: "pz-calabresa",
        nome: "Pizza Calabresa",
        tamanho: "Grande",
        quantidade: 1,
        precoUnit: 86.32,
        sabores: ["Calabresa"],
        adicionais: [{ nome: "Borda recheada de catupiry", preco: 14.9 }],
      },
    ],
    canal: "retirada",
    formaPagamento: "pix",
    trocoPara: 0,
    tentativas: 0,
  });
  await prisma.conversaWhatsApp.create({
    data: {
      empresaId,
      telefone: "5511999990000",
      nome: "Bruno Ribeiro",
      origem: "simulacao",
      status: "pedido_criado",
      etapa: "criado",
      estado: whatsEstado,
      pedidoId: whatsPedido.id,
      ultimaPergunta: "Pedido confirmado!",
      criadoEm: whatsCriadoEm,
      atualizadoEm: new Date(whatsCriadoEm.getTime() + 5 * 60_000),
      mensagens: {
        create: [
          { de: "cliente", texto: "oi, quero pedir uma pizza", criadoEm: whatsCriadoEm },
          { de: "sistema", texto: "Olá! 😊 Aqui vai o nosso cardápio...", criadoEm: whatsCriadoEm },
          { de: "cliente", texto: "quero uma calabresa grande", criadoEm: new Date(whatsCriadoEm.getTime() + 60_000) },
          { de: "sistema", texto: "Qual sabor?", criadoEm: new Date(whatsCriadoEm.getTime() + 70_000) },
          { de: "cliente", texto: "1", criadoEm: new Date(whatsCriadoEm.getTime() + 100_000) },
          { de: "sistema", texto: "Quer algum adicional?", criadoEm: new Date(whatsCriadoEm.getTime() + 110_000) },
          { de: "cliente", texto: "borda de catupiry", criadoEm: new Date(whatsCriadoEm.getTime() + 140_000) },
          { de: "sistema", texto: "Retirada ou entrega?", criadoEm: new Date(whatsCriadoEm.getTime() + 150_000) },
          { de: "cliente", texto: "retirada", criadoEm: new Date(whatsCriadoEm.getTime() + 180_000) },
          { de: "sistema", texto: "Como vai pagar?", criadoEm: new Date(whatsCriadoEm.getTime() + 190_000) },
          { de: "cliente", texto: "pix", criadoEm: new Date(whatsCriadoEm.getTime() + 210_000) },
          { de: "sistema", texto: "*Resumo do pedido* — confirma?", criadoEm: new Date(whatsCriadoEm.getTime() + 220_000) },
          { de: "cliente", texto: "confirmo", criadoEm: new Date(whatsCriadoEm.getTime() + 250_000) },
          { de: "sistema", texto: "Pedido confirmado! ✅ Enviado para a cozinha.", criadoEm: new Date(whatsCriadoEm.getTime() + 260_000) },
        ],
      },
    },
  });

  // ------------------------------------------------------------------
  // Contador de pedidos — SEMPRE POR ÚLTIMO nesta empresa.
  //
  // O seed insere pedidos com número explícito (1001+) sem passar por
  // `proximoNumeroPedido`, então o contador atômico precisa ser
  // sincronizado com o maior número realmente gerado.
  //
  // CORREÇÃO (bug confirmado em teste): esta sincronização ficava ANTES
  // do bloco do WhatsApp, que cria mais um pedido. O contador terminava
  // exatamente UM número atrás do maior pedido existente e o PRIMEIRO
  // pedido real feito pela API colidia com o do WhatsApp — "Unique
  // constraint failed on (empresaId, numero)", erro 500 no PDV.
  // Movido para depois de TODOS os pedidos desta empresa.
  //
  // `proximoNumeroPedido` também passou a se auto-corrigir a partir de
  // MAX(numero), então nem um contador atrasado por outro motivo
  // (importação de histórico, restauração de backup) derruba mais a
  // criação de pedido — mas o valor certo já nasce aqui.
  // ------------------------------------------------------------------
  const maxNumero = await prisma.pedido.aggregate({ _max: { numero: true } });
  await prisma.contadorPedido.upsert({
    where: { empresaId },
    create: { empresaId, ultimoNumero: maxNumero._max.numero ?? 1000 },
    update: { ultimoNumero: maxNumero._max.numero ?? 1000 },
  });

  // ------------------------------------------------------------------
  // Empresa Teste B — segunda empresa mínima, só para validar isolamento
  // multiempresa (PEDIDO: "os dados de uma nunca podem aparecer na outra").
  // ------------------------------------------------------------------
  console.log("🏢 Empresa Teste B (segunda empresa, para validar isolamento)…");
  const planoBasico = await prisma.plano.findUnique({ where: { slug: "basico" } });
  const schemaBancoB = nomeSchemaDoSlug("empresa-teste-b");
  await provisionarSchemaEmpresa(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, schemaBancoB);
  const empresaB = await prisma.empresa.create({
    data: {
      nome: "Empresa Teste B",
      slug: "empresa-teste-b",
      status: "ativa",
      plano: "basico",
      planoId: planoBasico?.id,
      modulos: planoBasico?.modulosPadrao ?? serializarModulos(["pdv", "estoque", "relatorios"]),
      planoInicioEm: new Date(),
      schemaBanco: schemaBancoB,
    },
  });
  ativarTenant(empresaB);
  await prisma.usuario.create({
    data: {
      empresaId: empresaB.id,
      nome: "Administrador Teste B",
      email: "admin@testeb.com.br",
      senhaHash: senha,
      papel: "ADMINISTRADOR",
      ativo: true,
    },
  });
  const categoriaB = await prisma.categoria.create({ data: { empresaId: empresaB.id, nome: "Salgados" } });
  await prisma.produto.create({
    data: {
      empresaId: empresaB.id,
      nome: "Coxinha",
      descricao: "Coxinha de frango com catupiry",
      preco: 8.5,
      categoriaId: categoriaB.id,
      ativo: true,
    },
  });
  await prisma.cliente.create({
    data: { empresaId: empresaB.id, nome: "Cliente da Empresa B", telefone: "11988880000" },
  });

  console.log("✅ Seed concluído!");
  console.log("");
  console.log("🔑 Credenciais geradas agora (não ficam salvas em texto puro em lugar nenhum — anote):");
  console.log(`   • Super Admin: superadmin@pedidoflow.com.br / ${senhaSuperAdmin}`);
  console.log(`   • Usuários de demonstração: ${senhaDemoTexto} (mesma senha pra todos — troque no primeiro login de produção)`);
  console.log("");
  console.log(`   • ${USUARIOS.length} usuários`);
  console.log(`   • ${PRODUTOS_SEED.length} produtos, ${SABORES.length} sabores, ${TAMANHOS.length} tamanhos, ${ADICIONAIS.length} adicionais`);
  console.log(`   • ${mesas.length} mesas · ${clientes.length} clientes · ${estoqueItens.length} itens de estoque`);
  console.log(`   • Pedidos: ${numero - 1000} · vendas de hoje: ${brl(totalVendas)} · caixa do dia aberto`);
  console.log(`   • WhatsApp: 1 conversa demo com pedido #${whatsPedido.numero} vinculado`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    // Encerra tanto o cliente da plataforma quanto o(s) cliente(s) de
    // tenant abertos durante o seed (o proxy `prisma` não expõe um único
    // $disconnect universal — ver src/lib/prisma.ts).
    await plataformaPrisma.$disconnect().catch(() => null);
    const { encerrarTodosClientesTenant } = await import("@/lib/tenant-db");
    await encerrarTodosClientesTenant();
  });

