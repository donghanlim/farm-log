import test from 'node:test';
import assert from 'node:assert/strict';
import {buildExport,csvCell} from '../src/app/template.mjs';
import {emptyDraft} from '../src/app/store.mjs';
test('government fields, A4 escaping, evidence IDs, formula protection and unknowns',()=>{const e={...emptyDraft('2026-09-07'),id:'event-1',parcel_name:'=HYPERLINK("bad")',crop:'<script>alert(1)</script>',work_type:'관수',details:'all original\ntext',inputs:[{action:'purchase',kind:'fertilizer',name:'<img>',quantity:2,unit:'kg',dilution:null}]};const r=buildExport([e]);assert.deepEqual(r.event_ids,['event-1']);assert.match(r.html,/size:A4/);assert.ok(!r.html.includes('<script>'));assert.match(r.html,/&lt;img&gt;/);assert.match(r.html,/구입/);assert.match(r.html,/사용/);assert.match(r.html,/미기재/);assert.match(r.csv,/'=HYPERLINK/);assert.match(csvCell(' \t=1+2'),/^"'/);assert.equal(buildExport([]).entries.length,0);});
