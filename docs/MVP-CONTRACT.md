# FarmLog 검토용 MVP 계약 v0.1

2026-09-07. 사용자 요청에 따른 로컬 구현. 농가 실증 게이트 통과나 상용 앱 출시를 의미하지 않는다. 기존 PLAN/SSOT의 제품 범위·스택은 미래 후보로 보존한다. 이 파일은 이번 로컬 프로토타입의 기술 계약이다.

## 경계
- Node.js 내장 모듈만 사용, 서버는 127.0.0.1:8878 기본 바인딩.
- 인증 없는 단일 사용자 데모다. 합성 예시만 사용. 실제 주소·GPS·음성·사진·농가 데이터 입력 금지. 외부 API/LLM/STT/클라우드 호출 없음.
- AI 연동 전 결정론적 baseline. 규칙 기반 추출을 LLM 성능으로 표시하지 않는다.
- 농약 등록/PLS/PHI/유기인증 안전 판정 미구현. 모든 기록에 외부 규정 미검증 상태를 표시.
- 자율 제출·결제·약제 추천·시설 제어 없음. 서류는 공식 서식이 아닌 내부 검토 초안이며 사람 확인 전 내려받기 불가.
- 실제 데이터 도입 시 별도 동의·보관·권한·폐기 정책을 먼저 확정한다.

## 공통 HTTP JSON 계약
- GET /api/bootstrap → {mode:'synthetic-only', engine:'deterministic-baseline', fixtures:[{id,title,text}], parcels:[{id,name}], crops:[string], workTypes:[string], records:[Event], evaluations:object|null}
- POST /api/extract {fixtureId} → {draft:Draft,trace:[{agent,status,detail}]}
- POST /api/records {fixtureId, fields:{worked_at,parcel_id,crop,work_type,amount,unit}, reviewed:true, idempotencyKey:string, supersedes?:event_id} → {record:Event,duplicate:boolean}
- GET /api/records → {records:[Event]} (append-only 전체 이력)
- POST /api/report {reviewed:true} → {title,warning,generated_at,rows:[Event],event_ids:[string],markdown:string}. 최신 유효 레코드만 포함. 공식 인증서식 아님.
- GET /api/evals → 저장된 합성 평가 결과 JSON (평가 없으면 null). 브라우저에서 서버 셸 실행 불가.
- 오류 응답 {error:string}, 400/404/409/413 등.

Draft = {fixtureId,raw_input,worked_at:string|null,parcel_id:string|null,crop:string|null,work_type:string|null,amount:number|null,unit:string|null,missing:[string],warnings:[string],question:string|null,regulatory_status:'not_checked',source:'synthetic_text'}
Event = Draft 필드 + {event_id,created_at,supersedes:null|string,reviewed:true,idempotencyKey}. 사용자 확정값은 source:'human_reviewed_synthetic'로 구분 가능. 원문은 fixture에서 재조회, 클라이언트 원문을 신뢰하지 않음.
- 필수 필드 누락 상태로도 검토 후 저장 가능. completeness를 추출값에서 재계산. 안전 인증 완료로 바꾸지 않음.
- 정정은 기존 이벤트를 변경하지 않고 새 이벤트에 supersedes 연결. 이미 정정된 원본의 재정정은 409, 현재 최신 이벤트를 정정해야 함.
- 저장값은 날짜 검증, 필지/crop/work_type allowlist, 유한 양수 amount 또는 null, 단위 allowlist로 검증. 한 필지-작물 의미 자동 추정 금지.

## Core 모듈
src/core.mjs exports: fixtures, parcels, crops, workTypes, extractFixture(fixtureId), validateFields(fields), buildReport(records).
extractFixture returns {draft,trace}. 순수 함수, 네트워크 없음. 원문 불명확·복수 작업은 null+warning+질문 또는 사람 검토. 수치와 단위가 명시되지 않으면 추측 금지.

## UI
src/public/index.html, app.js, style.css. 탭: 현장 기록 / 검토 원장 / 사업 구상 / 검증실.
합성 예시 선택 → 추출 → 필수값 확인·수정 → 사람이 확인하고 저장. 원장 정정은 새 이벤트 생성. 내부 초안 버튼은 검토 체크박스 후 POST /api/report, 로컬 Blob 다운로드.
항상 합성 데모·실제 음성/사진/LLM 미연동·규정 미검증을 명시. 사용자 KPI 목표와 합성 테스트 측정 결과 분리.
사업 구상은 A,(데이터·AI), 9loop(농임산업 운영), FarmLog(공통 증빙 제품), 아빠채소(상품), 임. 大 공간(커뮤니티) 관계 시각화. 법인/소유권 확정으로 표현 금지.

## 보관
상태는 .local-data/verified/events.jsonl (git 제외); 합성 데이터만. 자동 삭제 없음. 테스트는 OS temp가 아니라 지정 FARMLOG_TEST_DIR 또는 테스트용 temp 폴더에 고유 파일 생성. 로그에 자격증명 없음.
