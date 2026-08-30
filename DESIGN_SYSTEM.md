# PedidoFlow — Guia do Design System

## Princípios

1. **Grande e claro.** Fonte de corpo em 17px (não 16px), botões com no
   mínimo 48px de altura, alvos de toque generosos. Pensado para uso por
   pessoas de qualquer idade e familiaridade digital, em pé, no balcão.
2. **Uma cor de destaque só.** O vermelho "Brasa" (`primary`) é a única cor
   usada para ações. Tudo o mais é neutro — exceto os cinco status de mesa,
   que têm função de leitura à distância, não de decoração.
3. **Papel, não vidro.** Sombras suaves e quentes (`shadow-soft`,
   `shadow-card`), nunca desfoque pesado ou gradientes "glassmorphism".
4. **Espaço é hierarquia.** Prefira mais respiro a mais bordas. Separe
   seções com espaço (`gap-8`, `py-16`) antes de recorrer a linhas divisórias.
5. **Nada "gamer".** Sem neon, sem gradientes saturados, sem cantos
   agressivos, sem fontes condensadas/futuristas.

## Cores

Definidas em `tailwind.config.ts` e como variáveis CSS em
`src/app/globals.css` (formato HSL, compatível com shadcn/ui).

| Token | Uso | Hex aprox. |
|---|---|---|
| `background` | Fundo geral do app | `#FAF8F5` |
| `foreground` | Texto principal | `#1C1916` |
| `primary` (600) | Ações primárias, marca | `#953C2A` |
| `secondary` | Superfícies neutras, botões secundários | `#F3EFEA` |
| `muted-foreground` | Texto de apoio | `#6B6259` |
| `border` | Bordas e divisores | `#E3DCD2` |
| `destructive` | Ações destrutivas (excluir, fechar) | `#B23B2E` |

### Status de mesa

Cor com função semântica — reconhecível à distância, sem precisar ler o texto.

| Status | Cor | Uso |
|---|---|---|
| Livre | Verde (`status-free`) | Mesa disponível |
| Aguardando | Âmbar (`status-waiting`) | Cliente aguardando atendimento |
| Pedido enviado | Azul (`status-sent`) | Pedido já está na cozinha |
| Pedindo conta | Roxo (`status-bill`) | Cliente pediu a conta |
| Ocupada | Vermelho (`status-occupied`) | Mesa em consumo, sem pedido ativo |

Cada status tem três variantes: `DEFAULT` (texto/ícone), `bg` (fundo claro) e
`border`. Use sempre as três juntas (ver `StatusBadge` e `TableCard`).

## Tipografia

