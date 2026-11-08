import { types } from 'pg';

const setupError = (code, message) => Object.assign(new Error(message), { code });

// Parse explicitly so URL SSL parameters cannot silently replace our TLS options.
// This module never includes the connection string or password in an error.
export function postgresOptions(connectionString, caCertificate) {
  let url;
  try { url = new URL(connectionString); } catch { throw setupError('INVALID_DATABASE_URL', 'DATABASE_URL must be a PostgreSQL connection URL.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || url.hash) {
    throw setupError('INVALID_DATABASE_URL', 'DATABASE_URL must be a PostgreSQL connection URL.');
  }
  let user, password, database;
  try {
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
    database = decodeURIComponent(url.pathname.slice(1)) || 'postgres';
  } catch { throw setupError('INVALID_DATABASE_URL', 'DATABASE_URL contains invalid URL encoding.'); }
  if (!password || /^\[?YOUR[-_ ]?PASSWORD\]?$/i.test(password)) throw setupError('DATABASE_PASSWORD_REQUIRED', 'Replace the database password placeholder in DATABASE_URL.');
  const mode = url.searchParams.get('sslmode') || 'verify-full';
  if (!['require', 'verify-ca', 'verify-full'].includes(mode)) throw setupError('DATABASE_SSL_REQUIRED', 'DATABASE_URL must use SSL: sslmode=require or sslmode=verify-full.');
  const port = Number(url.port || 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw setupError('INVALID_DATABASE_URL', 'DATABASE_URL contains an invalid port.');
  if (port === 6543 && (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.pooler.supabase.com'))) {
    throw setupError('USE_SESSION_POOLER', 'Use the Supabase Session pooler or direct connection on port 5432.');
  }
  return {
    host: url.hostname.replace(/^\[|\]$/g, ''), port, user, password, database,
    ssl: { rejectUnauthorized: Boolean(caCertificate) || mode !== 'require', ...(caCertificate ? { ca: caCertificate } : {}) },
    application_name: 'tuxu-railway', connectionTimeoutMillis: 10000,
    statement_timeout: 25000, query_timeout: 30000,
    types: { getTypeParser(oid, format) {
      if (format !== 'binary' && (oid === 20 || oid === 1700)) return value => {
        const number = Number(value);
        if (!Number.isSafeInteger(number)) throw new Error('Database integer exceeds the supported range.');
        return number;
      };
      return types.getTypeParser(oid, format);
    } },
  };
}
