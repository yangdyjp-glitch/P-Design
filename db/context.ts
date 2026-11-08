import { AsyncLocalStorage } from 'node:async_hooks';
import type { Client } from 'pg';
import type { Database } from './postgres';

type Context = { database: Database; client: Client };
const databaseContext = new AsyncLocalStorage<Context>();
export const currentDatabase = () => databaseContext.getStore();
export const databaseProvider = () => currentDatabase() ? 'postgresql' : 'd1';
export function withDatabaseContext<T>(context: Context, run: () => T): T {
  return databaseContext.run(context, run);
}
