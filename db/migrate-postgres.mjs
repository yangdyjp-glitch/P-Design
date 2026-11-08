import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const migrationsDirectory = fileURLToPath(new URL('../postgres/', import.meta.url));

// The caller owns the transaction, including the optional import of local data.
export async function applyPostgresMigrations(client, directory = migrationsDirectory) {
  await client.query('SELECT pg_advisory_xact_lock(1414879316)');
  await client.query('CREATE SCHEMA IF NOT EXISTS tuxu');
  await client.query('CREATE TABLE IF NOT EXISTS tuxu.__migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  const files = (await fs.readdir(directory)).filter(name => /^\d{4}_[a-z0-9_-]+\.sql$/.test(name)).sort();
  const applied = [];
  for (const name of files) {
    const sql = await fs.readFile(path.join(directory, name), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const previous = await client.query('SELECT checksum FROM tuxu.__migrations WHERE name=$1', [name]);
    if (previous.rows.length) {
      if (previous.rows[0].checksum !== checksum) throw Object.assign(new Error('An applied PostgreSQL migration has changed. Add a new migration instead.'), { code: 'MIGRATION_CHECKSUM_CHANGED' });
      continue;
    }
    await client.query(sql);
    await client.query('INSERT INTO tuxu.__migrations(name,checksum) VALUES($1,$2)', [name, checksum]);
    applied.push(name);
  }
  return applied;
}