- **Família única:** [Geist](https://vercel.com/font) para toda a interface
  (títulos, corpo, botões, formulários). Carregada via `next/font/google` em
  `src/app/layout.tsx` — sem *layout shift*, sem dependência de CDN externo.
- **Geist Mono:** reservado a dados tabulares — preços, números de mesa/pedido,
  relógio do header. Sempre com a classe utilitária `.tabular`
  (`font-variant-numeric: tabular-nums`) para que os dígitos não "dancem".
- **Escala** (ver `tailwind.config.ts → theme.extend.fontSize`): de `xs`
  (13px) a `5xl` (56px), cerca de 6% maior que a escala padrão do Tailwind em
  cada degrau — a decisão consciente por "letras grandes" do briefing.
- **Peso:** `font-semibold`/`font-bold` para títulos, `font-medium` para
  rótulos e ênfase leve, `font-normal` para corpo. Evite `font-light`.

## Espaçamento e layout

- Grade de contêiner: `container` do Tailwind, com `padding` responsivo
  (1.5rem → 4rem) definido em `tailwind.config.ts`.
- Cards usam `p-6 sm:p-7` (conteúdo) e `p-6 sm:p-8` em superfícies maiores.
- Seções de página são separadas por `gap-20` na página de estilo — o
  espaço em branco é a principal ferramenta de organização visual.

## Raios e sombras

- `--radius: 1rem` (16px) é a base. Cards usam `rounded-2xl` (30px),
  botões e inputs usam `rounded-xl` (22px). Nunca `rounded-none`.
- `shadow-soft` → elementos pequenos elevados (botões, badges com glow).
- `shadow-card` → cards em repouso.
- `shadow-lifted` → modais, sheets, dropdowns (camada mais alta).

## Movimento

- Transições de cor/posição: `duration-150`, `ease-out` — rápidas o
  suficiente para não atrasar o uso, lentas o suficiente para não parecer
  abrupto.
- `animate-ember-pulse`: pulso suave e quente, reservado para chamar atenção
  pontualmente (ex.: uma mesa "Aguardando" há muito tempo). Usar com
  moderação — no máximo um elemento pulsando por tela.
- `prefers-reduced-motion` é respeitado globalmente em `globals.css`.

## Componentes — onde encontrar

| Categoria | Arquivo |
|---|---|
| Botões | `components/ui/button.tsx` |
| Cards | `components/ui/card.tsx` |
| Inputs / Textarea / Select / Switch | `components/ui/{input,textarea,select,switch}.tsx` |
| Tabelas | `components/ui/table.tsx` |
| Modais | `components/ui/dialog.tsx` |
| Gaveta (sidebar mobile) | `components/ui/sheet.tsx` |
| Toasts | `components/ui/sonner.tsx` |
| Sidebar / Header / Casca do app | `components/layout/*` |
| Selo de status, Cartão de mesa, Cartão de métrica | `components/patterns/*` |
| Cartão de produto, Linha de item, Barra flutuante | `components/patterns/{produto-card,item-pedido-row,floating-cart-bar}.tsx` |
| Gráficos (barras, linhas, rosca) | `components/charts/*` |

## Gráficos (Dashboard)

Os gráficos do Dashboard são **SVG/HTML próprios, sem dependências** —
desenhados para seguir os tokens do DS (fonte Geist, cores hexa dos status,
tabular para números). Regras de uso:

- **Uma cor de destaque só**: o "Brasa" (`#953C2A`) é a cor das séries e das
  barras em destaque. Demais cores vêm da paleta semântica de status
  (ex.: mix de pagamentos — dinheiro `#2E8B57`, débito `#3459B4`, crédito
  `#6E4FA6`, pix `#953C2A`).
- Área sob a linha apenas na primeira série, com `fillOpacity` baixa (0.08)
  — "papel", nunca gradiente pesado.
- Toda fatia/ponto/barra tem **dica nativa** (`<title>`/`title`) com o valor
  formatado — acessível por hover e teclado, sem tooltips customizados.
- Números sempre com `tabular-nums`, unidades abreviadas nos eixos.
- `role="img"` + `aria-label` descrevendo a série para leitores de tela.

> A linha de item (`ItemPedidoRow`) também tem **modo leitura**: sem
> `onQuantidade`/`onRemover` ela vira somente exibição (comanda do Salão,
> cupom NFC-e).

## Impressão do cupom (NFC-e)

O fluxo de pagamento do PDV emite um cupom de demonstração em
`NfceDialog`. A impressão usa a técnica de `visibility` do CSS: apenas a
área com a classe `.print-area` sai no papel, formatada para **bobina
térmica de 80mm** (`@media print` em `src/app/globals.css`). Nenhuma chave
ou protocolo gerados têm valor fiscal — `🔌 OPEN CODE` marca onde entra o
serviço real do SEFAZ.

## Acessibilidade

- Foco de teclado sempre visível (`:focus-visible`, anel de 2px + offset).
- Zoom nunca bloqueado (`maximumScale: 5` no viewport).
- Contraste de texto mínimo AA em todas as combinações de cor do tema claro.
- Todo botão de ícone tem `aria-label`.
