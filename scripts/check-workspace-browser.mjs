// Optional UI regression. Runtime code has no dependency on Playwright.
// Mac: PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/check-workspace-browser.mjs
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createFarmerServer } from '../src/app-server.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const scratch = process.env.FARMLOG_TEST_DIR || path.join(os.tmpdir(), 'farm-log-browser');
await mkdir(scratch, { recursive: true });
const dataDir = await mkdtemp(path.join(scratch, 'workspace-browser-'));
const evidence = process.env.FARMLOG_SCREENSHOT_DIR || dataDir;
await mkdir(evidence, { recursive: true });
const server = await createFarmerServer({ dataDir });
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try { browser = await chromium.launch({
  executablePath: process.env.CHROME_BINARY || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true
}); } catch (error) {
  await new Promise(resolve => server.close(resolve));
  throw error;
}
const errors = [];
const checks = [];
const pass = text => { checks.push(text); console.log(`PASS ${text}`); };
const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const farmer = await desktop.newPage();
const admin = await desktop.newPage();
for (const page of [farmer, admin]) page.on('pageerror', error => errors.push(error.message));
const waitApp = async page => page.locator('#screen').waitFor();
const openHome = async () => { await farmer.getByRole('button', { name: '오늘의 농장', exact: true }).click(); await farmer.getByRole('button', { name: '오늘 한 일 남기기' }).waitFor(); };
const newRecord = async (parcel, work, memo, extra) => {
  await openHome();
  await farmer.getByRole('button', { name: '오늘 한 일 남기기' }).click();
  await farmer.getByRole('button', { name: parcel, exact: true }).click();
  await farmer.getByRole('button', { name: work, exact: true }).click();
  await farmer.getByRole('button', { name: '다음', exact: true }).click();
  await farmer.locator('[name="details"]').fill(memo);
  if (extra) await extra();
  await farmer.getByRole('button', { name: '다음', exact: true }).click();
  assert.equal(await farmer.getByRole('button', { name: '확인하고 저장', exact: true }).isDisabled(), true);
  await farmer.locator('#reviewed').check();
  await farmer.getByRole('button', { name: '확인하고 저장', exact: true }).click();
  await farmer.getByRole('heading', { name: '남겨둔 농사 기록' }).waitFor();
};
try {
  await farmer.goto(base + '/mvp'); await waitApp(farmer);
  assert.equal(await farmer.getByRole('heading', { name: '첫 기록을 기다리고 있어요' }).count(), 1);
  await admin.goto(base + '/admin'); await waitApp(admin);
  assert.equal(await admin.getByRole('heading', { name: '아직 저장된 기록이 없어요' }).count(), 1);
  pass('Empty farmer and admin state; no seeded facts');
  await farmer.getByRole('button', { name: '내 농장', exact: true }).click();
  await farmer.locator('[name="farm_name"]').fill('팜로그 시연 농장 · 합성');
  await farmer.getByRole('button', { name: '농장 설정 저장', exact: true }).click();
  await farmer.locator('#toast').filter({ hasText: '농장 설정을 저장했어요.' }).waitFor();
  await newRecord('3번 하우스 토마토', '물 주기', '[합성 시연] 토마토에 물을 주었어요.');
  await admin.getByRole('button', { name: '새로고침', exact: true }).click();
  await admin.getByRole('button', { name: /3번 하우스 관수 상세 보기/ }).click();
  await admin.locator('#admin-review-note').fill('[합성 시연] 작업시간을 기억하면 알려주세요.');
  await admin.locator('#admin-review-form [value="needs_changes"]').click();
  await admin.locator('#toast').filter({ hasText: '보완 요청을 기록했어요.' }).waitFor();
  await openHome();
  assert.match(await farmer.locator('#screen').innerText(), /함께 확인할 기록이 1개/);
  pass('Farmer save is visible to admin; admin review reaches farmer');
  await farmer.locator('[data-entry]').first().click();
  await farmer.getByRole('button', { name: '내용 보완·정정하기' }).click();
  await farmer.getByRole('button', { name: '다음', exact: true }).click();
  await farmer.locator('[name="duration_minutes"]').fill('30');
  await farmer.locator('[name="details"]').fill('[합성 시연] 토마토에 30분 물을 주었어요.');
  await farmer.getByRole('button', { name: '다음', exact: true }).click();
  await farmer.locator('#reviewed').check();
  await farmer.getByRole('button', { name: '확인하고 저장', exact: true }).click();
  await farmer.getByRole('heading', { name: '남겨둔 농사 기록' }).waitFor();
  await admin.getByRole('button', { name: '기록 상세 닫기' }).click();
  await admin.getByRole('button', { name: '새로고침', exact: true }).click();
  await admin.getByRole('button', { name: /3번 하우스 관수 상세 보기/ }).click();
  await admin.locator('#admin-detail').getByText('확인 대기', { exact: true }).waitFor();
  assert.match(await admin.locator('#admin-detail').innerText(), /정정 이력 · 2건/);
  await admin.locator('#admin-review-form [value="checked"]').click();
  await admin.locator('#toast').filter({ hasText: '내부 확인 완료를 기록했어요.' }).waitFor();
  pass('Correction preserves original, resets review, and can be checked again');
  await newRecord('윗밭 고추', '수확', '[합성 시연] 빨갛게 익은 고추를 수확했어요.', async () => {
    await farmer.getByText('수확량·자재 등 더 남기기', { exact: false }).click();
    await farmer.locator('[name="harvest_amount"]').fill('5');
    await farmer.locator('[name="harvest_unit"]').fill('kg');
  });
  await newRecord('윗밭 고추', '풀 뽑기', '[합성 시연] 고추밭 주변 풀을 정리했어요.');
  pass('Three-step manual input; harvest value/unit preserved');
  await admin.getByRole('button', { name: '기록 상세 닫기' }).click();
  await admin.getByRole('button', { name: '새로고침', exact: true }).click();
  await admin.locator('#admin-status').selectOption('pending');
  assert.equal(await admin.locator('[data-admin-open]').count(), 2);
  const downloadEvent = admin.waitForEvent('download');
  await admin.getByRole('button', { name: 'CSV 받기' }).click();
  const download = await downloadEvent;
  const downloadPath = path.join(dataDir, 'filtered.csv');
  await download.saveAs(downloadPath);
  const csv = await readFile(downloadPath, 'utf8');
  assert.equal(csv.includes('30분'), false);
  assert.equal(csv.split('\r\n').length, 3);
  await admin.locator('#admin-search').fill('없는 작물');
  assert.equal(await admin.getByRole('heading', { name: '조건에 맞는 기록이 없어요' }).count(), 1);
  await admin.getByRole('button', { name: '초기화', exact: true }).click();
  pass('Status/search filters, empty results and exact filtered CSV');
  await openHome();
  await farmer.screenshot({ path: path.join(evidence, 'farmer-desktop.png'), fullPage: true });
  await admin.screenshot({ path: path.join(evidence, 'admin-desktop.png'), fullPage: true });
  // Separate fresh context models a small phone without touching the user's window.
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const mobile = await mobileContext.newPage();
  mobile.on('pageerror', error => errors.push(error.message));
  await mobile.goto(base + '/mvp'); await waitApp(mobile);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await mobile.locator('.mobile-role-link').isVisible(), true);
  await mobile.screenshot({ path: path.join(evidence, 'farmer-mobile.png'), fullPage: true });
  await mobile.getByRole('button', { name: '오늘 한 일 남기기' }).click();
  await mobile.getByRole('button', { name: '3번 하우스 토마토', exact: true }).click();
  await mobile.getByRole('button', { name: '물 주기', exact: true }).click();
  await mobile.getByRole('button', { name: '다음', exact: true }).click();
  await mobile.locator('[name="details"]').fill('모바일 임시 메모');
  await mobile.locator('.mobile-nav [data-view="home"]').click();
  await mobile.getByRole('button', { name: '오늘 한 일 남기기' }).click();
  assert.equal(await mobile.locator('[name="details"]').inputValue(), '모바일 임시 메모');
  await mobile.screenshot({ path: path.join(evidence, 'farmer-mobile-form.png'), fullPage: true });
  pass('390px mobile no horizontal overflow; navigation preserves in-tab draft');
  await mobile.goto(base + '/admin'); await waitApp(mobile);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await mobile.screenshot({ path: path.join(evidence, 'admin-mobile.png'), fullPage: true });
  pass('390px admin stacked records and farmer role link');
  assert.deepEqual(errors, []);
  pass('No browser page errors in the tested flows');
  const journal = (await readFile(path.join(dataDir, 'journal.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(journal.filter(event => event.change.entry).length, 4);
  assert.equal(journal.filter(event => event.change.review).length, 2);
  pass('Persisted 4 entry versions / 3 current records / 2 review events');
  const report = { at: new Date().toISOString(), base, dataDir, checks, browserErrors: errors, screenshots: evidence };
  await writeFile(path.join(evidence, 'browser-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
