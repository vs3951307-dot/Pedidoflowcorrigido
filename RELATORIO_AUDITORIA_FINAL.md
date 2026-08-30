# PedidoFlow — Relatório final da auditoria (itens 1 a 8)

Ambiente de validação: PostgreSQL 16.13 real (não mock, não SQLite),
Node 22.22, Next 14.2, Prisma 5.22. Banco de teste recriado do zero
(`DROP DATABASE` → `migrate deploy` → `db seed`) antes da rodada final.

---

## 1. Resumo — itens 1 a 8

| # | Item | Status |
|---|---|---|
| 1 | Idempotência de pedidos completa | **PASS** |
| 2 | Duplicidade de pagamentos corrigida | **PASS** |
| 3 | DEFAULT `''` — validado e corrigido | **PASS** |
| 4 | UNIQUE incremental | **PASS** |
| 5 | Migration fora do build | **PASS** |
| 6 | TypeScript sem erros | **PASS** |
| 7 | Testes de preço de pizza executando de verdade | **PASS** |
| 8 | Testes de isolamento multiempresa/tenant executando | **PASS** |

Nenhum item ficou FAIL ou NÃO EXECUTADO. Nada foi marcado como PASS sem
execução: todos os números abaixo saíram de rodadas reais registradas
nesta sessão.

---

## 2. Resultado do TypeScript

```
$ npx tsc --noEmit
(sem saída)
```

**0 erros.** Baseline antes das correções: **18 erros** — 1 em
`src/app/api/pagamentos/[id]/route.ts` (`id_ne`, operador inexistente no
Prisma; e `atualizadoEm`, campo inexistente em `Pagamento`) e 17 em
`src/app/api/pedidos/route.ts` (acesso a `.itens`, `.pagamentos`,
`.entrega`, `.mesa` num resultado de `findFirst` sem `include`).

Nenhum erro foi silenciado: não há `@ts-ignore`, `@ts-expect-error` nem
`any` novo em nenhum arquivo criado ou alterado (verificado por varredura).

---

## 3. Resultado dos testes

### Contagem exata

| Suíte | Total | Aprovados | Falhados | Pulados |
|---|---|---|---|---|
| `vitest run` (node) | **131** | **131** | **0** | **0** |
| `vitest run -c vitest.dom.config.ts` (DOM) | **8** | **8** | **0** | **0** |
| **Somado** | **139** | **139** | **0** | **0** |

### Por arquivo (suíte node)

| Arquivo | Testes |
|---|---|
| `src/lib/preco-pizza.test.ts` | 25 |
| `src/lib/__tests__/isolamento-tenant.test.ts` | 19 |
| `src/lib/copiloto/__tests__/copiloto.test.ts` | 18 |
| `src/lib/__tests__/tenant-provisionamento.test.ts` | 15 |
| `src/lib/pagamentos/__tests__/pagamentos-concorrentes.test.ts` | 13 |
| `src/lib/__tests__/isolamento-multiempresa.test.ts` | 12 |
| `src/lib/cardapio/analisar-texto.test.ts` | 11 |
| `src/lib/pedidos/__tests__/criar-pedido.test.ts` | 10 |
| `src/lib/precificacao.test.ts` | 8 |

### Antes × depois

| | Antes | Depois |
|---|---|---|
| Total | 65 | 131 |
| Aprovados | 49 | 131 |
| Falhados | 0 (mas 1 arquivo inteiro quebrado) | 0 |
| **Pulados** | **16** | **0** |

Os 16 "pulados" eram a suíte inteira de preço de pizza. Ela não estava
sendo pulada de propósito: o `beforeAll` morria com `database
"pedidoflow" does not exist` e o Vitest reporta os testes de um
`beforeAll` quebrado como *skipped*. Na prática, **nenhuma regra de preço
de pizza estava sendo verificada**, e o resultado parecia verde.

---

## 4. Itens 1 a 8 — o que foi corrigido

### Item 1 — Idempotência de pedidos → PASS

**Defeito encontrado (a implementação anterior não funcionava de forma
alguma):**

1. A chave era gravada em `Pedido.observacao` — campo que, três linhas
   depois, era sobrescrito por `observacao: corpo.observacao`. A chave
   **nunca chegava a ser persistida**, então nenhum retry era detectado.
2. A busca era `findFirst` sem nenhuma constraint no banco: duas
   requisições simultâneas liam "não existe" ao mesmo tempo e criavam
   **dois pedidos**.
