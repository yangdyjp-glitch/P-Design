import net from 'node:net';
import tls from 'node:tls';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// A real PostgreSQL engine behind a self-signed TLS endpoint. Authentication is
// intentionally bypassed in this local-only fixture; production uses Supabase.
export async function postgresServer({ refuseTls = false } = {}) {
  const key = await fs.readFile(new URL('./postgres-tls/localhost.key', import.meta.url));
  const cert = await fs.readFile(new URL('./postgres-tls/localhost.crt', import.meta.url));
  const context = tls.createSecureContext({ key, cert });
  const engine = new PGlite();
  await engine.waitReady;
  const connections = new Set();
  let applicationBytes = 0;
  const server = net.createServer(socket => {
    connections.add(socket);
    socket.on('error', () => {});
    socket.once('close', () => connections.delete(socket));
    socket.once('data', request => {
      if (request.length !== 8 || request.readInt32BE(4) !== 80877103) return socket.destroy();
      if (refuseTls) { socket.end('N'); return; }
      socket.write('S');
      const secure = new tls.TLSSocket(socket, { isServer: true, secureContext: context });
      connections.add(secure);
      secure.on('error', () => {});
      secure.once('close', () => connections.delete(secure));
      let buffer = Buffer.alloc(0), startup = true, pending = Promise.resolve();
      secure.on('data', chunk => {
        applicationBytes += chunk.length;
        buffer = Buffer.concat([buffer, chunk]);
        if (startup) {
          if (buffer.length < 4 || buffer.length < buffer.readInt32BE()) return;
          buffer = buffer.subarray(buffer.readInt32BE());
          startup = false;
          secure.write(Buffer.from([82, 0, 0, 0, 8, 0, 0, 0, 0, 90, 0, 0, 0, 5, 73]));
        }
        while (buffer.length >= 5 && buffer.length >= buffer.readInt32BE(1) + 1) {
          const message = buffer.subarray(0, buffer.readInt32BE(1) + 1);
          buffer = buffer.subarray(message.length);
          if (message[0] === 88) { secure.end(); break; }
          pending = pending.then(async () => {
            const response = await engine.execProtocolRaw(message, { syncToFs: false });
            if (!secure.destroyed && response.length) secure.write(response);
          }).catch(() => secure.destroy());
        }
      });
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    engine, cert: cert.toString(), port: server.address().port,
    get applicationBytes() { return applicationBytes; },
    url: 'postgresql://postgres:public-test-password@localhost:' + server.address().port + '/postgres?sslmode=verify-full',
    async close() {
      for (const connection of connections) connection.destroy();
      await new Promise(resolve => server.close(resolve));
      await engine.close();
    },
  };
}
