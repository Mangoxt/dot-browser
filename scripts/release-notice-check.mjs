import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = await mkdtemp(join(tmpdir(), 'dot-release-ui-'));
const env = {
  ...process.env,
  DOT_TEST_HIDDEN: '1',
  DOT_TEST_DATA: directory,
  APPDATA: join(directory, 'appdata'),
  LOCALAPPDATA: join(directory, 'localappdata'),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.DOT_DEV_URL;
let app;
async function launch() {
  app = await electron.launch({ args: ['.'], env });
  const page = await app.firstWindow();
  await page.waitForSelector('.app');
  return page;
}
try {
  let page = await launch();
  await expect(page.getByRole('dialog', { name: 'Welcome to Dot', exact: true })).toBeVisible();
  await app.close();
  const path = join(directory, 'browser-data.json');
  const data = JSON.parse(await readFile(path, 'utf8'));
  data.settings.onboarded = true;
  data.lastSeenReleaseVersion = '1.0.4';
  await writeFile(path, JSON.stringify(data));
  page = await launch();
  const dialog = page.getByRole('dialog', { name: 'Neler yeni?', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Sürüm 1.0.5');
  await expect(dialog).toContainText('Her güncellemeden sonra');
  await page.screenshot({ path: 'test-results/whats-new.png' });
  await page.getByRole('button', { name: 'Anladım', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await app.close();
  page = await launch();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect
    .poll(async () => JSON.parse(await readFile(path, 'utf8')).lastSeenReleaseVersion)
    .toBe('1.0.5');
  await page.evaluate(() => window.dot.command({ type: 'tab.new', url: 'browser://about' }));
  await page.getByRole('button', { name: 'Neler yeni?', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Neler yeni?', exact: true })).toBeVisible();
  await page.getByText('Sürüm 1.0.4', { exact: false }).click();
  await expect(page.getByRole('dialog')).toContainText('PDF olarak');
  console.log(
    'PASS: onboarding, upgrade popup, persistent once-per-version, manual release history',
  );
} finally {
  if (app) await app.close().catch(() => {});
}
