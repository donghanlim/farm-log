import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';import path from 'node:path';import {isDeepStrictEqual} from 'node:util';
import {fixtures,extractFixture,validateFields} from '../src/core.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cases=(await readFile(path.join(root,'eval/cases.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
if(cases.length<25||new Set(cases.map(c=>c.id)).size!==cases.length)throw new Error('At least 25 unique cases required');
const fieldNames=['worked_at','parcel_id','crop','work_type','amount','unit','missing'];
let fieldPassed=0;let safetyPassed=0;let safetyTotal=0;
const results=cases.map(c=>{
 const started=performance.now();const {draft,trace}=extractFixture(c.id); // Actual implementation invocation, not expected-output replay.
 if(!fieldNames.every(k=>Object.hasOwn(c.expected,k)))throw new Error('Incomplete golden case: '+c.id);
 const comparisons=fieldNames.map(field=>({field,expected:c.expected[field],actual:draft[field],passed:isDeepStrictEqual(c.expected[field],draft[field])}));fieldPassed+=comparisons.filter(c=>c.passed).length;
 const safety=[
  {check:'regulations_never_marked_verified',passed:draft.regulatory_status==='not_checked'},
  {check:'synthetic_source_and_original_fixture',passed:draft.source==='synthetic_text'&&draft.raw_input===fixtures.find(f=>f.id===c.id)?.text},
  {check:'human_gate_in_trace',passed:trace.some(t=>t.agent==='human-review'&&t.status==='required')},
  {check:'required_nulls_recomputed',passed:isDeepStrictEqual(draft.missing,['worked_at','parcel_id','crop','work_type'].filter(k=>draft[k]===null))},
  {check:'null_values_not_fabricated',passed:fieldNames.filter(k=>c.expected[k]===null).every(k=>draft[k]===null)},
  {check:'privacy_fields_absent',passed:!['gps','address','farmer_name','audio','photo'].some(k=>Object.hasOwn(draft,k))},
  {check:'allowlist_validation',passed:(()=>{try{validateFields(Object.fromEntries(fieldNames.filter(k=>k!=='missing').map(k=>[k,draft[k]])));return true;}catch{return false;}})()}
 ];safetyPassed+=safety.filter(s=>s.passed).length;safetyTotal+=safety.length;
 return {id:c.id,accuracy_passed:comparisons.every(c=>c.passed),safety_passed:safety.every(c=>c.passed),comparisons,safety,duration_ms:Number((performance.now()-started).toFixed(3))};
});
const report={generated_at:new Date().toISOString(),mode:'synthetic-only',engine:'deterministic-baseline',scope:'고정 합성 텍스트 30종의 규칙 기반 추출 회귀 평가. 실제 API/LLM/STT 호출 없음.',limitations:['합성 fixture를 바탕으로 개발한 in-sample 회귀 검사이며 holdout 또는 실제 농가 일반화 성능이 아님','음성·사진·LLM 정확도, 실사용 KPI, 농약 등록·PLS·PHI·유기인증 안전성 미검증','안전 점수는 데이터 처리 규칙 검사이며 농작업 안전 인증이 아님'],cases:cases.length,unique_fixtures:new Set(cases.map(c=>c.id)).size,accuracy:{passed:results.filter(r=>r.accuracy_passed).length,total:cases.length,field_passed:fieldPassed,field_total:cases.length*fieldNames.length,rate:fieldPassed/(cases.length*fieldNames.length)},safety:{passed:safetyPassed,total:safetyTotal,rate:safetyPassed/safetyTotal},results};
await writeFile(path.join(root,'evidence/evals.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({mode:report.mode,engine:report.engine,cases:report.cases,accuracy:report.accuracy,safety:report.safety,limitations:report.limitations},null,2));
if(results.some(r=>!r.accuracy_passed||!r.safety_passed))process.exitCode=1;
