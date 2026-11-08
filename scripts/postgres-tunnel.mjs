import net from 'node:net';
import tls from 'node:tls';
import { postgresOptions } from '../db/postgres-options.mjs';

const sslRequest = Buffer.from([0, 0, 0, 8, 4, 210, 22, 47]);

// Railway runs workerd locally. Its socket TLS implementation cannot apply the
// PostgreSQL CA/verification options. Keep that TLS hop in Node, with a listener
// available only inside this container; PostgreSQL authentication stays end to end.
export async function startPostgresTunnel(connectionString, caCertificate, report = code => console.error('POSTGRES_TUNNEL_FAILURE', code)) {
  const options = postgresOptions(connectionString, caCertificate);
  const connections = new Set();
  const server = net.createServer(local => {
    local.pause();
    local.setNoDelay(true);
    connections.add(local);
    const upstream = net.connect({ host: options.host, port: options.port });
    connections.add(upstream);
    let secure, finished = false;
    const timer = setTimeout(() => fail({ code: 'CONNECT_TIMEOUT' }), options.connectionTimeoutMillis);
    timer.unref();
    function close() {
      finished = true;
      clearTimeout(timer);
      local.destroy();
      secure?.destroy();
      upstream.destroy();
    }
    function fail(error) {
      if (!finished) {
        const code = /^[A-Z0-9_]{2,40}$/.test(error?.code || '') ? error.code : 'TLS_CONNECTION_FAILED';
        report(code);
      }
      close();
    }
    local.on('error', fail);
    upstream.on('error', fail);
    local.once('close', () => { connections.delete(local); close(); });
    upstream.once('close', () => connections.delete(upstream));
    upstream.once('connect', () => upstream.write(sslRequest));
    upstream.once('data', response => {
      // Never forward application bytes unless PostgreSQL has accepted TLS and
      // the secure connection has completed with the configured verification.
      if (response.length !== 1 || response[0] !== 83) return fail({ code: 'DATABASE_SSL_REQUIRED' });
      secure = tls.connect({
        socket: upstream, host: options.host,
        ...(net.isIP(options.host) ? {} : { servername: options.host }),
        ...options.ssl,
      });
      secure.on('error', fail);
      secure.once('close', close);
      secure.once('secureConnect', () => {
        clearTimeout(timer);
        if (local.destroyed) return close();
        secure.pipe(local);
        local.pipe(secure);
      });
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
  });
  let closing;
  return {
    port: server.address().port,
    host: server.address().address,
    close() {
      return closing ||= new Promise((resolve, reject) => {
        for (const connection of connections) connection.destroy();
        server.close(error => error ? reject(error) : resolve());
      });
    },
  };
}
