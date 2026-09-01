#!/bin/bash
# Resolve failed Prisma migrations before deploy
echo "=== Resolving failed migrations ==="
npx prisma migrate resolve --rolled-back "20260825190000_sabor_fotoUrl" 2>&1
RESOLVE_EXIT=$?
echo "Resolve exit code: $RESOLVE_EXIT"

echo "=== Running prisma migrate deploy ==="
npx prisma migrate deploy 2>&1
DEPLOY_EXIT=$?
echo "Deploy exit code: $DEPLOY_EXIT"

if [ $DEPLOY_EXIT -ne 0 ]; then
  echo "=== Deploy failed, trying to mark migration as applied ==="
  npx prisma migrate resolve --applied "20260825190000_sabor_fotoUrl" 2>&1
  echo "=== Retrying deploy ==="
  npx prisma migrate deploy 2>&1
fi

echo "=== Running post-migration scripts ==="
npx tsx scripts/sincronizar-schemas-tenants.ts 2>&1
npx tsx scripts/backfill-etapa1.ts 2>&1
npx tsx scripts/setup-config-pizza.ts 2>&1
echo "=== Done ==="
