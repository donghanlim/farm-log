import test from 'node:test';
import assert from 'node:assert/strict';
import { demoApi, resetDemo, demoStorageInfo, DEMO_STORAGE_KEY } from '../src/public-demo/demo-api.js';

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.get(key) ?? null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
}
globalThis.localStorage = new MemoryStorage();

const draft = (overrides = {}) => ({
  worked_at: '2026-09-18', parcel_id: 'house-3', crop: '토마토', work_type: '관수', weather: null,
  area_m2: null, worker_count: null, duration_minutes: 30, inputs: [], harvest_amount: null, harvest_unit: null, details: '30분 물 주기', ...overrides
});
const rejects = (promise, status) => assert.rejects(promise, error => error.status === status);

test('public demo persists a three-step save, review, correction and restart flow', async () => {
  resetDemo();
  const blank = await demoApi('workspace');
  assert.equal(blank.profile.farm_name, '팜로그 체험 농장');
  assert.deepEqual(blank.profile.parcels.map(parcel => [parcel.name, parcel.crop]), [['3번 하우스', '토마토'], ['윗밭', '고추']]);
  assert.deepEqual(blank.entries, []);

  const session = await demoApi('manual-sessions', { requestKey: 'first-save', draft: draft(), sourceText: '3번 하우스에 물을 줬어요.' });
  const first = (await demoApi(`sessions/${session.id}/confirm`, { reviewed: true, idempotencyKey: 'farmer-save-1' })).entry;
  const review = (await demoApi(`entries/${first.id}/review`, { status: 'needs_changes', note: '작업 시간을 확인해 주세요.', expectedReviewId: null })).review;
  const correction = await demoApi(`entries/${first.id}/correct`, {});
  await demoApi(`sessions/${correction.id}/draft`, { draft: draft({ duration_minutes: 20, details: '20분으로 정정' }) });
  const second = (await demoApi(`sessions/${correction.id}/confirm`, { reviewed: true, idempotencyKey: 'farmer-save-2' })).entry;

  const restarted = await demoApi('workspace');
  assert.deepEqual(restarted.entries.map(entry => entry.id), [second.id]);
  assert.deepEqual(restarted.summary, { total: 1, pending: 1, checked: 0, needs_changes: 0 });
  const detail = await demoApi(`entries/${second.id}`);
  assert.deepEqual(detail.history.map(entry => entry.id), [first.id, second.id]);
  assert.deepEqual(detail.reviewHistory.map(item => item.id), [review.id]);
  assert.equal(demoStorageInfo().key, DEMO_STORAGE_KEY);
  assert.equal(demoStorageInfo().hasData, true);
});

test('visitor reset removes only this browser demo state and restores empty defaults', async () => {
  resetDemo();
  await demoApi('manual-sessions', { draft: draft(), sourceText: '브라우저 안의 체험 데이터' });
  assert.equal(demoStorageInfo().hasData, true);
  resetDemo();
  assert.deepEqual(demoStorageInfo(), { key: DEMO_STORAGE_KEY, version: 1, hasData: false, bytes: 0 });
  const workspace = await demoApi('workspace');
  assert.deepEqual(workspace.entries, []);
  assert.deepEqual(workspace.summary, { total: 0, pending: 0, checked: 0, needs_changes: 0 });
});

test('manual and farmer idempotency plus stale review conflicts preserve one record', async () => {
  resetDemo();
  const body = { requestKey: 'retry-key', draft: draft(), sourceText: '원문' };
  const one = await demoApi('manual-sessions', body);
  const replay = await demoApi('manual-sessions', { ...body, draft: Object.fromEntries(Object.entries(body.draft).reverse()) });
  assert.deepEqual(replay, one);
  await rejects(demoApi('manual-sessions', { ...body, sourceText: '다른 원문' }), 409);
  const saved = await demoApi(`sessions/${one.id}/confirm`, { reviewed: true, idempotencyKey: 'confirm-key' });
  assert.equal((await demoApi(`sessions/${one.id}/confirm`, { reviewed: true, idempotencyKey: 'confirm-key' })).duplicate, true);
  await rejects(demoApi(`sessions/${one.id}/confirm`, { reviewed: true, idempotencyKey: 'another-key' }), 409);
  const firstReview = (await demoApi(`entries/${saved.entry.id}/review`, { status: 'checked', note: '', expectedReviewId: null })).review;
  await rejects(demoApi(`entries/${saved.entry.id}/review`, { status: 'needs_changes', note: '다시 확인', expectedReviewId: null }), 409);
  await rejects(demoApi(`entries/${saved.entry.id}/review`, { status: 'needs_changes', note: ' ', expectedReviewId: firstReview.id }), 400);
});

test('untrusted-looking text stays data in storage and is escaped in export HTML', async () => {
  resetDemo();
  const dangerous = '<img src=x onerror=alert(1)>';
  const session = await demoApi('manual-sessions', { draft: draft({ details: dangerous }), sourceText: dangerous });
  const entry = (await demoApi(`sessions/${session.id}/confirm`, { reviewed: true, idempotencyKey: 'escaped-data' })).entry;
  assert.equal((await demoApi('workspace')).entries[0].details, dangerous);
  const exported = await demoApi('export', { from: '2026-09-01', to: '2026-09-30', reviewed: true });
  assert.ok(exported.html.includes('&lt;img'));
  assert.equal(exported.html.includes(dangerous), false);
  assert.deepEqual(exported.event_ids, [entry.id]);
});
