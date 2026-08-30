/**
 * PM2 — PedidoFlow.
 *
 * Uso na VPS:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup systemd
 *
 * DUAS COISAS QUE NÃO SÃO OPCIONAIS AQUI:
 *
 * 1. `exec_mode: "fork"` e `instances: 1`. Os eventos em tempo real
 *    (cozinha, mesas, entregas, fila de impressão) usam um EventEmitter
 *    em MEMÓRIA (src/lib/eventos-tempo-real.ts). Em modo cluster, um
 *    evento emitido no processo A nunca chega em quem está conectado no
 *    processo B — a cozinha simplesmente não recebe o pedido, de forma
 *    intermitente, dependendo de qual processo atendeu cada aba. O rate
 *    limit e o deduplicador de webhook também são em memória e teriam o
 *    mesmo problema. Só mude isto depois de trocar o EventEmitter por
 *    Redis ou Postgres LISTEN/NOTIFY.
 *
 * 2. `NODE_ENV: "production"`. Sem isso o Next roda em modo dev (lento) e,
 *    pior, o cookie de sessão perde a flag `Secure`.
 *
 * O comando anterior (`pm2 start "npm run start" --name pedidoflow -- -- -p 3000`)
 * passava os argumentos por duas camadas de `--` e não definia NODE_ENV.
 */
module.exports = {
  apps: [
    {
      name: "pedidoflow",
      cwd: "/opt/pedidoflow",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      exec_mode: "fork",
      instances: 1,
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
      // Reinício automático se o processo morrer, com teto para não entrar
      // em loop de crash consumindo CPU.
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      // Um vazamento de memória não pode derrubar a loja no meio do
      // movimento: o PM2 reinicia sozinho acima deste limite.
      max_memory_restart: "700M",
      time: true,
      out_file: "/var/log/pedidoflow/out.log",
      error_file: "/var/log/pedidoflow/error.log",
      merge_logs: true,
    },
  ],
};
