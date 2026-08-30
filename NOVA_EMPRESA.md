# Cadastrando uma nova empresa no PedidoFlow

Guia rápido para colocar a **segunda** (ou enésima) empresa na
plataforma — sem precisar mexer em código, banco de dados ou hospedagem.

## Passo a passo

1. Acesse `https://SEU-DOMINIO/superadmin/login` e entre com sua conta
   de Super Admin.
2. Na aba **Empresas**, clique em **Nova empresa**.
3. Preencha:
   - **Nome da empresa** — nome fantasia (ex.: "Pastelaria do João").
   - **Identificador (slug)** — só letras minúsculas, números e hífens
     (ex.: `pastelaria-do-joao`). Usado internamente; não precisa ser
     exposto a ninguém.
   - **Plano** — Básico, Profissional ou Completo (isso só define os
     módulos padrão sugeridos; você pode ajustar módulo por módulo
     abaixo).
   - **Dias de teste grátis** — período de trial antes de exigir plano
     pago (0 = pula direto para "ativa").
   - **Módulos habilitados** — marque os que essa empresa vai usar.
     Um módulo desmarcado some do menu **e** bloqueia a API
     correspondente — não é só cosmético.
   - **Nome, e-mail e senha do administrador** — essa pessoa vai
     conseguir logar em `/login` (não em `/superadmin`) e administrar
     **somente essa empresa**.
4. Clique em **Criar empresa**.

Pronto — a empresa já existe, isolada de todas as outras, com seu
próprio catálogo, pedidos, clientes, caixa, estoque, etc., todos vazios
e prontos para o administrador dela configurar.

## O que o administrador da empresa faz depois

Ele faz login normal em `/login` com o e-mail/senha que você criou, e a
partir daí administra:

- Cardápio (categorias, produtos, sabores, tamanhos, adicionais)
- Mesas, garçom, PDV, delivery
- Usuários da própria equipe (caixa, garçom, cozinha, entregador)
- Configurações da empresa: dados fiscais, taxas de entrega, formas de
  pagamento, impressão, WhatsApp

Ele **não vê e não pode acessar** nada de nenhuma outra empresa da
plataforma, e não tem acesso ao painel `/superadmin`.

## Conectando WhatsApp da nova empresa

Cada empresa conecta seu **próprio número** Meta WhatsApp Business Cloud
API pelo painel dela: Admin → Configurações → WhatsApp. O webhook da
plataforma é único (`/api/whatsapp/webhook`) — ele identifica
automaticamente qual empresa é dona de cada mensagem recebida pelo
`phone_number_id`. Sem configuração, o atendimento roda em modo
simulação (painel `/admin/atendimento`).

## Conectando a impressora térmica da nova empresa

Em Admin → Configurações → Impressão, gere/defina um **token único**
para essa empresa e instale o agente local
(`scripts/agente-impressao/`) no computador ligado à impressora,
usando esse token. Uma empresa nunca recebe impressão de outra, mesmo
que o agente esteja rodando na mesma rede/servidor.

## Bloquear, suspender ou encerrar uma empresa depois

Volte em `/superadmin` → aba Empresas → selecione o novo status no
menu ao lado da empresa:

- **Bloqueada** / **Suspensa** — login da empresa passa a ser recusado
  imediatamente (mensagem própria explicando o motivo); nada é apagado.
- **Excluída** — soft-delete: os dados continuam no banco (para
  auditoria/recuperação), mas o login é bloqueado como acima. Não existe
  exclusão física pelo painel — é proposital, para evitar perda
  acidental.
