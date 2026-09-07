# 농민용 FarmLog 앱 v1 계약

2026-09-07 사용자 정정 요청에 따른 제품 중심 재설계. 근거: `_etc/tmp/farm-log-claude-project/01,08,09,10,11,13` 및 사용자 현재 발언. 기존 M0는 검토/회귀 자산으로 보존하고 농민용 주 화면으로 사용하지 않는다.

## 제품 목표
홈에서 말/사진/대화로 자유롭게 기록 → 실제 로컬 AI 구조화 → 한 번에 한 보완질문 → 농민 확인 → 영농일지 양식 자동작성/기간조회/인쇄. 코드 안전 판정은 제품 뒷단이다.

## 런타임
- 새 서버 `src/app-server.mjs`, 로컬 127.0.0.1:8880, `.local-data/farmer-app/`로 기존 서버와 원장 완전 분리. Node 내장모듈.
- 새 UI `src/farmer/{index.html,app.js,style.css,manifest.webmanifest,sw.js,icon.svg}`. 모바일 우선 설치형 PWA. 네이티브 앱스토어 출시 아님.
- 모델: localhost Ollama qwen3:4b 기본. /api/tags와 /api/show로 모델 설치/remote_host·remote_model 부재를 검사. cloud 이름/remote 메타 존재 모델 거부. 자동 모델 다운로드 금지.
- 최종 OCR은 Tesseract.js 7 한국어/영어 WASM worker, STT는 브라우저 Transformers.js 3.8.1 / Whisper tiny multilingual q8 WASM worker다. Swift Vision/MLX native 실행 실패는 증거로 보존하며 보안 설정을 우회하지 않았다. 공개 패키지/모델의 명시적 setup 다운로드만 허용하고 런타임 입력은 외부서비스에 보내지 않는다. browser Web Speech는 사용하지 않는다.
- 사용자가 선택하는 비민감 시험 입력만, 첫 시작에 로컬 처리·원문/미디어 보관 안내. 기존 개인정보·실농가 자료 자동 유입 금지. 실제 농가 운영정책/다중사용자 권한은 아직 별도.
- 마이크 권한은 사용자 버튼 클릭 시만 요청. Assistant 테스트는 마이크를 켜지 않고 공개 Google FLEURS 한국어 음성(CC-BY-4.0)과 합성 sine WAV를 사용했다. 공개 음성 정확도는 농업 용어 정확도가 아니다.
- 원본 미디어는 runtime에만 보관(git 제외), 개인정보/정확주소/GPS 자동 추출 금지. 사진 EXIF는 모델에 보내지 않는다.

