# 팜로그 기초 MVP 구축·운영·수정 가이드

기준일: 2026년 9월 18일 · 정본: 이 저장소의 코드와 검증 결과

## 1. 이 버전은 무엇인가

**농업인 반응형 웹 앱과 단일 농장 관리자 대시보드가 같은 영농 기록을 사용하는 로컬 MVP**다. 앱스토어용 네이티브 앱이나 상용 다농가 SaaS는 아니다. 목적은 서비스 흐름·화면·데이터 계약을 실제로 작동시키고, 이후 요구사항을 바꾸기 쉽게 만드는 것이다.

- 농업인: 홈 → 밭·작업 선택 → 상세 입력 → 확인·저장 → 내 기록 → 보완·정정.
- 관리자: 현황 → 검색·기간·필지·상태 필터 → 원문·정정 이력 → 보완 요청 또는 확인 완료.
- 연결: 같은 Node 서버의 같은 journal을 읽는다. 화면 간 복사나 이중 DB 동기화가 없다.
- `확인 완료`는 내부 업무 상태다. GAP·유기 인증, 농약 적합성, PLS, 공식 제출 완료를 의미하지 않는다.
- 기존 음성·사진·AI 앱은 `/`에 보존했다. 새 간편 입력은 모델 없이 작동한다. 음성·사진 기능을 새로 검증했다는 뜻은 아니다.

비유하면 농업인 앱은 수첩의 쓰기 화면이고, 대시보드는 **동일한 수첩을 펼쳐 보는 검토 책상**이다.

## 2. 빠른 실행

### 현재 실행 중인 최종 미리보기

2026-09-18 최종 확인 주소는 <http://127.0.0.1:51239/mvp>, <http://127.0.0.1:51239/admin>이다. 기존 8880뿐 아니라 작업 중간의 8881도 세션 신호 권한에 막혀 종료하지 못했다. 중간 서버에 최종 기능이 반영됐다고 주장하지 않는다.

최종 원장은 `.local-data/workspace-preview/`다. 이번 작업이 만든 합성 시연 원장만 보존 복사해 최종 코드로 열었다. 기존 사용자 원장은 복사하지 않았다.

```bash
# Mac: 정상 종료된 환경에서 최종 미리보기 재실행
cd ~/Documents/_work/farm-log
npm run preview
# 출력되는 임시 포트의 /mvp, /admin을 연다.
```

### 고정 포트의 격리 시연 환경

**실행 위치: Mac 터미널**

```bash
cd ~/Documents/_work/farm-log
npm run start:demo
```

- 농업인: <http://127.0.0.1:8881/mvp>
- 관리자: <http://127.0.0.1:8881/admin>
- 기존 음성·사진 UI를 같은 시연 원장으로 사용: <http://127.0.0.1:8881/>
- 저장소: `.local-data/workspace-demo/`
- 처음 실행하면 빈 원장이다. 시연 기록을 자동으로 넣지 않는다.
- 이번 검증에서는 별도 시연 원장에 `[합성 시연]` 기록을 화면에서 입력했다. 실제 농사 실적이 아니다.
- 서버가 이미 실행 중이면 위 링크를 연다. `EADDRINUSE` 또는 writer lock 오류가 나면 여러 개를 띄우지 않는다.
- 직접 터미널에서 실행했다면 `Ctrl+C`로 정상 종료한다. 단일 writer lock이 보존 이동된 뒤 다시 실행할 수 있다.

### 기존 원장에 새 화면을 적용

```bash
# Mac: 기존 프로세스가 정상 종료된 상태에서만 실행
cd ~/Documents/_work/farm-log
npm start
```

- `/mvp`, `/admin`, `/`가 **8880의 기존 `.local-data/farmer-app/` 원장**을 공유한다.
- 2026-09-18 작업 당시 8880 프로세스는 이 세션에서 종료 권한이 없어 재시작하지 않았다. 소스 변경이 구 프로세스에 자동 반영됐다고 간주하면 안 된다.
- 기존 8878 합성 검토실은 별도 서비스·별도 원장이다. 새 연결 관리자와 혼동하지 않는다.
- 원장을 두 서버에서 동시에 열지 않는다. 포트만 바꾸는 것으로 충돌을 피할 수 없다.

### 환경과 비용

