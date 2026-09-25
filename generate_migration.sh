#!/bin/bash
docker rm -f temp_shadow_pg 2>/dev/null || true
docker run -d --name temp_shadow_pg -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=sales_agent_shadow -p 5435:5432 ankane/pgvector:latest
sleep 5
export SHADOW_DATABASE_URL="postgresql://postgres:password@localhost:5435/sales_agent_shadow?schema=public"

cat << 'INNER_EOF' > prisma.config.ts
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
    shadowDatabaseUrl: process.env['SHADOW_DATABASE_URL'],
  },
});
INNER_EOF

TS=$(date +%Y%m%d%H%M%S)
mkdir -p prisma/migrations/${TS}_add_missing_models
npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script > prisma/migrations/${TS}_add_missing_models/migration.sql

# Restore prisma.config.ts
cat << 'RESTORE_EOF' > prisma.config.ts
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
RESTORE_EOF

docker rm -f temp_shadow_pg
