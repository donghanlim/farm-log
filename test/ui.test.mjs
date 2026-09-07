import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../src/public/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../src/public/index.html', import.meta.url), 'utf8');
const renderSource = source.slice(source.indexOf('function renderEvalMetrics('), source.indexOf('async function loadEvals()'));
function metrics(data) {
  const elements = Object.fromEntries(['eval-cases', 'eval-fields', 'eval-rules'].map(id => [id, {textContent: ''}]));
  const context = { $: id => elements[id], data };
  vm.runInNewContext(renderSource + '\nrenderEvalMetrics(data);', context);
  return Object.fromEntries(Object.entries(elements).map(([id, el]) => [id, el.textContent]));
}
test('UI displays saved counts, not target KPI as actual accuracy', () => {
  const result = metrics({cases:30,accuracy:{field_passed:210,field_total:210},safety:{passed:210,total:210}});
  assert.equal(result['eval-cases'],'30'); assert.equal(result['eval-fields'],'210 / 210');
});
test('UI preserves genuine zero-pass failures rather than hiding as unknown', () => {
  assert.equal(metrics({accuracy:{field_passed:0,field_total:210}})['eval-fields'],'0 / 210');
});
test('UI shows unknown for absent, invalid or zero-denominator comparisons', () => {
  for (const data of [null,{}, {accuracy:{field_passed:0,field_total:0}}, {accuracy:{field_passed:211,field_total:210}}]) assert.equal(metrics(data)['eval-fields'],'미확인');
});
test('UI has unique element IDs and unit select matching server allowlist', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]); assert.equal(ids.length,new Set(ids).size);
  assert.match(html, /<select[^>]*id="unit"/);
  for (const unit of ['L','kg','g','개','포기']) assert.ok(html.includes('value="'+unit+'"'));
});
test('UI avoids unsafe HTML sinks and external resource URLs', () => {
  assert.ok(!/\.innerHTML\s*=|insertAdjacentHTML|document\.write\(/.test(source));
  assert.ok(!/(?:src|href)="https?:\/\//.test(html));
});