- Node.js 22 이상 권장. 작업 환경에서는 Node.js 26.5.0 사용.
- 새 `/mvp`·`/admin`의 운영 경로는 Node 내장 모듈 + HTML/CSS/JavaScript뿐이다. `npm install` 없이 실행 가능하다.
- 외부 폰트·CDN·클라우드 API·분석 SDK를 사용하지 않는다.
- 새 직접 입력·검토 경로에는 LLM 호출이 없다. 구독 할당량·유료 API 비용을 발생시키지 않는다.
- 기존 `/`의 음성·OCR·Ollama는 별도 로컬 도구 설치가 필요할 수 있다. 자동 설치·다운로드하지 않았다.
- 선택적 브라우저 테스트만 Playwright가 필요하다. 앱 실행 의존성과 분리한다.

## 3. 파일 지도

```text
farm-log/
├── package.json
├── src/
│   ├── app-server.mjs             # HTTP 경로·보안·트랜잭션 연결
│   ├── app/
│   │   ├── store.mjs              # 스키마·유효성·원장·writer lock
│   │   ├── review.mjs             # 관리자 검토 상태와 충돌 검사
│   │   ├── template.mjs           # 기존 영농일지 CSV/인쇄 양식
│   │   ├── ai.mjs                 # 기존 로컬 AI adapter
│   │   └── media.mjs              # 기존 미디어 처리
│   ├── workspace/
│   │   ├── index.html             # 문서 shell, 한국어, 접근성 진입
│   │   ├── app.js                 # 앱 진입·공통 레이아웃·탐색
│   │   ├── shared.js              # API·escaping·표시·작업 선택지·CSV
│   │   ├── farmer.js              # 농업인 홈·입력·확인·기록·설정
│   │   ├── admin.js               # 대시보드·필터·검토·운영 CSV
│   │   └── styles.css             # 토큰·데스크톱·모바일·인쇄 스타일
│   ├── farmer/                    # 기존 음성·사진·AI UI, 보존
│   ├── server.mjs                 # 이전 합성 M0 서버, 별도
│   └── public/                    # 이전 합성 M0 UI
├── scripts/
│   ├── start-workspace-demo.mjs   # 격리 시연 서버, 8881
│   └── check-workspace-browser.mjs # 선택적 브라우저 시나리오
├── test/
│   ├── workspace-server.test.mjs  # 연계 API·재시작·충돌·보안
│   └── workspace-ui.test.mjs      # UI 렌더·빈값·escaping·필터
├── docs/                          # 기획·벤치마크·구축 정본
└── .local-data/                   # 런타임, git 제외
```

기존 `app-server.mjs`·`store.mjs`는 이전의 압축된 코드 스타일을 보존했다. 이번 작업에서 원장 전체를 전면 리팩터링하지 않았다. 새 화면과 검토 모듈은 역할별 일반 ES module로 분리했다. 이후 서버 가독성 개선은 **동작 변경 없는 리팩터링 PR**로 따로 수행하고 회귀 테스트를 유지하는 것이 안전하다.

## 4. 왜 이 기술을 선택했나

| 선택 | 현재 이유 | 나중에 바꿀 경계 |
|---|---|---|
| 반응형 웹 | 컴퓨터에서 곧바로 시연, 설치·심사·모바일 SDK 불필요 | 실제 기기 요구 확인 후 PWA 강화 또는 native shell |
| 기본 ES modules | 빌드 과정·프레임워크 버전·상태관리 도구를 늘리지 않음 | 화면 규모가 커지면 API 계약을 유지하고 React/Vue 등으로 교체 가능 |
| Node 내장 HTTP | 기존 검증된 서버·잠금·보안 경로 재사용 | HTTP routing을 교체하더라도 도메인 validation 유지 |
| append-only JSONL | 원본·정정·검토를 눈으로 추적하기 쉬움 | 다농가·검색·동시성 요구가 생기면 SQLite/PostgreSQL adapter |
| 명시적 사람 확인 | 잘못된 AI 초안이 사실로 저장되지 않게 함 | 모델을 바꿔도 최종 확인 게이트는 유지 |
| 모델 없는 입력 기준선 | AI 장애·지연과 무관하게 핵심 서비스 검증 | 동일 과업으로 AI 경로와 시간·정확도 비교 |