3. A chave não era validada (qualquer string servia).
4. O caminho de resposta gerava 17 dos 18 erros de TypeScript.

**Correção:**

- Coluna própria `Pedido.idempotencyKey` + índice **único
  `(empresaId, idempotencyKey)`** (migration nova). A garantia é do
  banco, não do código.
- Validação **UUID v4** obrigatória quando a chave é enviada; chave
  malformada é recusada com 400 em vez de ignorada em silêncio (ignorar
  faria o cliente pensar que está protegido sem estar).
- Corrida: quem perde recebe **P2002**, relê o pedido vencedor e devolve
  a mesma resposta com status 200 (`idempotente: true`), sem repetir os
  efeitos colaterais (não reimprime a comanda já enviada à cozinha).
- Regra extraída para `src/lib/pedidos/criar-pedido.ts` — função sem HTTP,
  a MESMA que a rota usa, exercitada direto pelos testes.
- **Frontend agora envia a chave** nos 3 pontos que criam pedido:
  `use-cobranca.ts` (PDV/balcão), `delivery-view.tsx` (delivery "pagar na
  entrega") e `garcom-context.tsx` (salão). Chave por tentativa, mantida
  durante o retry e liberada no sucesso.

### Item 2 — Duplicidade de pagamentos → PASS

**Defeito encontrado** (`src/app/api/pagamentos/[id]/route.ts`):

```ts
prisma.pagamento.findFirst({ where: {
  empresaId, id_ne: paramsId, status: "confirmado",
  atualizadoEm: { gte: new Date(Date.now() - 5_000) },
}})
```

Três problemas, todos graves:

1. O critério **não envolvia o pagamento sendo confirmado** — era
   "qualquer outro pagamento da empresa". O pagamento do cliente da mesa
   3 derrubava o pagamento **legítimo** do cliente da mesa 7, e a entrega
   de um entregador derrubava a de outro, só por caírem no mesmo
   intervalo de 5 segundos.
2. Janela de tempo **não é exclusão mútua**: duas confirmações do mesmo
   pagamento de fato simultâneas não se enxergam (nenhuma commitou) e
   passam as duas — não resolvia nem o caso que dizia resolver.
3. `atualizadoEm` não existe em `Pagamento` e `id_ne` não existe no
   Prisma — prova de que aquele caminho nunca tinha rodado.

**Correção:**

- Função **removida por inteiro**. Não sobrou nenhuma regra baseada em
  janela de tempo em lugar nenhum do código.
- No lugar: **UPDATE condicional atômico** sobre *este* pagamento
  (`updateMany` com `status: { not: "confirmado" }`). O Postgres serializa
  os UPDATEs na mesma linha; o segundo casa com 0 linhas → 409. Nenhum
  outro pagamento participa da decisão.
- Unicidade de `Pagamento.idempotencyKey` passou de **global** para
  **`(empresaId, idempotencyKey)`** — uma chave de um tenant não pode
  mais causar P2002 no outro, e o lookup passou a filtrar `empresaId`
  (o `findUnique({ idempotencyKey })` antigo podia devolver o registro de
  outro tenant).
- Regras extraídas para `src/lib/pagamentos/registrar-pagamento.ts` e
  `src/lib/pagamentos/confirmar-pagamento-entrega.ts`, com **13 testes de
  concorrência**.

### Item 3 — DEFAULT `''` → PASS

**Defeito encontrado:** `defaultSqlDoCampo` terminava com um "fallback
seguro por tipo" que devolvia `''` para TEXT, `0` para números, `false`
para booleanos e `now()` para datas sempre que o campo **não** declarava
`@default`. Toda coluna obrigatória nova de texto (um CNPJ, um código
fiscal, um endereço) nascia em **todas as empresas existentes** com
`DEFAULT ''` — string vazia gravada como se fosse valor legítimo,
indistinguível de um dado real preenchido errado. E o default ficava
colado na tabela: todo INSERT posterior que omitisse a coluna também
gravava `''`.

**Correção:**

- `defaultSqlDoCampo` **só devolve default declarado no `schema.prisma`**.
  Nunca inventa nenhum, para nenhum tipo.
- Coluna obrigatória sem `@default`:
  - tabela **vazia** → entra `NOT NULL` de verdade;
  - tabela **com linhas** → entra NULLABLE, **sem valor inventado**, e
    vira **pendência** com SQL de diagnóstico + reparo (`UPDATE ... SET
    <VALOR>` e depois `SET NOT NULL`).
- **Detecção de default herdado:** `DEFAULT ''` presente no PostgreSQL
  **sem respaldo no schema.prisma** é reportado como pendência com
  `DROP DEFAULT` pronto — e **não** é removido automaticamente (pode
  haver código legado inserindo sem a coluna).
- `@default("")` **declarado** no schema (`Produto.ncm`, `Produto.cest` —
  campos fiscais opcionais, decisão do time) sai como **aviso**
  informativo, não como pendência.
- Divergência entre o default do banco e o do schema também vira
  pendência (não é sobrescrita sozinha).

### Item 4 — UNIQUE incremental → PASS

**Defeito encontrado:** a sincronização **não fazia nada** com chaves
únicas. Elas só existiam se a tabela tivesse sido criada do zero já com
elas. Toda empresa provisionada **antes** de um `@unique`/`@@unique` novo
ficava para sempre sem a constraint física, e o único sinal disso era um
`.catch(() => null)` silencioso.

**Correção:**

- Comparação real **schema.prisma × PostgreSQL**: o conjunto desejado
  (campo `@unique` + `@@unique([...])`) contra os índices únicos reais
  lidos de `pg_index`. Índices **parciais** são tratados à parte (um
  único parcial não satisfaz um `@unique` global).
- Antes de criar, **verifica duplicatas** com `GROUP BY ... HAVING
  count(*) > 1`, excluindo linhas com NULL (no Postgres, NULLs são
  distintos num índice único — incluí-las seria falso positivo).
- Se houver duplicata: **o índice NÃO é criado**, nenhuma linha é
  apagada ou alterada, e sai uma pendência com o SQL que lista os grupos
  repetidos e o `CREATE UNIQUE INDEX` para depois.
- Mesma regra para o índice **parcial** "um caixa aberto por empresa".
- Bônus: FKs que falham (linhas órfãs) deixaram de ser engolidas pelo
  `.catch(() => null)` e viram pendência com o SQL que lista as órfãs.
- Pendências são impressas no fim de `db:sync-tenants` e gravadas em
  `pendencias-tenants.json`. Com `--strict`, o comando sai com código 2.

### Item 5 — Migration fora do build → PASS

**Antes:**
```
"build": "... prisma generate && prisma migrate deploy && tsx scripts/sincronizar-schemas-tenants.ts && tsx scripts/setup-config-pizza.ts && next build"
```
Qualquer build — inclusive de CI ou de teste — aplicava DDL e **escrevia
dados** no banco de produção.

**Depois:**
```
"build":         "... prisma generate && next build"
"deploy:migrar": "prisma migrate deploy && tsx scripts/sincronizar-schemas-tenants.ts && tsx scripts/backfill-etapa1.ts && tsx scripts/setup-config-pizza.ts"
```

Ordem segura documentada em `DEPLOY.md` (§4), `DEPLOY.sh` e
`README-DEPLOY.md`. Ver §7 deste relatório.

### Item 6 — TypeScript → PASS

18 → 0 erros. Ver §2.

### Item 7 — Testes de preço de pizza → PASS

Ver §5.3.

### Item 8 — Isolamento multiempresa/tenant → PASS

Ver §5.4.

---

## 5. Provas específicas

### 5.1 Prova da idempotência de pedidos

`src/lib/pedidos/__tests__/criar-pedido.test.ts` — 10 testes, PostgreSQL
real, chamando a mesma `criarPedido` que a rota usa.

O teste central dispara duas chamadas **sem `await` entre elas** (as
transações de fato se sobrepõem no banco) e depois **conta as linhas**:

```ts
const [r1, r2] = await Promise.all([
  criarPedido(empresaA.id, usuario, { ...itens, idempotencyKey: chave }),
  criarPedido(empresaA.id, usuario, { ...itens, idempotencyKey: chave }),
]);

expect(r1.pedido.id).toBe(r2.pedido.id);                    // mesma resposta
expect(criacoes).toHaveLength(1);                           // exatamente 1 criou (201)
expect(replays).toHaveLength(1);                            // exatamente 1 reconheceu retry (200)
expect(await dbA.pedido.count({ where: { idempotencyKey: chave } })).toBe(1);  // 1 LINHA NO BANCO
expect(await dbA.itemPedido.count({ where: { pedidoId: r1.pedido.id } })).toBe(1);
```

Provas cobertas:

- **2 requisições simultâneas, mesma chave → 1 pedido** (asserção direta
  de `count() === 1`);
- **5 requisições simultâneas, mesma chave → 1 pedido**;
- retry sequencial devolve o mesmo pedido, sem criar outro;
- a chave fica em coluna própria e **não contamina `observacao`** (o
  defeito original: `observacao` continua sendo "Sem cebola, por favor" e
  `idempotencyKey` guarda a chave);
- chaves diferentes criam pedidos diferentes (dois pedidos legítimos
  iguais não se anulam);
- pedido sem chave continua funcionando, e dois pedidos sem chave
  convivem (NULLs distintos no índice único);
- chave não-UUID v4 é recusada com 400;
- a mesma chave em duas empresas cria dois pedidos independentes, um em
  cada schema.

### 5.2 Prova de que pagamentos legítimos simultâneos não são bloqueados

`src/lib/pagamentos/__tests__/pagamentos-concorrentes.test.ts` — 13
testes. As asserções de "não bloquear" imprimem o motivo da recusa se
falharem, para não haver dúvida sobre a causa:

```ts
const recusados = resultados.filter((r) => !r.ok);
expect(
  recusados.map((r) => `${r.status}: ${r.erro}`),
  "nenhum pagamento legítimo pode ser recusado"
).toEqual([]);
```

Cenários que **passam** (não podem ser bloqueados):

- **dois pedidos diferentes pagos no mesmo instante** → os dois
  registrados (era exatamente o caso que a janela de 5s quebrava);
- **dez pagamentos legítimos simultâneos, de dez pedidos diferentes** →
  os dez passam;
- **conta dividida**: duas parcelas do **mesmo valor e mesma forma**, no
  mesmo instante, no mesmo pedido → **duas** linhas distintas, soma bate
  o total, exatamente uma delas fecha a conta;
- **empresas diferentes com a MESMA chave** → as duas passam, nenhuma vê
  a outra;
- **duas confirmações de entrega de pedidos diferentes** no mesmo
  instante → as duas passam.

Cenários que **falham** (têm de ser bloqueados):

- mesma chave, duas requisições simultâneas → **1 pagamento só**, valor
  cobrado uma vez;
- retry sequencial da mesma chave → devolve o original;
- dupla confirmação simultânea do **mesmo** pagamento de entrega → uma
  passa, a outra recebe 409 `ALREADY_APPLIED`, e a **movimentação de
  caixa é criada exatamente 1 vez** (`expect(movimentacoes).toBe(1)` — era
  o efeito colateral que inflava o fechamento do dia);
- conta já quitada → 409, sem criar registro;
- valor acima do saldo → 400, sem criar registro;
- 4 parcelas simultâneas nunca somam mais que o total da conta (prova do
  `SELECT ... FOR UPDATE`).

### 5.3 Prova dos cálculos de preço das pizzas

`src/lib/preco-pizza.test.ts` — **25 testes, todos executando**
(antes: 16 pulados). Os preços vêm do banco
(`tenant_disk_pizza_rozeno.PrecoTamanho`), nunca de constantes no arquivo.

**Por que não rodavam:** a conexão era montada por um parser de string no
formato `key=valor;key=valor` (estilo ADO.NET) aplicado a uma URL
`postgresql://usuario:senha@host:porta/banco`. Nenhum regex casava, tudo
caía nos defaults embutidos, e o `beforeAll` morria com `database
"pedidoflow" does not exist`. Agora usa a `DATABASE_URL` real e, se o
banco não estiver disponível, a suíte **falha com a razão explícita** —
nunca vira skip.

**Bug real que o skip escondia:** ao fazer os testes rodarem, **5
falharam**. `Tamanho.maxSabores` era criado pela migration com `DEFAULT 1`
e **nunca preenchido** — nem pelo seed, nem por nada no fluxo de deploy.
Em qualquer ambiente novo, **todo** tamanho ficava com limite de 1 sabor
e `calcularPrecoItem` recusava qualquer pizza com 2+ sabores com "Este
tamanho aceita no máximo 1 sabore(s)". Ou seja: **meia a meia, 2 sabores
e 3 sabores eram impossíveis de vender**. O valor correto só existia em
`scripts/backfill-etapa1.ts`, que não fazia parte de nenhum fluxo
automático. Corrigido no seed (nasce certo) e o backfill entrou no
`deploy:migrar` (corrige ambientes existentes).

Regras verificadas (valores conferidos contra o banco):

| Caso | Esperado | Regra |
|---|---|---|
| Média / 4 Queijos | 46,00 | 1 sabor tradicional |
| Média / 4 Queijos + Calabresa | 46,00 | **meia a meia**, 2 tradicionais → sem acréscimo |
| Média / 4 Queijos + Doritos | 52,00 | maior preço, 1 premium → sem acréscimo |
| Média / Doritos + Tomate Seco | 62,00 | **2 premium → +R$ 10** |
| Média / Banoffe | 52,00 | doce sozinho |
| Média / Banoffe + Prestígio | 62,00 | 2 doces (premium) → +R$ 10 |
| Grande / 4 Queijos + Calabresa | 56,00 | meia a meia no Grande |
| Grande / Doritos + Tomate Seco | 72,00 | 62 + 10 |
| Família / 3 tradicionais | 66,00 | **3 sabores**, sem acréscimo |
| Família / 2 especiais + 1 tradicional | 82,00 | 72 + 10 |
| Família / 3 especiais | 92,00 | **3 premium → 2 × R$ 10** |
| Média / 4 Queijos + adicional R$ 6 | 52,00 | adicionais somam |
| Média / Doritos+Tomate Seco × 3 | unit. 62 / total 186 | quantidade multiplica |

Mais: `maxSabores` lido do banco é **Média 2, Grande 2, Família 3**
(asserção direta, para a regressão não voltar); o **maior** preço entre os
sabores é cobrado independentemente da ordem de escolha; 3 sabores num
tamanho de 2 é recusado (com asserção de que o limite é 2, não 1);
mistura doce+salgada é recusada quando a empresa não permite, e 3 doces
puros são aceitos.

### 5.4 Prova do isolamento entre tenants

Duas suítes, 31 testes no total.

`src/lib/__tests__/isolamento-tenant.test.ts` (**19 testes**, novo) valida
o isolamento **estrutural** — a arquitetura real do PedidoFlow, onde cada
empresa tem um **schema PostgreSQL próprio**. A suíte que já existia
(`isolamento-multiempresa.test.ts`, 12 testes) valida o isolamento
**lógico** (filtro por `empresaId`) e foi mantida.

Fundação verificada primeiro: os dois schemas existem, a tabela `Pedido`
existe **separadamente em cada um** (não é tabela compartilhada), e o
contexto de tenant resolve para o schema certo com clients distintos.

**VISUALIZAR** — nunca ver dado da outra:
- o **pedido** de B não existe no schema de A, nem buscando por id;
- uma listagem **sem nenhum filtro** no schema de A não traz nada de B
  (se houvesse vazamento estrutural, apareceria aí);
- o **pagamento** de B não existe no schema de A;
- `cliente`, `produto`, `caixa`, `mesa`, `categoria` e `entrega` do
  schema de A não contêm nenhuma linha de outra empresa;
- buscar um pedido de B pelo caminho de negócio de A devolve **404**.

**ALTERAR** — nunca modificar dado da outra:
- A não altera o pedido de B (`updateMany` → `count === 0`, valores
  intactos);
- A não exclui o pedido de B;
- A não confirma o pagamento de entrega de B (404; o pagamento de B
  continua `pendente`);
- A não vende produto de B (400 "Produto inexistente");
- A não vincula cliente de B (400 "Cliente inexistente");
- pedido criado sob o contexto de A é gravado **no schema de A** e não
  existe no de B (verificado com SQL cru nos dois schemas).

**REUTILIZAR** — identificador de uma não vale na outra:
- a mesma `idempotencyKey` nas duas empresas gera dois pedidos
  independentes, nenhum tratado como retry do outro;
- o **número** de pedido é sequencial **por empresa**, com contadores
  independentes;
- duas empresas podem ter pedidos com o **mesmo número** sem conflito.

**Guarda do proxy:** acessar um model de tenant **sem contexto ativo**
lança erro (`prisma.pedido`, `prisma.pagamento`, `prisma.cliente`) — uma
rota nova que esquecesse `autorizar()` falha alto em vez de ler/gravar em
silêncio no schema errado. Dentro do contexto de A, o mesmo acesso
funciona e devolve só dados de A.

---

## 6. Bugs adicionais encontrados e corrigidos

Além dos 8 itens, estes apareceram durante a auditoria e foram corrigidos:

1. **`Tamanho.maxSabores` nunca preenchido** → meia a meia / 2 sabores /
   3 sabores impossíveis de vender em qualquer ambiente novo. (Detalhes
   em §5.3.) Corrigido no seed + backfill no `deploy:migrar`.

2. **Contador de pedidos colidia com pedidos existentes → HTTP 500 no
   PDV.** `proximoNumeroPedido` criava a linha do contador começando fixo
   em 1001 e depois só somava 1. Sempre que existiam pedidos que não
   passaram por essa função — **tenant migrado de outro sistema**,
   restauração de backup, ou o próprio seed (155 pedidos com número
   explícito) — o contador ficava atrás do maior número já usado e o
   **próximo pedido real falhava** com `Unique constraint failed on
   (empresaId, numero)`. Reproduzido em teste: o seed sincronizava o
   contador **antes** de criar o último pedido (o do WhatsApp), deixando-o
   exatamente um número atrás. Corrigido com `INSERT ... ON CONFLICT DO
   UPDATE SET ultimoNumero = GREATEST(ultimoNumero + 1, MAX(numero) + 1)`
   — atômico, numa única ida ao banco, e **auto-corretivo**: um contador
   atrasado se conserta sozinho na primeira chamada, sem nunca
   reaproveitar número. O seed também passou a sincronizar por último.

3. **`array_agg(a.attname)` devolve `name[]`, que o driver `pg` não
   converte para array JS.** Chegava como a string `"{empresaId,email}"`,
   a comparação com o Prisma nunca casava e **todo índice único era
   considerado inexistente** — recriado a cada sincronização e reportado
   como novo. Corrigido com `::text`.

4. **`CREATE TABLE` do provisionamento ignorava `@default(...)` por
   completo.** Um schema de tenant recém-provisionado saía **sem nenhum
   default**, divergindo do schema `public` (onde as migrations os
   criam). Não aparecia no uso normal porque o Prisma Client sempre manda
   o valor, mas qualquer INSERT que omitisse a coluna (SQL manual,
   importação, script de correção) batia em not-null. Corrigido — usando
   só defaults **declarados**, nunca inventados.

5. **FKs falhando em silêncio.** `.catch(() => null)` engolia qualquer
   erro ao adicionar chave estrangeira, inclusive o caso que mais importa
   (linhas órfãs). Agora a existência é checada em `pg_constraint` e a
   falha real vira pendência com o SQL que lista as órfãs.

6. **Vazamento potencial entre tenants na idempotência de pagamento.**
   `tx.pagamento.findUnique({ where: { idempotencyKey } })` não filtrava
   `empresaId`. Corrigido com unique composto + filtro por empresa.

---

## 7. Instrução exata de deploy

```bash
# 0) BACKUP do banco de produção. Este é o único passo irreversível se der errado.
pg_dump "$DATABASE_URL" > backup-antes-do-deploy.sql

# 1) BUILD — só compila. NÃO toca no banco.
#    Pode rodar em CI, sem acesso à rede do banco.
npm ci
npm run build

# 2) MIGRATION — passo EXPLÍCITO, com a aplicação ANTIGA ainda no ar.
npm run deploy:migrar

#    Leia a saída até o fim. Se aparecer "PENDÊNCIA(S)":
#      - o detalhe também fica em pendencias-tenants.json;
#      - rode o SQL de DIAGNÓSTICO (só leitura) para ver as linhas;
#      - corrija os dados, rode `npm run db:sync-tenants` de novo;
#      - só siga para o passo 3 quando não houver pendência.
#    Em pipeline automatizado: `npm run db:sync-tenants -- --strict`
#    sai com código 2 se houver pendência.

# 3) APLICAÇÃO — só depois da migration terminar limpa.
npm run start   # ou PM2 / systemd / Docker
```

**Por que migration antes da aplicação:** as migrations deste projeto são
aditivas (colunas e índices novos, nada removido), então a aplicação
**antiga** continua funcionando com o schema **novo** durante a janela
entre os passos 2 e 3. O contrário não vale: subir a aplicação nova
contra o schema antigo quebra na hora.

**Rollback:** como o build não toca no banco e as migrations são
aditivas, voltar a aplicação para a versão anterior é só reimplantar o
artefato antigo. **Não** desfaça migrations para fazer rollback de
aplicação.

**Continua valendo:** rode como **um único processo Node** (sem PM2
cluster, sem múltiplas réplicas) — o tempo real usa memória de um
processo só.

### Como rodar os testes

As suítes de banco exigem um **PostgreSQL de teste real** e se recusam a
rodar contra um banco que não esteja claramente marcado como de teste
(nome contendo `test`, host local, ou `PEDIDOFLOW_TEST_DB=1`).

```bash
export DATABASE_URL="postgresql://postgres@127.0.0.1:5433/pedidoflow_test?schema=public"
export DIRECT_URL="$DATABASE_URL"

npx prisma migrate deploy
npx prisma db seed      # cria os 2 tenants que as suítes usam

npm run test:all        # typecheck + testes node + testes DOM
```

---

## 8. Migrations criadas / alteradas

**Criada — 1:**

`prisma/migrations/20260815120000_idempotencia_pedido_e_pagamento_por_empresa/migration.sql`

- `ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;`
- `CREATE UNIQUE INDEX IF NOT EXISTS "Pedido_empresaId_idempotencyKey_key" ON "Pedido"("empresaId","idempotencyKey");`
- `CREATE UNIQUE INDEX IF NOT EXISTS "Pagamento_empresaId_idempotencyKey_key" ON "Pagamento"("empresaId","idempotencyKey");`
- `ALTER TABLE "Pagamento" DROP CONSTRAINT IF EXISTS "Pagamento_idempotencyKey_key";`
  e `DROP INDEX IF EXISTS "Pagamento_idempotencyKey_key";`

**Alterada — nenhuma.** Nenhuma migration existente foi editada ou
removida (editar migration já aplicada quebra o histórico do Prisma).

**Não destrutiva:** só adiciona uma coluna nullable e troca dois índices.
O índice novo é criado **antes** de o antigo ser removido, então a janela
sem proteção é zero. Nenhum `DROP TABLE`, `DROP COLUMN`, `DELETE` ou
`TRUNCATE`.

---

## 9. Arquivos principais modificados

**Criados (9):**

| Arquivo | Papel |
|---|---|
| `src/lib/idempotencia.ts` | UUID v4: validação e geração, compartilhado cliente/servidor |
| `src/lib/pedidos/criar-pedido.ts` | Regra de criação de pedido, sem HTTP e testável |
| `src/lib/pagamentos/registrar-pagamento.ts` | Regra de pagamento (conta simples/dividida) |
| `src/lib/pagamentos/confirmar-pagamento-entrega.ts` | Confirmação de pagamento na entrega |
| `src/lib/__tests__/ajuda-banco-de-teste.ts` | Utilitários + trava de segurança do banco de teste |
| `src/lib/pedidos/__tests__/criar-pedido.test.ts` | 10 testes — item 1 |
| `src/lib/pagamentos/__tests__/pagamentos-concorrentes.test.ts` | 13 testes — item 2 |
| `src/lib/__tests__/isolamento-tenant.test.ts` | 19 testes — item 8 |
| `src/lib/__tests__/tenant-provisionamento.test.ts` | 15 testes — itens 3 e 4 |
| `vitest.setup.ts` | Carrega `.env` no processo de teste |

**Alterados (12):**

| Arquivo | Mudança |
|---|---|
| `prisma/schema.prisma` | `Pedido.idempotencyKey` + `@@unique([empresaId, idempotencyKey])`; `Pagamento` de `@unique` global para composto |
| `prisma/seed.ts` | `maxSabores` correto; contador de pedidos sincronizado por último |
| `src/app/api/pedidos/route.ts` | POST virou casca fina sobre `criarPedido` |
| `src/app/api/pedidos/[id]/pagamento/route.ts` | Casca fina sobre `registrarPagamento` |
| `src/app/api/pagamentos/[id]/route.ts` | Janela de 5s **removida**; casca fina sobre `confirmarPagamentoEntrega` |
| `src/lib/tenant-provisionamento.ts` | Itens 3 e 4: defaults, UNIQUE incremental, pendências |
| `src/lib/contador.ts` | Contador atômico e auto-corretivo |
| `src/lib/preco-pizza.test.ts` | Conexão corrigida + 9 testes novos de meia a meia / +R$10 |
| `src/app/pdv/_lib/use-cobranca.ts` | PDV envia a chave do pedido |
| `src/app/pdv/_components/delivery-view.tsx` | Delivery envia a chave |
| `src/app/garcom/_lib/garcom-context.tsx` | Salão envia a chave (por mesa) |
| `scripts/sincronizar-schemas-tenants.ts` | Relatório de pendências + `--strict` |
| `package.json` | Build sem banco; `deploy:migrar`; `typecheck`; `test:all` |
| `vitest.config.ts` | `setupFiles`, execução em série, timeouts para concorrência real |
| `DEPLOY.md`, `DEPLOY.sh`, `README-DEPLOY.md` | Ordem segura de deploy |

**Dependências:** **nenhuma adicionada ou removida.** O `package-lock.json`
só ganhou marcadores `"dev": true` do `npm install`.

---

## 10. Riscos restantes

1. **`Pagamento_idempotencyKey_key` antigo pode sobreviver em schemas de
   tenant já provisionados.** A migration remove o índice global no
   schema `public`; nos schemas de tenant ele foi criado inline pelo
   `CREATE TABLE` e a sincronização **nunca remove** nada (por desenho).
   **Impacto: nenhum na prática** — dentro do schema de um tenant todas as
   linhas de `Pagamento` têm o mesmo `empresaId`, então `UNIQUE(chave)` e
   `UNIQUE(empresaId, chave)` são equivalentes ali. Se quiser limpar,
   rode manualmente por tenant:
   `DROP INDEX IF EXISTS "tenant_x"."Pagamento_idempotencyKey_key";`

2. **Empresas com banco fisicamente dedicado (`databaseUrlSecreta`) não
   são sincronizadas pelo `db:sync-tenants`** — o script as pula e avisa
   no log. Precisam ser sincronizadas manualmente apontando para o banco
   delas. Comportamento pré-existente, mantido de propósito.

3. **Pedidos criados sem `idempotencyKey` continuam aceitos** (coluna
   nullable), para não quebrar clientes antigos e integrações. Esses
   pedidos ficam **sem** a proteção contra duplicação. Os 3 caminhos de
   UI do próprio sistema já enviam a chave; um cliente externo que não
   envie continua exposto a duplo clique. Tornar obrigatório é uma
   decisão de produto (quebraria integrações existentes).

4. **Tempo real depende de processo único.** `src/lib/eventos-tempo-real.ts`
   usa `EventEmitter` em memória; PM2 cluster ou múltiplas réplicas fazem
   eventos SSE não chegarem a todos. Pré-existente, documentado e avisado
   no log por `instrumentation.ts`. Resolver exige pub/sub (Redis ou
   Postgres LISTEN/NOTIFY) — mudança de arquitetura fora do escopo desta
   auditoria.

5. **Credenciais NFC-e ainda são globais por instância** (uma empresa
   emissora real por servidor). Pré-existente, já registrado em
   `DEPLOY.md`. Não foi tocado.

6. **Os testes de concorrência dependem do comportamento do PostgreSQL**
   (bloqueio de INSERT em índice único, `FOR UPDATE`, READ COMMITTED).
   Foram validados no PostgreSQL 16. Não valem para outro banco.

7. **`scripts/setup-config-pizza.ts` escreve no banco** — por isso está no
   `deploy:migrar` e **não** no build. Ele nunca sobrescreve configuração
   existente (create-if-absent), mas é escrita: mantenha-o fora de
   qualquer pipeline de build.

---

## 11. Restrições respeitadas

- Nenhum `skip`, `any`, `@ts-ignore`, `@ts-expect-error` ou mock falso foi
  usado para esconder problema (verificado por varredura no código final).
- Nenhum teste foi removido — a suíte de isolamento que já existia foi
  mantida e uma segunda, mais forte, foi somada.
- Nenhuma alteração destrutiva em banco: a migration só adiciona coluna e
  troca índices; o sincronizador nunca remove tabela, coluna ou linha.
- Nenhum seed ou configuração escreve no banco durante o build —
  comprovado rodando `npm run build` com `DATABASE_URL` inválida
  (terminou com sucesso).
- Funcionalidades existentes preservadas: conta dividida, repasse do
  garçom, repasse do entregador, impressão automática, NFC-e, delivery,
  taxa por bairro e regra de preço de pizza continuam com o mesmo
  comportamento — as regras foram movidas de arquivo, não reescritas.
