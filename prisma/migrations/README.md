# Migrations

Histórico de migrations do PedidoFlow, PostgreSQL.

## Baseline

`20260804200000_init` é a migration BASELINE — cria todas as tabelas,
índices e chaves estrangeiras do estado inicial do schema. Antes dela
existir, todas as migrations eram incrementais (`ALTER TABLE`) e
presumiam tabelas já criadas — rodar `npx prisma migrate deploy` num
Postgres vazio falhava na primeira migration com "relation does not
exist". Corrigido: `20260804200000_init` roda primeiro (timestamp
anterior a todas as outras) e cria a base completa; cada migration
incremental depois dela aplica sua própria mudança em cima, exatamente
como já fazia.

## Rodar do zero (Postgres/Supabase vazio)

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
```

Isso aplica as 12 migrations em ordem (baseline + 11 incrementais) e
deixa o banco no estado exato do `schema.prisma` atual. Depois, se
quiser dados de demonstração:

```bash
npm run db:seed
```

## Se você já tem dados reais em produção (SQLite)

Depois de aplicar as migrations acima em um Postgres de HOMOLOGAÇÃO, rode:

```bash
DATABASE_URL="postgresql://.../homolog" \
SQLITE_ORIGEM="./prisma/dev.db" \
npm run db:migrar-postgres
```

Ver `scripts/migrar-sqlite-para-postgres.ts` para detalhes — o script
nunca altera o `dev.db` original (só lê).