JSONL은 상용 DB의 대체재가 아니다. 파일이 커지면 시작 시 전체 재생과 조회 비용이 증가한다. 다중 서버·권한·백업·개인정보 정책이 필요한 순간에는 저장소 계층을 교체해야 한다.

## 5. 데이터 모델

### Profile: 현재 농장 설정

```js
{
  farm_name: '시험용 농장',
  parcels: [{
    id: 'house-3',
    name: '3번 하우스',
    aliases: ['3번집'],
    crop: '토마토',
    area_m2: null
  }]
}
```

최대 필지 10개. 필지명 변경은 과거 entry의 `parcel_name` snapshot을 소급 변경하지 않는다. 전화번호·이메일 등 일부 패턴은 이름 필드에서 거부하지만 **포괄적인 개인정보 탐지기가 아니다**. 메모에 개인정보를 넣지 않는 시연 운영이 전제다.

기획상 `산성2리/천태1리`를 기존 예시 필지에 자동 덮어쓰지 않았다. 실제 필지 ID·작목 확정은 별도 과업이다.

### Draft: 작업 초안

```js
{
  worked_at: '2026-09-18', // 필수, KST 달력 날짜
  parcel_id: 'house-3',   // 필수, 등록된 필지
  crop: '토마토',         // 필수
  work_type: '관수',      // 필수, 내부 vocabulary
  weather: null,
  area_m2: null,
  worker_count: null,
  duration_minutes: 30,
  inputs: [{
    action: 'use',        // use | purchase
    kind: 'fertilizer',   // pesticide | fertilizer | seed | other
    name: null,
    quantity: null,
    unit: null,
    dilution: null
  }],
  harvest_amount: null,
  harvest_unit: null,
  details: '[합성 예시] 30분 물 주기'
}
```

- 모르는 값은 `null`. 0은 ‘실제로 0이라고 입력한 값’이며 미기재와 다르다.
- 수확량/단위, 자재 수량/단위는 함께 입력하거나 함께 비운다.
- 작업인원은 0 이상의 정수. 숫자는 유한값·상한 검증을 거친다.
- `관수`는 화면에서 ‘물 주기’, `시비`는 ‘비료 주기’로 표현한다.
- 기존 복합 작업(`관수·제초`)은 정정 화면에서 임의로 제거하지 않는다.

### Session → Entry

Session은 임시보관·초안이다. 확정된 영농일지 건수에 포함되지 않는다. Entry는 Draft에 아래 정보가 추가된 확정 버전이다.

```js
{
  id, session_id, created_at,
  parcel_name,           // 기록 당시 필지명
  supersedes: null,     // 정정이면 이전 entry ID
  source_text,
  attachments,
  engine: 'manual',
  reviewed: true,       // 농업인의 확인
  regulatory_status: 'not_checked'
}
```

정정 원본의 사용자 입력은 유지된다. 현재 구조화된 값과 원문은 다를 수 있으며 상세·정정 이력에서 대조한다. 직접 입력의 원문에는 선택한 핵심 항목과 메모를 구분해 보존한다. 이후 필드 수정은 초안 변경 이벤트에 남고, 원래 source_text를 가짜 최신 발화로 덮어쓰지 않는다.

### Review: 관리자 내부 검토

```js
{
  id,
  entry_id,
  status: 'needs_changes', // checked | needs_changes
  note: '작업시간을 확인해 주세요.',
  created_at
}
```

Review 부재가 `pending`이다. `pending`으로 과거 기록을 지우는 endpoint는 없다. 현재 단일 로컬 시연에는 실제 reviewer 신원·권한 인증이 없으며 담당자 식별을 꾸며 넣지 않는다.

## 6. 상태·원장 규칙

```text
초안 → 농업인 확인 → 현재 기록(관리자 확인 대기)
                       ├─ 관리자 확인 완료
                       └─ 보완 요청 → 농업인 정정 초안
                                      → 새 Entry → 확인 대기
```

- Entry는 덮어쓰지 않는다. 새 entry가 `supersedes`로 이전 버전을 연결한다.
- 현재 집계에서는 정정된 구 버전을 제외한다. 과거 버전·검토 이벤트는 남는다.
- Review도 append-only다. 관리자 확인은 농업인이 작성한 작업 사실을 수정하지 않는다.
- `expectedReviewId`가 최신 검토 ID와 다르면 409. 오래 열린 관리자 화면이 최신 결정을 덮어쓰지 않는다.
- 날짜순이 아니라 원장 이벤트 순서로 최신 review를 결정한다.
- 단일 writer lock·직렬 트랜잭션·fsync를 유지한다. 쓰기 실패를 성공으로 표시하지 않는다.
- 손상 원장·남은 lock을 자동 삭제하지 않는다. 서버 종료 확인 후 보존·수동 점검 대상이다.

