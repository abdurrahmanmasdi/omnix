import sys

path = 'test/media-consent.e2e-spec.ts'
with open(path, 'r') as f:
    content = f.read()

# Add Client to imports
content = content.replace("import { PrismaService } from '../src/prisma/prisma.service';", "import { PrismaService } from '../src/prisma/prisma.service';\nimport { Client } from 'pg';\nimport { resolve } from 'path';")

# Fix setup
setup_target = """  beforeAll(async () => {
    dbName = `omnidesk_s10_${randomUUID().replace(/-/g, '_')}`;
    originalDatabaseUrl =
      process.env.DATABASE_URL ||
      'postgresql://postgres:synthetic-test-only@127.0.0.1:5433/sales_agent';
    const baseUrl = originalDatabaseUrl.substring(
      0,
      originalDatabaseUrl.lastIndexOf('/'),
    );
    process.env.DATABASE_URL = `${baseUrl}/${dbName}`;

    execSync(`createdb -h 127.0.0.1 -p 5433 -U postgres ${dbName}`, {
      env: { PGPASSWORD: 'synthetic-test-only' },
    });

    safeDeploy(process.cwd());"""

setup_new = """  let admin: Client;
  const root = resolve(__dirname, '..');
  
  beforeAll(async () => {
    const adminUrl = process.env.UPGRADE_TEST_ADMIN_URL;
    if (!adminUrl || new URL(adminUrl).hostname !== '127.0.0.1')
      throw new Error('ISOLATED_TEST_DATABASE_REQUIRED');
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    dbName = `omnidesk_s10_${randomUUID().replace(/-/g, '')}`;
    await admin.query(`CREATE DATABASE "${dbName}"`);
    const url = new URL(adminUrl);
    url.pathname = `/${dbName}`;
    process.env.DATABASE_URL = url.toString();
    
    await safeDeploy(root);"""

content = content.replace(setup_target, setup_new)

teardown_target = """  afterAll(async () => {
    await app.close();
    process.env.DATABASE_URL = originalDatabaseUrl;
    execSync(`dropdb -h 127.0.0.1 -p 5433 -U postgres ${dbName}`, {
      env: { PGPASSWORD: 'synthetic-test-only' },
    });
  });"""

teardown_new = """  afterAll(async () => {
    if (app) await app.close();
    if (admin) {
      await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
      await admin.end();
    }
  });"""

content = content.replace(teardown_target, teardown_new)

with open(path, 'w') as f:
    f.write(content)
