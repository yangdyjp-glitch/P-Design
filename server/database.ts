import pg from 'pg';
import { postgresOptions } from '../db/postgres-options.mjs';
import { PostgresDatabase } from '../db/postgres';
import { withDatabaseContext } from '../db/context';

type WaitUntil = (promise: Promise<unknown>) => void;

export async function withPostgres<T>(
  env: { DATABASE_URL: string; DATABASE_CA_CERT?: string; TUXU_POSTGRES_LOCAL_PORT?: string },
  waitUntil: WaitUntil,
  run: (track: WaitUntil) => Promise<T>,
): Promise<T> {
  // Workers sockets belong to the request which created them. A connection must
  // never be cached globally and reused by another visitor's request.
  const options: pg.ClientConfig = postgresOptions(env.DATABASE_URL, env.DATABASE_CA_CERT);
  if (env.TUXU_POSTGRES_LOCAL_PORT) {
    const port = Number(env.TUXU_POSTGRES_LOCAL_PORT);
    if (!/^\d{1,5}$/.test(env.TUXU_POSTGRES_LOCAL_PORT) || port < 1 || port > 65535) {
      throw Object.assign(new Error('Invalid local PostgreSQL listener.'), { code: 'INVALID_LOCAL_DATABASE_PORT' });
    }
    // Only start-railway creates this loopback listener. Node negotiates the
    // remote TLS connection before passing any PostgreSQL authentication bytes.
    Object.assign(options, { host: '127.0.0.1', port, ssl: false });
  }
  const client = new pg.Client(options);
  client.on('error', () => {});
  const background: Promise<unknown>[] = [];
  try {
    await client.connect();
    await client.query('SET search_path TO tuxu, pg_catalog');
    return await withDatabaseContext({ database: new PostgresDatabase(client), client }, () => run(promise => {
      background.push(promise);
      waitUntil(promise);
    }));
  } finally {
    // Webhook processing may outlive its HTTP response. Keep its connection
    // alive until all registered work finishes, then close it in the same request.
    waitUntil(Promise.allSettled(background).then(() => client.end()).catch(() => {}));
  }
}