## 7. API 계약

동일 origin에서 JSON으로 호출한다. POST에는 서버가 허용한 정확한 `Origin`이 필요하다. 브라우저는 자동 전송한다.

| 메서드·경로 (`/api/app` 기준) | 사용처 | 결과 |
|---|---|---|
| GET `/workspace` | 새 앱·관리자 첫 조회 | profile, 현재 entries, 최신 reviews map, summary, pending 초안 |
| POST `/manual-sessions` | AI 없는 직접 입력·임시보관 | Session. `{draft, sourceText, requestKey?}` |
| POST `/sessions/:id/draft` | 초안 수정 | Session, draft.worked_at와 workedAt 동기화 |
| POST `/sessions/:id/confirm` | 농업인 확정 | `{entry,duplicate}` |
| GET `/entries/:id` | 상세 | entry, 정정 chain history, 해당 chain reviewHistory |
| POST `/entries/:id/correct` | 정정 시작 | 새 Session, supersedes는 서버 고정 |
| POST `/entries/:id/review` | 관리자 확인 | `{review}` |
| POST `/profile` | 시험 농장 설정 | `{profile}` |
| POST `/export` | 기존 자체 서식 출력 | CSV·인쇄 HTML·근거 event_ids |

### 직접 입력 생성

```js
await api('manual-sessions', {
  draft,
  sourceText: '[직접 선택한 항목] ...\n[직접 입력한 메모] ...',
  requestKey: 'client-uuid-session'
});
```

같은 생성 키·같은 payload는 같은 session을 반환한다. 키가 같은데 내용이 다르면 409. 키 없는 과거 클라이언트는 호환되지만 생성 멱등성을 보장하지 않으므로 새 UI는 반드시 키를 사용한다. 프론트는 응답이 유실된 생성 요청 본문을 메모리에 보존해 동일 요청을 먼저 복구한다.

### 농업인 확정

```js
await api(`sessions/${sessionId}/confirm`, {
  reviewed: true,
  idempotencyKey: 'client-uuid'
});
```

같은 확정 요청은 중복 저장 없이 같은 entry를 돌려준다. 확인 응답이 유실되면 입력 화면을 무작정 다시 쓰게 하지 않고 ‘저장 결과 확인’을 제공한다. 명시적 4xx 거부는 내용 수정으로 돌아갈 수 있다.

### 관리자 검토

```js
await api(`entries/${entryId}/review`, {
  status: 'needs_changes',
  note: '빠진 작업시간을 기억하시면 적어 주세요.',
  expectedReviewId: latestReview?.id ?? null
});
```

보완 요청 메모는 공백 불가, 최대 1,000자. 정정돼 더 이상 현재가 아닌 entry는 검토 거부. `checked`여도 `regulatory_status`는 변경하지 않는다.

### 오류

- 400: 입력 계약 위반, 날짜·짝이 맞지 않는 수량/단위 등.
- 403: Host·Origin·교차 사이트 차단.
- 404: 존재하지 않는 기록·정적 경로.
- 409: 이전 버전 정정·검토, 멱등 키 충돌, 최신 review 불일치.
- 413/415: 크기·MIME 제한.
- 500/503: 처리·저장 실패. 성공으로 간주하지 않는다.

## 8. 임시 입력과 오프라인 경계

새 `/mvp`의 작성 중 입력은 **현재 탭 메모리**에 보관한다. 화면 메뉴를 이동해도 이어서 쓸 수 있다. 페이지 새로고침·탭 종료를 견디는 자동 임시보관은 아직 없다.

‘임시보관’을 누른 경우에는 서버 Session으로 저장되며 홈의 이어서 쓰기에서 재개한다. 확인·저장 전에는 확정 일지로 집계하지 않는다. 기존 `/`의 IndexedDB 큐·재전송 기능이 새 UI에도 동일하게 있다고 주장하지 않는다.

