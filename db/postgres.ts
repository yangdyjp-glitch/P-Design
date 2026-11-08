export interface DatabaseResult<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: { changes: number };
}
export interface DatabaseStatement {
  bind(...values: unknown[]): DatabaseStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<DatabaseResult<T>>;
  run<T = Record<string, unknown>>(): Promise<DatabaseResult<T>>;
}
export interface Database {
  prepare(sql: string): DatabaseStatement;
  batch<T = Record<string, unknown>>(statements: DatabaseStatement[]): Promise<DatabaseResult<T>[]>;
}
export interface QueryClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}

// Only unquoted parameter markers change. Question marks in JSON, quoted strings,
// identifiers, dollar-quoted strings and comments remain literal SQL text.
export function postgresParameters(sql: string) {
  let text = '', count = 0, i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'" || ch === '"') {
      const quote = ch;
      text += sql[i++];
      while (i < sql.length) {
        const next = sql[i++]; text += next;
        if (next === quote) {
          if (sql[i] === quote) text += sql[i++];
          else break;
        }
      }
    } else if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i);
      text += sql.slice(i, end < 0 ? sql.length : end);
      i = end < 0 ? sql.length : end;
    } else if (sql.startsWith('/*', i)) {
      let depth = 1;
      text += '/*'; i += 2;
      while (i < sql.length && depth) {
        if (sql.startsWith('/*', i)) { depth++; text += '/*'; i += 2; }
        else if (sql.startsWith('*/', i)) { depth--; text += '*/'; i += 2; }
        else text += sql[i++];
      }
    } else if (ch === '$' && /^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/.test(sql.slice(i))) {
      const tag = sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)![0];
      const end = sql.indexOf(tag, i + tag.length);
      const next = end < 0 ? sql.length : end + tag.length;
      text += sql.slice(i, next); i = next;
    } else if (ch === '?') { text += '$' + (++count); i++; }
    else text += sql[i++];
  }
  return { text, count };
}

class Statement implements DatabaseStatement {
  constructor(readonly database: PostgresDatabase, readonly sql: string, readonly values: unknown[] = []) {}
  bind(...values: unknown[]) { return new Statement(this.database, this.sql, values); }
  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const { results } = await this.all<Record<string, unknown>>();
    return (results.length ? (column ? results[0][column] : results[0]) : null) as T | null;
  }
  all<T = Record<string, unknown>>() { return this.database.execute<T>(this); }
  run<T = Record<string, unknown>>() { return this.all<T>(); }
}

export class PostgresDatabase implements Database {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private client: QueryClient) {}
  prepare(sql: string) { return new Statement(this, sql); }
  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    const result = this.pending.then(run);
    this.pending = result.catch(() => {});
    return result;
  }
  private async query<T>(statement: Statement): Promise<DatabaseResult<T>> {
    const { text, count } = postgresParameters(statement.sql);
    if (count !== statement.values.length) throw new Error('Database parameter count mismatch.');
    const result = await this.client.query(text, statement.values);
    return { results: result.rows, success: true, meta: { changes: result.rowCount ?? result.rows.length } };
  }
  execute<T>(statement: Statement) { return this.enqueue(() => this.query<T>(statement)); }
  batch<T = Record<string, unknown>>(statements: DatabaseStatement[]): Promise<DatabaseResult<T>[]> {
    if (statements.some(statement => !(statement instanceof Statement) || statement.database !== this)) {
      throw new Error('A database batch must use statements from the same connection.');
    }
    return this.enqueue(async () => {
      await this.client.query('BEGIN');
      try {
        // D1 serializes write batches. Keep quota checks and their insert in one
        // serialized transaction, including when multiple Railway instances run.
        await this.client.query('SELECT pg_advisory_xact_lock(1414879317)');
        const results = [];
        for (const statement of statements) results.push(await this.query<T>(statement as Statement));
        await this.client.query('COMMIT');
        return results;
      } catch (error) {
        await this.client.query('ROLLBACK').catch(() => {});
        throw error;
      }
    });
  }
}
