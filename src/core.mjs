// Synthetic-only deterministic baseline. No LLM, STT, network, or regulatory decision.
export const parcels = Object.freeze([{id:'p1',name:'합성 1번 밭'},{id:'p2',name:'합성 2번 밭'}].map(Object.freeze));
export const crops = Object.freeze(['상추','토마토','고추']);
export const workTypes = Object.freeze(['관수','파종','정식','방제','수확']);
export const units = Object.freeze(['L','kg','g','개','포기']);
const required = ['worked_at','parcel_id','crop','work_type'];
const keys = [...required,'amount','unit'];
export const fixtures = Object.freeze([
 {id:'normal',title:'정상 관수',text:'2026-09-07 합성 1번 밭 상추 관수 20 L'},
 {id:'missing',title:'날짜·필지 누락',text:'상추 관수'},
 {id:'multiple',title:'복수 작업',text:'2026-09-07 합성 1번 밭 상추 관수와 수확을 했다'},
 {id:'ambiguous',title:'모호한 표현',text:'어제 거기서 작물에 적당히 물을 줬다'},
 {id:'spray',title:'방제 기록, 규정 미검증',text:'2026-09-07 합성 2번 밭 고추 방제 2 L'},
 {id:'harvest',title:'수확 수량',text:'2026-09-08 합성 1번 밭 토마토 수확 12.5 kg'},
 {id:'year-end',title:'연말 날짜',text:'2026-12-31 합성 2번 밭 고추 수확 8 kg'},
 {id:'leap-day',title:'윤년 날짜',text:'2024-02-29 합성 1번 밭 상추 파종 30 개'},
 {id:'invalid-date',title:'잘못된 날짜',text:'2026-02-30 합성 1번 밭 상추 관수 10 L'},
 {id:'no-unit',title:'단위 없는 수량',text:'2026-09-07 합성 1번 밭 상추 수확 10'},
 {id:'multi-parcel',title:'복수 필지',text:'2026-09-07 합성 1번 밭과 합성 2번 밭 상추 관수 20 L'},
 {id:'multi-crop',title:'복수 작물',text:'2026-09-07 합성 1번 밭 상추와 토마토 수확 5 kg'}
,{"id":"transplant","title":"정식 포기 수","text":"2026-09-09 합성 2번 밭 토마토 정식 100 포기"},
{"id":"seed-grams","title":"파종 중량","text":"2026-09-10 합성 1번 밭 상추 파종 50 g"},
{"id":"next-year","title":"새해 날짜","text":"2027-01-01 합성 2번 밭 고추 관수 3 L"},
{"id":"century-leap","title":"세기 윤년","text":"2000-02-29 합성 1번 밭 상추 수확 1 kg"},
{"id":"century-invalid","title":"세기 평년 오류","text":"2100-02-29 합성 1번 밭 상추 수확 1 kg"},
{"id":"no-date","title":"날짜 없음","text":"합성 1번 밭 상추 관수 5 L"},
{"id":"no-parcel","title":"필지 없음","text":"2026-09-07 고추 수확 2 kg"},
{"id":"no-crop","title":"작물 없음","text":"2026-09-07 합성 1번 밭 관수 5 L"},
{"id":"no-work","title":"작업 없음","text":"2026-09-07 합성 2번 밭 토마토"},
{"id":"unsupported-unit","title":"미지원 단위","text":"2026-09-07 합성 1번 밭 상추 관수 2 병"},
{"id":"unsupported-crop","title":"미지원 작물","text":"2026-09-07 합성 1번 밭 감자 수확 4 kg"},
{"id":"unsupported-work","title":"미지원 작업","text":"2026-09-07 합성 2번 밭 고추 점검"},
{"id":"unsupported-parcel","title":"미지원 필지","text":"2026-09-07 합성 9번 밭 상추 수확 2 kg"},
{"id":"two-dates","title":"복수 날짜","text":"2026-09-07 2026-09-08 합성 1번 밭 상추 관수 5 L"},
{"id":"two-quantities","title":"복수 수량","text":"2026-09-07 합성 1번 밭 상추 관수 5 L 그리고 10 L"},
{"id":"negative-quantity","title":"음수 수량","text":"2026-09-07 합성 1번 밭 상추 수확 -5 kg"},
{"id":"zero-quantity","title":"0 수량","text":"2026-09-07 합성 1번 밭 상추 수확 0 kg"},
{"id":"decimal-water","title":"소수 관수량","text":"2026-09-07 합성 2번 밭 토마토 관수 0.5 L"}
].map(Object.freeze));
export function fail(message,status=400) { const e=new Error(message); e.status=status; throw e; }
export function isValidDate(value) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000')) return false;
 const d=new Date(value+'T00:00:00.000Z'); return Number.isFinite(+d)&&d.toISOString().slice(0,10)===value;
}
export function validateFields(fields) {
 if(!fields||typeof fields!=='object'||Array.isArray(fields)) fail('fields must be an object');
 if(Object.keys(fields).some(k=>!keys.includes(k))) fail('Unknown field: synthetic privacy allowlist only');
 const out=Object.fromEntries(keys.map(k=>[k,fields[k]??null]));
 if(out.worked_at!==null&&!isValidDate(out.worked_at)) fail('Invalid worked_at date');
 for(const [k,allowed] of [['parcel_id',parcels.map(p=>p.id)],['crop',crops],['work_type',workTypes],['unit',units]])
  if(out[k]!==null&&!allowed.includes(out[k])) fail('Invalid '+k);
 if(out.amount!==null&&(typeof out.amount!=='number'||!Number.isFinite(out.amount)||out.amount<=0)) fail('amount must be finite and positive or null');
 return out;
}
export function makeDraft(fixtureId,fields,source='synthetic_text') {
 const fixture=fixtures.find(f=>f.id===fixtureId); if(!fixture) fail('Unknown synthetic fixture',404);
 const valid=validateFields(fields); const missing=required.filter(k=>valid[k]===null);
 const warnings=['합성 텍스트 결정론적 baseline: 실제 음성·사진·LLM 미연동','농약 등록·PLS·PHI·유기인증 등 외부 규정 미검증'];
 if(valid.amount===null||valid.unit===null) warnings.push('수량 또는 단위 미확인: 추정하지 않음');
 if(valid.work_type==='방제') warnings.push('방제 기록은 약제 추천이나 안전 판정이 아님');
 return {fixtureId,raw_input:fixture.text,...valid,missing,warnings,question:missing.length?`확인해 주세요: ${missing.join(', ')}`:null,regulatory_status:'not_checked',source};
}
export function extractFixture(fixtureId) {
 const f=fixtures.find(f=>f.id===fixtureId); if(!f) fail('Unknown synthetic fixture',404);
 const found=(list,fn)=>list.filter(fn); const ps=found(parcels,p=>f.text.includes(p.name)); const cs=found(crops,c=>f.text.includes(c)); const ws=found(workTypes,w=>f.text.includes(w));
 const dates=f.text.match(/\d{4}-\d{2}-\d{2}/g)||[];
 const quantities=[...f.text.matchAll(/(?:^|\s)(\d+(?:\.\d+)?)\s+(L|kg|g|개|포기)(?=\s|$)/g)];
 const ambiguous=ps.length>1||cs.length>1||ws.length>1;
 const q=quantities.length===1&&!ambiguous&&Number.isFinite(Number(quantities[0][1]))&&Number(quantities[0][1])>0?quantities[0]:null;
 const draft=makeDraft(fixtureId,{worked_at:dates.length===1&&isValidDate(dates[0])?dates[0]:null,parcel_id:ps.length===1?ps[0].id:null,crop:cs.length===1?cs[0]:null,work_type:ws.length===1?ws[0]:null,amount:q?Number(q[1]):null,unit:q?q[2]:null});
 if(ambiguous) draft.warnings.push('복수 필지·작물·작업은 자동 분할하지 않음: 사람이 한 기록으로 확인해야 함');
 if(dates.some(d=>!isValidDate(d))) draft.warnings.push('유효하지 않은 날짜를 비워 두었음');
 return {draft,trace:[{agent:'synthetic-input',status:'complete',detail:'고정된 합성 fixture만 입력 허용'},{agent:'deterministic-baseline',status:'complete',detail:'규칙 기반 문자열 추출. LLM 정확도 측정 아님'},{agent:'human-review',status:'required',detail:'사람이 필수값과 규정 미검증 상태를 확인한 뒤 저장'}]};
}
export function buildReport(records) {
 const superseded=new Set(records.map(r=>r.supersedes).filter(Boolean));
 const rows=records.filter(r=>!superseded.has(r.event_id));
 const title='FarmLog 내부 검토 초안'; const warning='합성 데이터 전용. 공식 인증서식 아님. 농약 등록·PLS·PHI·유기인증 등 외부 규정 미검증.';
 const generated_at=new Date().toISOString();
 const escape=v=>String(v??'미확인').replace(/[|\r\n]/g,' ');
 const markdown=`# ${title}\n\n${warning}\n\n생성: ${generated_at}\n\n| event_id | 작업일 | 필지 | 작물 | 작업 | 수량 | 단위 |\n|---|---|---|---|---|---|---|\n`+rows.map(r=>`| ${[r.event_id,r.worked_at,r.parcel_id,r.crop,r.work_type,r.amount,r.unit].map(escape).join(' | ')} |`).join('\n');
 return {title,warning,generated_at,rows,event_ids:rows.map(r=>r.event_id),markdown};
}