## HTTP 계약 (모든 JSON 오류 {error:string}, no false success)
### GET /api/app/bootstrap
`{today,profile:{farm_name,parcels:[{id,name,aliases:[string],crop:string|null,area_m2:number|null}]},capabilities:{llm:{available,model,detail},ocr:{available,detail},stt:{available,detail}},entries:[Entry],pending:[{id,updated_at,preview}],template:{id,title,source_url,note}}`
처음 profile: farm_name='나의 농장', parcels 2개(3번 하우스 토마토/윗밭 고추) 예시 설정임을 UI 표시. 사용자가 직접 바꾸기 가능. 실제 가족 필지 아님.
### POST /api/app/profile
`{farm_name,parcels:[{id?,name,aliases,crop,area_m2}]}` → `{profile}`. 로컬 별칭만, 10필지 이하. 기존 기록 필지명 snapshot 보존.
### POST /api/app/media
`{kind:'photo'|'audio',mime:string,base64:string,transcriptCandidate?:string,transcriptEngine?:'whisper-tiny-q8-wasm-local'}` → `{media:{id,kind,mime,url,ocrText:string|null,transcript:string|null,processing:'ready'|'unavailable'|'failed',detail:string}}`
최대 photo 8MB/audio 16MB decoded, MIME magic 검증, uuid 서버이름만. display URL `/api/app/media/:id` 같은 origin. JSON 최대24MB, 잘못된 base64 거부. 텍스트 OCR과 STT 처리 실패해도 원본첨부 유지·불가 사유 명시. 브라우저 STT의 원본 후보는 `transcriptCandidate/transcriptEngine`으로 감사용 보존하지만 구조화 context에는 넣지 않는다. 인식 후보가 대화 입력창에 반영된 뒤 사용자가 확인·수정해 보낸 `text`만 구조화한다. 따라서 원본 인식 오류가 사용자의 수정 글을 덮어쓰지 않는다. OCR 자동값은 사용자의 작업 진술로 확정하지 않음. OCR에 수확일/라벨이 있어도 작업 실제 사용여부 질문.
### POST /api/app/sessions
`{text:string,attachmentIds:[id],workedAt:YYYY-MM-DD}` → Session. text/attachment 중 하나 필요. workedAt은 화면에서 선택한 작업일 컨텍스트.
### POST /api/app/sessions/:id/messages
`{text:string,answerField?:string}` → Session. answerField은 현재 question.field인 경우만 허용; 명시선택값으로 그 필드 처리. 자유대화는 전체 대화맥락으로 재추출하되 이전 확정값 보존·사용자 정정 우선.
### POST /api/app/sessions/:id/draft
`{draft:Draft}` → Session. 최종 확인화면 직접 수정. 서버 schema 검사.
### POST /api/app/sessions/:id/confirm
`{reviewed:true,idempotencyKey:string,supersedes?:entry_id}` → `{entry:Entry,duplicate:boolean}`. 필수4필드 미충족 시 400, 세션은 임시보관 유지. 같은key동일payload재시도 중복거부. 원문/미디어는 세션 정본에서만 가져옴.
### GET /api/app/sessions/:id → Session
### GET /api/app/entries?from=YYYY-MM-DD&to=YYYY-MM-DD&parcel_id=... → {entries:[Entry]}
최신 유효 이벤트만. 원본은 session/raw/정정 링크에 보존. GET /api/app/entries/:id → {entry,history:[Entry]}.
### POST /api/app/entries/:id/correct
`{}` → Session (원본을 복사해 직접 수정 가능, supersedes 서버고정).
### POST /api/app/export
`{from,to,parcel_id?:string,reviewed:true}` → `{title,template,entries:[Entry],event_ids:[string],csv:string,html:string}`
기간/필지 최신유효 데이터. html은 서버가 escape한 A4 인쇄용 양식. CSV formula injection 방어. 사용자는 브라우저 인쇄/PDF저장 가능. 자동제출 없음.

## Session
`{id,workedAt:YYYY-MM-DD,messages:[{role:'user'|'assistant',text,created_at}],draft:Draft,question:{field,text,options:[{label,value}]}|null,clarificationCount:number,engine:'ollama:qwen3:4b'|'local-fallback',warnings:[string],attachments:[Media],ready:boolean,updated_at,supersedes?:id}`
필수 보완 질문 우선순위 work_type → parcel_id → crop, worked_at. 1회1질문 최대2턴. 그 뒤 question=null, ready=false, '확인화면에서 보완하거나 임시보관'. 스킵 메시지 허용, 입력은 잃지 않음.
AI는 자유대화를 농사기록으로 구조화한다. AI가 model unavailable/timeout/malformed 실패하면 로컬 deterministic fallback임을 명시. 채팅과 초안은 보존. 사라지거나 성공처럼 표시하지 않음.

## Draft
`{worked_at:string|null,parcel_id:string|null,crop:string|null,work_type:string|null,weather:string|null,area_m2:number|null,worker_count:number|null,duration_minutes:number|null,inputs:[{action:'purchase'|'use',kind:'pesticide'|'fertilizer'|'seed'|'other',name:string|null,quantity:number|null,unit:string|null,dilution:string|null}],harvest_amount:number|null,harvest_unit:string|null,details:string}`
필수4 = worked_at,parcel_id,crop,work_type. work_type 기본 파종/정식/관수/시비/방제/제초/적심/수확/출하/자재구매/기타. 복수작업은 details에 모두 보존하고 work_type='관수·제초'처럼 중점표 조합 허용. 관수30분은 duration_minutes로, 수확10kg은 harvest_amount/unit로. inputs는 농약/비료 사용/구입 구분. OCR 제품명 발견=사용 사실 아님. 입력에 없는 인원/날씨/수량은 null. 모르는값을 0으로 채우지 않음.
Entry = Draft + `{id,session_id,parcel_name,created_at,supersedes,source_text,attachments:[Media],engine,regulatory_status:'not_checked',reviewed:true}`.

