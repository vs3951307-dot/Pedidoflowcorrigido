# Painel Super Admin — guia de uso

O Super Admin é o painel do **proprietário da plataforma PedidoFlow**
(você) — separado dos administradores de cada empresa cliente. Acesse em
`/superadmin/login` com a conta criada pelo seed (ou pela pessoa que
configurou o primeiro Super Admin).

Essa separação é estrutural, não só visual: o Super Admin usa uma tabela
(`SuperAdmin`), uma sessão (`SessaoSuperAdmin`) e uma guarda de acesso
(`autorizarSuperAdmin()`) completamente diferentes das usadas pelos
usuários de empresa — não existe nenhum papel de `Usuario` que dê acesso
ao `/superadmin`.

## Aba "Empresas"

Lista todas as empresas cadastradas na plataforma, com:

- Nome, identificador (slug), plano, quantidade de usuários e pedidos.
- Status atual (Ativa, Período de teste, Bloqueada, Suspensa, Excluída).
- Um seletor para trocar o status na hora — a mudança tem efeito
  imediato: uma empresa bloqueada/suspensa/excluída não consegue mais
  logar em `/login` (a próxima tentativa recebe uma mensagem explicando
  o motivo).

Clique em **Nova empresa** para cadastrar um novo cliente — ver
[`NOVA_EMPRESA.md`](./NOVA_EMPRESA.md) para o passo a passo completo.

## Aba "Saúde"

Diagnóstico rápido de cada empresa, pensado para você identificar
problemas **antes** do cliente ligar reclamando:

- **Online/offline** — baseado na última atividade autenticada da
  empresa (qualquer requisição de API bem-sucedida atualiza esse
  carimbo).
- **Pedidos nas últimas 24h** — sinal indireto de uso normal; uma
  empresa "ativa" com 0 pedidos por vários dias pode indicar que
  pararam de usar ou têm algum problema.
- **WhatsApp / Impressão / Fiscal configurados** — mostra só se cada
  integração está configurada ou não, **nunca** o token/credencial em
  si.
- **Alertas automáticos**: impressões com erro, fila de impressão
  parada há mais de 30 minutos (sinal de agente local offline), período
  de teste expirado, vencimento de plano ultrapassado.

Nenhuma senha, token ou segredo aparece nessa tela em nenhuma
circunstância — só booleanos e contadores derivados.

## O que o Super Admin NÃO faz (por design)

- Não vê o conteúdo dos pedidos, clientes ou conversas de WhatsApp de
  nenhuma empresa — só metadados agregados (contagens, status).
- Não consegue "entrar como" o administrador de uma empresa (não existe
  impersonation nesta versão).
- Não define preços/cardápio/configurações operacionais de nenhuma
  empresa — isso é sempre responsabilidade do administrador dela.

## Planos e módulos

O campo "plano" (Básico/Profissional/Completo) hoje é só uma etiqueta +
um conjunto padrão de módulos sugerido ao criar a empresa — ainda não há
cobrança automática integrada (proposital, para a primeira etapa do
SaaS). O controle real de acesso é feito pelos **módulos habilitados**
por empresa, que você pode ajustar a qualquer momento editando a
empresa: um módulo desmarcado bloqueia tanto o menu quanto a API
correspondente para aquela empresa.

## Próximos passos recomendados (fora do escopo desta entrega)

- Integração de cobrança automática (Stripe, Pagar.me, etc.) usando os
  campos `plano`, `vencimentoEm` e `trialFimEm` já existentes no model
  `Empresa`.
- Página de detalhe por empresa (hoje o detalhe existe na API
  `GET /api/superadmin/empresas/[id]`, mas o painel só usa a lista).
- Auditoria centralizada entre empresas (hoje cada empresa só vê a
  própria trilha de auditoria).
