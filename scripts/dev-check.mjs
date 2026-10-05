import { createServer } from 'vite';
import { _electron } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const server = await createServer();
await server.listen();
const env = {
  ...process.env,
  DOT_TEST_DATA: await mkdtemp(join(tmpdir(), 'dot-dev-check-')),
  DOT_TEST_HIDDEN: '1',
  DOT_DEV_URL: 'http://127.0.0.1:5173',
};
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await _electron.launch({ args: ['.'], env });
  const page = await app.firstWindow();
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(msg.text());
  });
  page.on('pageerror', (error) => console.log(error.message));
  await page.waitForSelector('.app', { timeout: 10000 });
  console.log('PASS hidden development launch');
} finally {
  if (app) await app.close();
  await server.close();
}