- 새 UI는 서버 연결이 필요하다. 서버 종료 상태의 완전 오프라인 앱이 아니다.
- 기존 PWA manifest/service worker는 기존 `/`만 대상으로 한다. 새 UI의 설치형 PWA 완료를 선언하지 않는다.
- 현재 탭의 생성/확정 재시도 키도 메모리다. 브라우저 자체가 종료됐다면 서버 pending/기록부터 확인해야 한다.
- 더 강한 복구는 다음 단계에서 IndexedDB draft/outbox adapter로 분리하되, 기존 큐와 충돌하지 않게 설계한다.

## 9. 내보내기

두 CSV는 목적이 다르다. 같은 파일이라고 부르지 않는다.

| 경로 | 기준 | 열·용도 |
|---|---|---|
| 농업인 ‘기간·밭 기준 CSV’ | 선택 기간·필지, **모든 관리자 상태** | 기존 영농일지 양식 항목, 자재, 근거 ID |
| 관리자 ‘CSV 받기’ | 현재 검색어·필지·상태·기간 **전체 조건** | 운영 검토용, 확인 상태·최신 메모 포함 |

미기재는 `미기재`로 표시한다. 실제 0은 0이다. formula injection을 방지하도록 수식 시작 문자를 무력화하고 CSV quoting을 사용한다. 첨부 원본 파일은 CSV에 포함하지 않는다.

A4/PDF 출력은 기존 `/` 영농일지 화면을 이용한다. 새 간편 UI에 PDF 생성기를 추가하지 않았다. 출력물은 자체 재구성 양식이며 공식 제출 성공 증거가 아니다.

## 10. 디자인을 고치는 방법

### 문구

- 홈·버튼·입력 도움말: `src/workspace/farmer.js`
- 관리자 안내·표 머리글: `src/workspace/admin.js`
- 상태 명칭: `src/workspace/shared.js`의 `statusLabel`
- 하단 안내·탐색 메뉴: `src/workspace/app.js`

내용 문자열에 사용자 입력을 삽입할 때는 반드시 `esc()`를 통과시킨다. HTML 자체를 저장값으로 받아 출력하지 않는다.

### 색상·간격·글씨

`styles.css` 맨 위 `:root`가 디자인 토큰이다.

```css
:root {
  --bg: #f7f8f4;
  --surface: #ffffff;
  --ink: #283d32;
  --green: #345c46;
  --line: #e4e8df;
  --radius: 18px;
}
```

밝은 바탕은 이번 농업인 앱의 가벼운 인상 요구를 반영했다. Mac 전체의 다크 모드 설정은 바꾸지 않았다. 주요 입력 글씨 16px, 핵심 버튼 최소 48px, 필드명과 선택 상태를 색상 외 텍스트로 함께 표시한다. 일부 보조·관리자 캡션은 더 작다. 고령 농업인 사용성·WCAG 적합성은 실측 전이다.

### 작업 종류 추가

1. `src/app/store.mjs`의 `workTypes`에 내부 값을 추가한다.
2. `shared.js`의 `workChoices`에 내부 값과 쉬운 표시명을 추가한다.
3. 두 목록 일치 테스트를 실행한다.
4. 필요하다면 기존 AI 분류·출력·evals도 별도로 갱신한다.

화면의 버튼만 추가하면 서버가 거부한다. 반대로 서버만 바꾸면 화면에서 고를 수 없다. 이 계약을 테스트로 고정했다.

### 입력 필드 추가

1. `emptyDraft`·`validateDraft`에 필드와 null/자료형 규칙을 정한다.
2. frontend `emptyDraft`와 입력·요약 화면을 추가한다.
3. 기존 구 원장에 그 필드가 없는 경우의 호환·migration을 별도로 설계한다.
4. AI adapter, 출력 양식, regression, evals 라벨에 미치는 영향을 확인한다.
5. 과거 원장을 직접 일괄 덮어쓰지 않는다.

작은 MVP이므로 backend/frontend 타입을 일부 중복 선언했다. shared schema generator나 복잡한 monorepo를 먼저 넣지 않았다. 스키마가 커지면 순수 JSON schema 모듈을 공통 정본으로 승격할 수 있다.

## 11. 검증 명령과 완료 기준

**실행 위치: Mac 터미널**

```bash
cd ~/Documents/_work/farm-log
npm test
npm run eval
```

