# Como rodar o PedidoFlow no seu computador

Guia direto — só os comandos que você precisa, na ordem certa.

## Pré-requisitos

- Node.js 18.17+ instalado.
- PostgreSQL rodando (local, Docker, ou um serviço como Neon/Supabase).
  Se não tiver Postgres instalado, o jeito mais rápido é Docker:
  ```bash
  docker run --name pedidoflow-db -e POSTGRES_PASSWORD=pedidoflow -e POSTGRES_DB=pedidoflow -p 5432:5432 -d postgres:16
  ```

## 1. Instalar dependências

```bash
cd chatflow
npm install
```

## 2. Configurar o `.env`

```bash
cp .env.example .env
```

Abra o `.env` e preencha pelo menos estas duas linhas (as outras podem
ficar em branco por enquanto — WhatsApp, NFC-e e impressora não são
necessários para o teste local):

```
DATABASE_URL="postgresql://postgres:pedidoflow@localhost:5432/pedidoflow"
SECRETS_MASTER_KEY="outro-texto-aleatorio-com-pelo-menos-32-caracteres"
```

(Se você rodou o Docker do passo anterior com os valores do exemplo, a
`DATABASE_URL` acima já funciona sem mudar nada.)

## 3. Criar as tabelas do banco (migration)

```bash
npx prisma generate
npx prisma migrate dev --name init
```

Isso vai perguntar o nome da migration — pode aceitar o padrão ou usar
`init` mesmo. Ele cria as tabelas da plataforma (empresas, planos,
usuários) no schema `public`.

## 4. Popular com dados de teste (seed)

```bash
npm run db:seed
```

Isso cria: os 3 planos comerciais, o Super Admin, a empresa **Disk
Pizza Rozeno** com o schema dela provisionado, os funcionários de
teste, o cardápio, mesas, clientes, estoque, pedidos e caixa dos
últimos dias.

## 5. Rodar a validação (recomendado antes de abrir no navegador)

```bash
npx tsc --noEmit
npm run lint
npm run test
npm run build
```

Se algum desses comandos der erro, me mande a saída completa que eu
corrijo antes de você continuar.

## 6. Iniciar o sistema

```bash
npm run dev
```

Abra `http://localhost:3000` no navegador.

---

## Testando os 4 perfis + Super Admin

### Super Admin (dono da plataforma)

- URL: `http://localhost:3000/superadmin/login`
- E-mail: `superadmin@pedidoflow.com.br`
- Senha: gerada aleatoriamente pelo seed — veja no console ao rodar `npm run db:seed`

Lá você vê a empresa Disk Pizza Rozeno cadastrada, pode ativar/
bloquear/suspender, trocar plano/módulos, e ver a aba "Saúde".

### PDV / Caixa (Administrador ou Caixa)

- URL: `http://localhost:3000/login`
- Etapa 1 (e-mail) → aparece "Bem-vindo, Disk Pizza Rozeno" → etapa 2 (senha)
- Login de Administrador (acesso total): `admin@rozeno.com.br` / senha impressa no console ao rodar o seed (mesma pra todos os usuários demo)
- Login de Caixa (só PDV/salão/retirada/pagamentos/caixa): `caixa@rozeno.com.br` / senha impressa no console ao rodar o seed (mesma pra todos os usuários demo)
- Depois de entrar, vá em **PDV** no menu — testa Balcão, Salão (mesas),
  Retirada e Caixa (abrir caixa antes de vender em dinheiro).

### Garçom

- Mesmo `http://localhost:3000/login`
- E-mail: `garcom@rozeno.com.br` / Senha: impressa no console ao rodar o seed
- Abre mesa, lança pedido, envia para a cozinha.
- **Teste de sincronização**: abra o PDV (Salão) em outra aba/dispositivo
  ao mesmo tempo — quando o Garçom abrir/atualizar uma mesa, o PDV deve
  atualizar sozinho, sem precisar apertar F5.

### Entregador

- Mesmo `http://localhost:3000/login`
- E-mails: `samuel@rozeno.com.br`, `ari@rozeno.com.br` ou `marlon@rozeno.com.br` / Senha: impressa no console ao rodar o seed
- Em **Minha rota**, veja as entregas atribuídas.
- Em **Escanear**, use a câmera do celular (ou digite o número do
  pedido) para confirmar uma entrega — o QR real agora é gerado no PDV,
  na tela de Delivery, ao lado do status de cada pedido em rota.
- **Teste de concorrência**: abra a mesma conta de entregador em dois
  aparelhos (ou duas abas) e tente "pegar" a mesma entrega nos dois ao
  mesmo tempo pelo PDV — só um deve conseguir; o outro recebe aviso de
  que já foi atribuída, e a lista atualiza sozinha nos dois.

### Cozinha (KDS)

- E-mail: `cozinha@rozeno.com.br` / Senha: impressa no console ao rodar o seed

---

## O que foi corrigido nesta etapa (resumo técnico)

- Removidos dados fictícios que apareciam como se fossem reais em Salão
  (PDV) e Garçom (mesas/comandas inventadas antes da resposta real do
  servidor) — agora começam vazios e só mostram o que vier do banco.
- Removida rota fictícia ("ROTA_DO_DIA") que aparecia na Home do
  Entregador quando ele não tinha nenhuma entrega real — agora mostra
  o estado vazio de verdade.
- Corrigido nome de garçom fixo ("Marcos") que sobrescrevia o usuário
  realmente logado ao abrir uma mesa.
- Todo erro de carregamento de tela agora aparece como aviso (toast) —
  nenhuma tela mostra mais dado de exemplo sem avisar que a busca real
  falhou.
- Conectada a sincronização em tempo real (que já existia no backend)
  nas telas de Salão, Garçom, Caixa, Delivery e Entregador — mudanças
  em um aparelho agora refletem nos outros automaticamente.
- QR Code real (biblioteca `qrcode`, sem serviço externo) adicionado na
  tela de Delivery do PDV para o entregador escanear e confirmar a
  entrega; removido o QR "ilustrativo" (padrão visual falso) que existia
  na tela de cobrança do entregador, substituído por um QR real e pelo
  botão de confirmação de pagamento conectado à API de verdade.

## Pendências que continuam FORA do escopo desta etapa (como combinado)

- WhatsApp oficial (Meta) — infraestrutura pronta, credenciais não
  configuradas.
- NFC-e — infraestrutura pronta, credenciais fiscais não configuradas.
- Impressoras térmicas Elgin i8/i9 — fila de impressão funciona; a
  configuração do agente local/driver físico não foi mexida.

## Se algo der erro ao rodar os comandos da seção 5

Copie a mensagem de erro completa e me mande — corrijo antes de você
seguir para produção ou testes manuais mais extensos.
