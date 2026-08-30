# Agente local de impressão (componente externo — PEDIDO 16)

O PedidoFlow **não imprime fisicamente** e não inventa integração falsa.
Ele mantém uma **fila de impressão** no banco com o conteúdo pronto para
térmica de 80 mm; um **agente externo** instalado na máquina da impressora
consome essa fila e imprime de verdade.

## O que já funciona no sistema

| Recurso | Onde | Detalhe |
|---|---|---|
| Fila persistida | `FilaImpressao` (SQLite) | tipo, destino, referência, conteúdo, vias, status, tentativas, erro |
| Enfileiramento automático | `POST /api/pedidos`, pagamento, fechamento de caixa | comanda da cozinha (todos os canais); comanda balcão/retirada/delivery e cupom do cliente no caixa; relatório de fechamento no caixa |
| Dedupe | `enfileirarImpressao(dedupe=true)` | eventos automáticos não duplicam enquanto houver item `pendente`/`erro` para a mesma (tipo, referência) |
| Nunca conclui sozinho | rotas `/concluir` e `/erro` | só o agente confirma; erro incrementa tentativas (3 máx.) e deixa `erro` para reimpressão |
| Reimpressão manual | painel (KDS/PDV/Admin) e `POST /api/impressao` | gera conteúdo novo e enfileira sem dedupe (intencional) |
| Visualização/impressão no navegador | dialog 80 mm com `window.print()` | CSS em `globals.css` (`@media print`, `.print-area`) |
| Configuração | `Admin → Configurações → Impressoras` | destino (cozinha/caixa), vias (1–3), impressão automática, teste de impressão |
| Token do agente | configuração `impressao.agenteToken` | exigido no header `x-agente-token` das rotas do agente |

## Contrato do agente

1. `GET /api/impressao/fila?destino=cozinha|caixa` — header `x-agente-token`
   → lista de itens `pendente` (mais antigos primeiro, máx. 50).
2. Imprimir o `conteudo` (texto 80 mm) o número de `vias` vezes.
3. Sucesso → `POST /api/impressao/fila/:id/concluir`.
4. Falha → `POST /api/impressao/fila/:id/erro` com `{ mensagem }`
   (tentativas incrementam; após 3, o item fica `erro`).

## Como usar o exemplo

```powershell
node scripts/agente-impressao/agente.mjs   # com AGENTE_URL, AGENTE_TOKEN e AGENTE_DESTINO
```

O exemplo imprime no console (pode ser direcionado a uma impressora de
texto do SO). Para térmica ESC/POS de verdade, substitua a função
`imprimir()` do `agente.mjs` por uma biblioteca ESC/POS apontando para a
impressora USB/Bluetooth/rede da máquina — o contrato de confirmação
(`/concluir` só após imprimir, `/erro` em qualquer falha) não muda.

> A detecção de impressoras na rede, instalação de drivers e o envio
> ESC/POS dependem do sistema operacional e do hardware — estão fora do
> servidor e ficam neste componente externo.