`npm test`는 Node 테스트다. `npm run eval`은 기존 합성 사례 평가이며 농업인 사용성·실제 STT 품질 검증이 아니다. 실행 시 평가 증거 파일이 갱신될 수 있으므로 비교 목적을 먼저 정한다.

선택적 브라우저 회귀 스크립트:

```bash
# 개발 환경에 Playwright가 준비돼 있는 경우만
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
CHROME_BINARY='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node scripts/check-workspace-browser.mjs
```

사용자 Chrome 프로필에 연결하지 않고 별도 headless 프로필·별도 임시 원장을 사용한다. `FARMLOG_TEST_DIR`, `FARMLOG_SCREENSHOT_DIR`로 보관 위치를 지정할 수 있다. 이번 세션에서는 headless Chrome 실행이 권한 제약으로 SIGABRT/EPERM으로 차단됐다. 스크립트 작성과 실제 성공을 구분한다.

실제 검증 결과·테스트 수·미검증은 [검증 기록](../evidence/WORKSPACE-VERIFICATION.md)이 정본이다.

핵심 수용 조건:

- [ ] 농업인 저장이 관리자에서 같은 entry ID로 보인다.
- [ ] 보완 요청은 농업인 상세에 보이며 원문을 바꾸지 않는다.
- [ ] 정정본은 새 ID이며 기존 버전·검토가 남는다.
- [ ] 현재 건수는 원본+정정본을 중복 집계하지 않는다.
- [ ] 중복 생성/확정·동시 검토가 이중 기록·조용한 덮어쓰기를 만들지 않는다.
- [ ] 잘못된 날짜·빈 필수값·짝 없는 수량을 저장하지 않는다.
- [ ] 실제 휴대폰에서 큰 글씨·터치·스크롤·키보드를 검증한다.

마지막 항목은 코드 렌더 테스트로 대신할 수 없다.

## 12. 보안·운영 한계

### 유지한 방어

- loopback `127.0.0.1`만 bind. 기본 8880, 격리 시연 8881, 테스트·미리보기 임시 포트 0만 허용.
- Host allowlist, 같은 Origin POST, cross-site 요청 차단.
- CSP·no-store·nosniff·frame 차단·정적 파일 allowlist.
- 출력 escaping, CSV 수식 방어, 원장 파일 권한과 단일 writer.
- 규제 상태는 `not_checked`. 알려지지 않은 사실은 생성하지 않음.

### 아직 없는 것

- 로그인, 사용자/관리자 인증, RBAC, farm tenant 격리.
- 개인정보 동의·보관기한·삭제·감사주체·복구 정책.
- 인터넷 배포, HTTPS, 다중 서버, 장애 복구, 서버 백업 자동화.
- 실제 모바일 기기·Safari·PWA 설치·완전 오프라인 검증.
- 외부 농약/기상 API, 공식 인증서식 연결, 자동 제출.

Origin 검사는 사용자 인증이 아니다. 같은 컴퓨터에서 요청을 만들 수 있는 프로세스는 관리 API에 접근할 수 있다. `/admin`이라는 URL은 권한 경계가 아니다. 외부 터널·공유기로 이 서버를 공개하지 않는다.

신규 review/manualRequest 이벤트가 기록된 원장은 이전 코드에서 읽지 못할 수 있다. **이전 코드로의 단순 rollback은 보장하지 않는다.** 업데이트 전 정상 종료·원장 보존 백업이 필요하며, 구 버전에 맞추려고 원장의 새로운 이벤트를 삭제하지 않는다.

## 13. 다음 개발은 하나씩

1. 이번 기초 화면으로 **합성 기록 1건의 입력·보완·정정 흐름을 저스팀이 직접 시연**한다.
2. 문구/작업 종류/필수값을 수정하고 동일 회귀 테스트를 통과시킨다.
3. 실제 농가 데이터 처리 정책과 필지·서식이 정해진 뒤 사용성 파일럿을 설계한다.
4. 실제 배포가 필요해질 때 인증·농가 격리·DB·HTTPS를 함께 설계한다.

기존 5농가 중 3명 참여 게이트, 입력 20초 이하, 필수4필드 95%·전체 90% 기준은 **목표**다. 이번 구현·합성 테스트를 현장 성과로 바꾸어 쓰지 않는다. 다른 L1 프로젝트 확장 없이 FarmLog의 동일 과업 하나를 먼저 검증한다.
