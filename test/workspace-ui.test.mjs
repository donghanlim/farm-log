import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderFarmer } from '../src/workspace/farmer.js';
import { renderAdmin } from '../src/workspace/admin.js';
import { esc, emptyDraft, statusOf, statusLabel, workChoices, formatDate } from '../src/workspace/shared.js';
import { workTypes } from '../src/app/store.mjs';
const profile = { farm_name: '시험 농장', parcels: [{ id: 'p1', name: '시험 밭', crop: '토마토', aliases: [], area_m2: null }] };
const entry = { ...emptyDraft('2026-09-18'), id: 'e1', parcel_id: 'p1', parcel_name: '시험 밭', crop: '토마토', work_type: '관수', details: '물 주기', attachments: [], source_text: '원문' };
function context(entries = []) { return { data: { profile: structuredClone(profile), entries: structuredClone(entries), reviews: {}, summary: { total: entries.length, pending: entries.length, checked: 0, needs_changes: 0 }, pending: [] }, ui: { view: 'home' } }; }
test('workspace work choices exactly match server vocabulary', () => {
  assert.deepEqual(workChoices.map(([key]) => key).sort(), [...workTypes].sort());
});
test('farmer empty state does not invent activities or compliance', () => {
  const html = renderFarmer(context());
  assert.match(html, /첫 기록을 기다리고/);
  assert.match(html, /0<span>건/);
  assert.match(html, /예시 기록은 자동으로 넣지/);
});
test('farmer preview keeps unknown numbers missing and requires explicit check', () => {
  const ctx = context(); ctx.ui = { view: 'edit', draft: { ...entry, parcel_name: undefined }, step: 3, reviewed: false };
  const html = renderFarmer(ctx);
  assert.match(html, /미기재/); assert.match(html, /type="submit"[^>]*disabled/);
  assert.equal(html.includes('0분'), false);
  ctx.ui.reviewed = true;
  assert.equal(/type="submit"[^>]*disabled/.test(renderFarmer(ctx)), false);
});
test('untrusted farmer/admin strings are escaped in cards, details and notes', () => {
  const dirty = '<img src=x onerror=alert(1)>';
  const ctx = context([{ ...entry, details: dirty, parcel_name: dirty, source_text: dirty }]);
  ctx.data.profile.farm_name = dirty;
  ctx.data.reviews.e1 = { status: 'needs_changes', note: dirty };
  for (const html of [renderFarmer(ctx), renderAdmin(ctx)]) {
    assert.equal(html.includes(dirty), false); assert.match(html, /&lt;img/);
  }
  ctx.ui.view = 'detail'; ctx.ui.entry = ctx.data.entries[0];
  assert.equal(renderFarmer(ctx).includes(dirty), false);
});
test('admin exact filter result count differs from whole-period summary', () => {
  const ctx = context([entry, { ...entry, id: 'e2', crop: '고추' }]);
  ctx.data.reviews.e1 = { status: 'checked', note: '' };
  ctx.ui.admin = { filters: { search: '고추', parcel: '', status: 'pending', from: '', to: '' } };
  const html = renderAdmin(ctx);
  assert.match(html, /총 2건 중 1건/); assert.match(html, /전체 기간 · 필터 미적용/);
  assert.match(html, /data-admin-open="e2"/); assert.equal(html.includes('data-admin-open="e1"'), false);
});
test('invalid date range shows error instead of confusing empty success', () => {
  const ctx = context([entry]);
  ctx.ui.admin = { filters: { search: '', parcel: '', status: '', from: '2026-09-20', to: '2026-09-01' } };
  assert.match(renderAdmin(ctx), /종료일을 시작일과 같거나 이후/);
});
test('confirmation uncertainty offers retry, not an editable contradictory draft', () => {
  const ctx = context(); ctx.ui = { view: 'edit', draft: emptyDraft(), step: 3, confirmPending: true };
  const html = renderFarmer(ctx); assert.match(html, /retry-confirm/); assert.equal(html.includes('id="record-form"'), false);
});
test('shared status and date labels remain plain Korean and preserve four-field contract', () => {
  const ctx = context([entry]); assert.equal(statusOf(ctx, entry), 'pending');
  assert.equal(statusLabel('checked'), '확인 완료'); assert.match(formatDate('2026-09-18'), /9월 18일/);
  assert.equal(esc('"<&'), '&quot;&lt;&amp;');
});
test('workspace has no external runtime asset requests or localStorage state masquerading as records', async () => {
  const files = await Promise.all(['index.html','app.js','shared.js','farmer.js','admin.js','styles.css'].map(file => readFile(new URL('../src/workspace/' + file, import.meta.url), 'utf8')));
  for (const text of files) {
    assert.equal(/(?:src|href)=["']https?:\/\//.test(text), false);
    assert.equal(text.includes('localStorage'), false);
  }
});
