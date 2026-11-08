import '../scripts/sites-env.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { postgresServer } from './fixtures/postgres-server.mjs';
import { startPostgresTunnel } from '../scripts/postgres-tunnel.mjs';

function localClient(port) {
  const client = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', password: 'public-test-password', database: 'postgres', ssl: false, connectionTimeoutMillis: 5000 });
  client.on('error', () => {});
  return client;
}

test('local TLS tunnel verifies a private CA and carries real PostgreSQL queries', async () => {
  const server = await postgresServer();
  const errors = [];
  const tunnel = await startPostgresTunnel(server.url, server.cert, code => errors.push(code));
  const client = localClient(tunnel.port);
  try {
    assert.equal(tunnel.host, '127.0.0.1');
    await client.connect();
    assert.equal((await client.query('SELECT $1::integer AS probe', [42])).rows[0].probe, 42);
    assert.deepEqual(errors, []);
  } finally { await client.end().catch(() => {}); await tunnel.close(); await tunnel.close(); await server.close(); }
});

test('local TLS tunnel never sends credentials to untrusted or non-TLS servers', async () => {
  for (const refuseTls of [false, true]) {
    const server = await postgresServer({ refuseTls });
    const errors = [];
    const tunnel = await startPostgresTunnel(server.url, undefined, code => errors.push(code));
    const client = localClient(tunnel.port);
    try {
      await assert.rejects(client.connect());
      assert.equal(server.applicationBytes, 0);
      assert(errors.includes(refuseTls ? 'DATABASE_SSL_REQUIRED' : 'DEPTH_ZERO_SELF_SIGNED_CERT'));
    } finally { await client.end().catch(() => {}); await tunnel.close(); await server.close(); }
  }
});

test('Railway workerd uses the Node TLS tunnel with the configured CA', async () => {
  process.env.CLOUDFLARE_SEND_METRICS = 'false';
  process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';
  const { unstable_dev } = await import('wrangler');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tuxu-postgres-runtime-'));
  const config = path.join(directory, 'wrangler.json');
  await fs.writeFile(config, JSON.stringify({ name:'postgres-transport-test', compatibility_date:'2026-05-15', compatibility_flags:['nodejs_compat'] }));
  const server = await postgresServer();
  const tunnel = await startPostgresTunnel(server.url, server.cert);
  let worker;
  try {
    worker = await unstable_dev(path.resolve('tests/fixtures/postgres-worker.ts'), {
      config, local:true, ip:'127.0.0.1', port:0, inspectorPort:0, logLevel:'error',
      vars:{ DATABASE_URL:server.url, DATABASE_CA_CERT:server.cert, TUXU_POSTGRES_LOCAL_PORT:String(tunnel.port) },
      experimental:{ disableExperimentalWarning:true, disableDevRegistry:true, watch:false },
    });
    const response = await worker.fetch();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { probe:42 });
  } finally {
    await worker?.stop(); await tunnel.close(); await server.close();
    await fs.rm(directory, { recursive:true, force:true });
  }
});
