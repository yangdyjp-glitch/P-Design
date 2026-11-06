import { fileURLToPath } from 'node:url';

if (process.env.RAILWAY_ENVIRONMENT_ID || process.env.TUXU_RUNTIME === 'railway') {
  await import('./start-railway.mjs');
} else {
  await import('./sites-env.mjs');
  const cli = new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url);
  process.argv = [process.execPath, fileURLToPath(cli), 'dev', '--config', 'dist/server/wrangler.json', '--local', '--persist-to', '.wrangler/state', '--ip', '127.0.0.1', '--inspector-port', '0', ...process.argv.slice(2)];
  await import(cli.href);
}
