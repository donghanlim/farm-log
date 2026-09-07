# FarmLog M0 검증 기록

2026-09-07 KST · 로컬 합성 데이터 전용 · Node.js v26.5.0

## 최종 결과

- `node --test`: **77개 / 77개 통과**, 실패 0. 부모 세션에서 최종 서버 경로·포트 수정 뒤 재실행.
- `node eval/run.mjs`: **합성 fixture 30개**, 사례 완전일치 30/30, 필드 비교 210/210, 데이터 처리 규칙 검사 210/210.
- **in-sample 결정론적 회귀 테스트**다. 구현에 사용한 고정 합성 예시를 expected와 비교한 것으로 held-out·LLM·농민 발화·농약 안전 정확도 검증이 아니다.
- 브라우저에서 정상 예시 선택→추출→사람 확인→저장 성공 확인.
- 20 L 기록을 21 L로 정정하여 최신 1건·전체 이력 2건, 원본 20 L 보존 확인.
- 내부 Markdown 다운로드 요청 응답에서 최신 근거 이벤트 1개 확인. 공식 양식 아님. 브라우저 다운로드 동작은 확인했으나 사용자 다운로드 폴더의 최종 파일까지 별도 검증하지는 않음.
- 사업 구상 탭 및 검증실의 실제 30 / 210·210 카드 표시 확인.
- 최종 서비스는 `http://127.0.0.1:8878/`, 상태는 `.local-data/verified/events.jsonl`.

## 재현

Mac:
```bash
cd /Users/justimmacbook/Documents/_work/farm-log
node --test
node eval/run.mjs
node src/server.mjs
```

테스트 임시파일은 세션 tmp 아래 고유 경로에 보존한다. 외부 환경에서는 `FARMLOG_TEST_DIR`로 쓰기 가능한 테스트 경로를 지정한다. 코드 배포·git push·외부 API·사업 신청·유료 결제는 하지 않았다.

## 시험 범위

- ISO 날짜·윤년·미지원 작목/필지·복수 작업·수량·음수·단위 누락 baseline.
- 필드 allowlist, 누락값 null, 원문 fixture 재조회, 규정 상태 덮어쓰기 거부.
- reviewed 엄격 boolean, 저장 및 보고서의 사람 확인 계약.
- append-only 정정, 최신 유효 이벤트만 보고서 포함, 동일 idempotency key 재시도.
- 같은 key 다른 payload의 409, 동시 중복 저장/정정의 직렬화.
- 재시작 원장 복구, 잘린/손상 원장 fail-closed, UUID·ISO metadata 검증.
- Host/Origin/Sec-Fetch-Site·JSON content-type·64KB 제한·경로탈출·static symlink 보호.
- 실제 별도 Node 프로세스가 같은 원장에 접근할 때 차단.
- 잠금 정상 종료 보존·stale 잠금 자동탈취 금지·중복 close 보호·시작 실패 잠금 보존.
- UI 지표에 실제 0개 통과도 `0 / 전체`로 표시해 실패를 '미확인'으로 숨기지 않음.
- HTML ID 중복·단위 select 일치·위험한 HTML sink/외부 리소스 URL 부재.

## 독립 검토와 조치

읽기 전용 code reviewer가 기능 작성자와 분리해 검사했다.

| 발견 | 처리 |
|---|---|
| 다중 서버의 같은 원장 쓰기로 중복/정정 분기 가능 | **수정**: exclusive writer lock 및 실제 프로세스 충돌 테스트 |
| 원장 event_id·created_at 검증 느슨함 | **수정**: UUID 및 ISO timestamp 계약 강화 |
| Host/Origin은 인증 아님 | 현재 합성·단일 사용자 경계 명시. 실제 데이터 전 계정·권한 필수 |
| 새 key로 같은 기록 보내면 새 event 생성 | 의도한 이벤트 원장 의미. 실제 두 번 같은 작업일 수 있어 내용 기반 자동 병합하지 않음. 세션 넘는 재시도 키 지속은 후속 과제 |
| 기존 파일 mode를 생성 옵션만으로 강화 못함 | 최종 runtime 디렉터리 0700·파일0600 설정. 실데이터/다중사용자 도입 전 권한 audit 필요 |
| 수량/단위의 독립 null 허용 | M0 선택 필드 정책. warnings를 표시, 농업 의미상 완결성 검증은 아님 |
| 평가 evidence/evals.json은 재실행 시 덮어쓰기 | 최신 평가 정본. 감사용 불변 산출물/commit 스냅샷은 후속 운영 과제 |

## 런타임 분리 사유

이전 개발 서버 8877을 종료하려 했으나 도구에서 프로세스 조회·종료 권한이 거부됐다. 이전 원장을 공유하지 않도록 **최종 서버 8878 + 별도 `.local-data/verified/`**로 전환했다. 초기 합성 기록 두 개만 복사했다. 이전 개발 서버가 종료됐다고 주장하지 않는다. 이전 8877 UI는 사용하지 않는다. 운영/상용 배포 때 이런 수동 runtime 분리가 아니라 정상 process manager와 종료·재시작 절차가 필요하다.

## 미검증 및 실사용 차단

- [blocked] 실제 농가 데이터·정답·서식: 농가 제공·확인본 없음.
- [blocked] 동의·보관·삭제·다중농가 접근권한: 정책/구현 필요. localhost라서 실데이터에 안전하다고 보장하지 않음.
- [blocked] 실제 STT·LLM·사진·GPS·센서: 서비스/모델/처리방식·예산 선택 및 승인 필요.
- [blocked] 농약 등록·취소·PLS/PHI·유기농 판정: API 권한·원본·버전·갱신과 전문 검토 필요.
- [blocked] 공식 행정서류: 기관 서식과 수용성 검증 필요.
- [blocked] 현장 모바일/오프라인: 브라우저 1425×900 데스크톱에서 확인. 반응형 CSS는 구현했으나 390px 실기기·오프라인 동기화·장갑 사용 테스트는 미실시. 브라우저 도구에서 viewport 변경 미지원.
- [blocked] 수요·지불·리텐션·수익성·해외 적합성: 고객 실증 필요.

현재 판단은 **검토용 로컬 M0 기술 게이트 통과**, **실농가 파일럿 출시는 아직 불가**다. 2주 5농가/3명 지속 게이트는 그대로 유지한다.

## 증거 파일

- `tests-core.txt`: 최초 64개 테스트 결과(이력).
- `tests-final.txt`: 잠금·UI 포함 77개 테스트 결과.
- `evals.json`: 30개 합성 회귀 결과·사례별 기대값과 실제값.
- 세션 tmp `farm-log-parent-final-tests.txt`: 부모 최종 재실행 원본.
- 세션 tmp `farm-log-business-proof.png` 및 최종 UI 캡처: 실제 브라우저 확인 자료. 개인정보 포함 실제 농가 자료는 없음.
