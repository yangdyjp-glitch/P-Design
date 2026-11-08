import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { postgresOptions } from '../db/postgres-options.mjs';
import { applyPostgresMigrations } from '../db/migrate-postgres.mjs';
import { importLocalD1 } from '../db/import-local-d1.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
let client;
try {
  client = new pg.Client(postgresOptions(process.env.DATABASE_URL, process.env.DATABASE_CA_CERT));
  client.on('error', () => {});
  await client.connect();
  await client.query('BEGIN');
  const applied = await applyPostgresMigrations(client);
  const dataDirectory = path.resolve(process.env.TUXU_DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(root, '.wrangler/railway'));
  const imported = await importLocalD1(client, path.join(dataDirectory, 'state'));
  await client.query('COMMIT');
  console.log(JSON.stringify({ database: 'postgresql', schema: 'tuxu', migrationsApplied: applied, localImport: imported }));
} catch (error) {
  if (client) await client.query('ROLLBACK').catch(() => {});
  const code = /^[A-Z0-9_]{2,40}$/.test(error.code || '') ? error.code : 'SETUP_FAILED';
  // Avoid connection URLs, passwords, SQL parameters and provider error details.
  console.error('PostgreSQL setup failed (' + code + '). Check DATABASE_URL, TLS, network access and the migration instructions in docs/supabase.md.');
  process.exitCode = 1;
} finally {
  if (client) await client.end().catch(() => {});
}