## 코드 경계
- `src/app/ai.mjs` exports async `capabilitiesAI()`, async `extractDraft({text,profile,workedAt,previousDraft})` → `{draft,engine,warnings}`. 모델 호출은 여기만, 네트워크 localhost만. `emptyDraft(workedAt)` export.
- `src/app/media.mjs` exports async `mediaCapabilities() → {ocr:{available,detail},stt:{available,detail}}`, async `processMedia({kind,mime,buffer,storageDir}) → {mime,buffer,ocrText,transcript,processing,detail}`. 이 함수엔 입력파일 이름/경로 없음. helper scratch storageDir에서 고유 생성, 삭제 금지. Node 서버는 returned buffer를 UUID filename 저장해 media registry 생성.
- `src/app-server.mjs` exports async `createFarmerServer({dataDir,port?,ai?,media?})`. tests injection용 ai/media 사용가능. 함수를 호출한 뒤 server.listen(port,'127.0.0.1') 패턴 허용, 공용IP 금지. 다른 파일 변경 중인 M0 src/core.mjs/server.mjs는 재사용/수정 안 함.

## 참고 서식 (실제 PDF 이미지 확인)
농식품부 2021 영농일지 작성예시 https://www.mafra.go.kr/bbs/gong/447/327120/artclView.do . 필드: 작업일, 필지, 작목, 날씨, 농약/비료 구입(종류·제품명·구입량), 농약/비료 사용(종류·제품명·사용량), 작업단계(작업명), 세부 작업내용(살포량·면적·희석배수·농기계·인력 등).
`정부 작성예시 항목을 반영한 FarmLog 영농일지`로 렌더링. 공식 고정 서식/인증 심사 통과 보장 아님. 사용하지 않은 자재는 '기록 없음'이 아니라 '미기재'; 원문에서 미사용이라고 명시한 경우 details로 표시.

## UI 원칙
작은 주의문은 유지하되 합성/검증 용어가 홈을 지배하지 않음. 홈 hero '오늘 농사, 말로 남겨요.' 큰 마이크 CTA, 사진 CTA, 대화입력 CTA. 농민용 모바일 앱폭(max 520px) + 바깥 데스크톱 배경, 본문18px 터치56px. 내 농장 설정, 최근일지, pending. 대화bubble+첨부미리보기+빠른선택+현재초안 접기. 마지막 '영농일지로 만들기' → 양식확인 → '확인하고 저장'. 일지 목록 기간/필지필터·상세·정정·A4인쇄/CSV. 사업구상/검증실은 별도 관리자 링크(기존8878)로 후순위.

## 로컬 임시 큐
브라우저 IndexedDB에 미전송 텍스트·작업일·첨부를 임시보관, 연결복구 후 사용자 '다시 보내기'로 서버 처리. Service Worker는 앱 shell만 캐시하고 API/미디어/LLM 응답은 캐시하지 않음. 개인정보가 브라우저에 남는다는 안내. 로그아웃/삭제 및 다중 사용자 정책 전 실농가 서비스 공개 금지.

## 추가 공식 서식 확인
농식품부 `공익직불제 영농일지` https://mafra.go.kr/bbs/gong/447/565634/artclView.do 에서 표준 13p/간편11p PDF를 실제 다운로드했다. 표준 PDF 2p 작성안내와 3p 빈 서식의 작업일·필지·작목·날씨·농약/비료 구입/사용·작업단계·세부작업내용이 위 계약과 일치함을 텍스트로 확인했다. 최신년도/의무요건은 이 게시물만으로 단정하지 않으며, 앱 서식은 이 항목을 반영한 자체 재구성 양식으로 표시한다. 연락처·정확주소는 앱 수집 필수에서 제외한다.

## WASM 정적 자산·실측 경계
- `/speech-local.js`는 전용 worker 겸 브라우저 adapter. `/speech-assets/*`는 설치 manifest의 `assets[].path`만 GET/HEAD 허용하며 realpath 경계를 확인한다. 다운로드 원본/임의 로컬 파일은 제공하지 않는다.
- CSP는 self-origin 및 `wasm-unsafe-eval`만 허용한다. JS `unsafe-eval`, 클라우드 모델, 외부 runtime fetch는 허용하지 않는다.
- 음성은 16MB/180초, mono 16kHz로 변환, 전용 worker 취소/180초 timeout. all-zero 무음만 거부하며 VAD는 아니다. 잡음에서 hallucination이 가능하다.
- 서버의 native STT capability=false와 브라우저 모델 파일 준비 여부는 별개다. UI는 브라우저 readiness를 표시하며 이것이 인식 정확도 검증을 뜻하지 않는다.
- 개발 모드는 파일 몇 개의 mtime만 polling하고 자체 child에 IPC 정상 종료를 요청해 writer lock을 보존 해제한다. 재귀 fs.watch는 이 환경에서 EMFILE 실패했기 때문에 쓰지 않는다.
- 실측과 잔여 미검증은 `../evidence/FARMER-APP-VERIFICATION.md`가 정본이다.
