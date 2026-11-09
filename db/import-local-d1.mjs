import fs from 'node:fs/promises';
import path from 'node:path';

const tables = ['projects', 'assets', 'jobs', 'settings', 'webhook_inbox'];
const receipt = '__railway_local_d1_import_v1';

async function sqliteFiles(directory, depth = 0) {
  let entries;
  try { entries = await fs.readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const files = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const target = path.join(directory, entry.name);
    if (entry.isFile() && entry.name.endsWith('.sqlite')) files.push(target);
    else if (entry.isDirectory() && depth < 5) files.push(...await sqliteFiles(target, depth + 1));
  }
  return files;
}

export async function importLocalD1(client, stateDirectory) {
  if ((await client.query('SELECT value FROM tuxu.settings WHERE key=$1', [receipt])).rows.length) return { skipped: true };
  const files = await sqliteFiles(path.join(stateDirectory, 'v3', 'd1'));
  if (!files.length) return { localDatabaseFound: false };
  const { DatabaseSync } = await import('node:sqlite');
  const sources = [];
  try {
    for (const file of files) {
      const sqlite = new DatabaseSync(file, { readOnly: true });
      const names = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);
      if (tables.every(table => names.includes(table))) sources.push(sqlite);
      else sqlite.close();
    }
    if (!sources.length) return { localDatabaseFound: false };
    if (sources.length > 1) throw Object.assign(new Error('Multiple local application databases found; select and migrate them manually.'), { code: 'MULTIPLE_LOCAL_DATABASES' });
    const sqlite = sources[0];
    sqlite.exec('BEGIN');
    const sourceNames = new Set(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
    const selectedTables = [...tables, ...['accounts','account_sessions','login_attempts'].filter(table=>sourceNames.has(table))];
    const counts = Object.fromEntries(selectedTables.map(table => [table, Number(sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n)]));
    const localCount = Object.values(counts).reduce((sum, count) => sum + count, 0);
    if (!localCount) return { localDatabaseFound: true, imported: counts };
    for (const table of selectedTables) {
      if (Number((await client.query(`SELECT count(*) AS n FROM tuxu.${table}`)).rows[0].n)) {
        throw Object.assign(new Error('Supabase already contains application data. Local data was not merged or overwritten.'), { code: 'LOCAL_IMPORT_TARGET_NOT_EMPTY' });
      }
    }
    for (const table of selectedTables) {
      const columns = (await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='tuxu' AND table_name=$1 ORDER BY ordinal_position", [table])).rows.map(row => row.column_name);
      const sourceColumns = new Set(sqlite.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name));
      const selected = columns.filter(column => sourceColumns.has(column));
      const fields = selected.map(column => '"' + column + '"').join(',');
      const placeholders = selected.map((_, index) => '$' + (index + 1)).join(',');
      for (const row of sqlite.prepare(`SELECT ${fields} FROM ${table}`).iterate()) {
        await client.query(`INSERT INTO tuxu.${table}(${fields}) VALUES(${placeholders})`, selected.map(column => row[column]));
      }
    }
    await client.query('INSERT INTO tuxu.settings(key,value) VALUES($1,$2)', [receipt, JSON.stringify({ importedAt: new Date().toISOString(), counts })]);
    return { localDatabaseFound: true, imported: counts };
  } finally {
    for (const sqlite of sources) sqlite.close();
  }
}
