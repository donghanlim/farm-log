# farm-log · 팜로그

| 항목 | 값 |
|---|---|
| 슬러그 | `farm-log` |
| 구역 | _work |
| 로컬 | `/Users/justimmacbook/Documents/_work/farm-log` |
| GitHub | `donghanlim/farm-log` |
| 상태 | 농민용 로컬 AI 앱 v1 · 실제 농가 검증 전 |
| 최종 갱신 | 2026-09-07 |

## 현재 상태

기존에는 기획 문서 8개 tracked 파일만 있었고 실행 코드·실제 영농 데이터·라벨셋은 없었다. 2026-09-07 사용자 요청으로 통합 사업 구상 및 로컬 M0를 구현했다. **Phase 0의 5농가 중 3명 지속 게이트 통과나 상용화 완료를 뜻하지 않는다.**

- **주 앱 8880**: 말·사진·글 → 인식 원문 확인 → 실제 로컬 AI 대화/보완질문 → 영농일지 확인·저장 → 조회·정정·A4/CSV 출력.
- Ollama `qwen3:4b` 구조화, 브라우저 Whisper tiny q8 WASM 한국어 STT, Tesseract.js WASM 한국어/영어 OCR. 인식 결과는 틀릴 수 있으므로 자동 확정하지 않는다.
- 사진 OCR은 참고자료다. 사진만으로 실제 농작업·농약 사용·안전을 판정하지 않는다. 세부 작업내용은 발화·정정 원문을 보존하므로 출력 전 직접 다듬을 수 있다.
- 브라우저 미전송 입력/음성/사진은 IndexedDB에, 서버 기록은 `.local-data/farmer-app/`에 저장한다. 모델·미디어는 git 제외. 비민감 시험 입력만 사용한다.
- **기존 관리자 M0 8878 보존**: 30개 합성 예시, 규칙 기반 추출, append-only 검토 원장, 내부 Markdown 초안, 회귀 평가. 농민용 앱과 데이터 저장소를 분리했다.
- 외부 API·농약 판정·공식 인증서식·자동 제출·농가별 인증/권한·실농가 서비스 운영은 미구현.
- A,(데이터·AI), 9loop(농임산업 운영), 아빠채소(첫 상품), 임. 大 공간(커뮤니티)의 역할 구조를 제안했다. 법인·소유권·신규 WIP 확정은 아니다.

## 실행 (Mac)

Node.js 22 이상 권장, 이 작업에서는 Node.js 26.5.0으로 검증했다. 서버 자체는 Node 내장모듈을 사용하고 OCR/STT 패키지·모델은 프로젝트 `.local-data/farmer-app-tools/`에 격리한다.

```bash
cd /Users/justimmacbook/Documents/_work/farm-log
npm start
# 코드 변경 시 정상 종료 후 다시 시작하는 개발 모드: npm run dev
# 이전 관리자 검토실: npm run start:lab
```

주 앱: <http://127.0.0.1:8880/>. 이전 검토실: <http://127.0.0.1:8878/>. loopback만 바인딩한다. 이미 실행 중이면 새 서버를 띄우지 말고 위 페이지를 연다. 같은 원장에는 파일 잠금으로 서버 하나만 허용하므로 포트만 바꾸어 동시에 실행할 수 없다. 자동 시작·외부 공개 서버는 아니다.

```bash
# Mac: 회귀 및 평가 재현
node --test
node eval/run.mjs
```

테스트 임시 경로는 `FARMLOG_TEST_DIR`로 지정 가능. 기본 테스트 경로는 test/server.test.mjs에 명시된다. 원장 손상은 자동 삭제·복구하지 않고 시작을 거부한다. `.writer.lock`은 정상 종료 시 고유 `released-*` 파일로 보존 이동된다. 비정상 종료로 남은 잠금은 자동 탈취하지 않는다. 모든 작성 서버의 종료를 확인한 뒤 관리자가 잠금을 고유 백업 경로로 이동해야 한다. 다중 서버의 동일 원장 쓰기는 거부되며 상용 백업/복구는 지원하지 않는다.

OCR/STT 파일이 없는 새 환경에서는 `npm run setup:ocr`, `npm run setup:speech`를 명시 실행한다. 무료 공개 패키지·모델을 최초 다운로드한다. 런타임 입력은 외부 전송하지 않는다. LLM은 이미 설치된 로컬 `qwen3:4b`를 검사하며 자동 다운로드하지 않는다. 모델 파일이 없거나 인식이 실패하면 직접 글로 보완한다. 인터넷 없이 처리하려면 로컬 서버와 모델 파일이 있어야 하며, 서버 종료 상태의 완전한 STT 오프라인 앱은 아니다.

이번 세션의 이전 개발 서버(8877)는 도구의 프로세스 종료 권한 제한으로 종료를 확인하지 못했다. 최종 버전은 **8878 + `.local-data/verified/`**로 분리했고 초기 합성 정정 이력 2건만 복사했다. 8877의 이전 개발 UI는 사용하지 않는다.

## 상세 설계와 증거

- [전체 사업 구상·수익·국내외 확장](docs/GLOBAL-BUSINESS-BLUEPRINT.md)
- [지원사업·사업자등록 충돌·준비 로드맵](docs/FUNDING-ROADMAP.md)
- [데이터 수집·실농가 평가·차단 항목](docs/DATA-AND-VALIDATION-PLAN.md)
- [농민용 앱 계약](docs/FARMER-APP-CONTRACT.md), [리뉴얼 방향](docs/APP-RENEWAL.md)
- [농민용 앱 실측·브라우저 검증](evidence/FARMER-APP-VERIFICATION.md)
- [이전 M0 기술 계약](docs/MVP-CONTRACT.md)
- [검증 결과와 미검증 범위](evidence/VERIFICATION.md)
- [합성 evals 실제 결과](evidence/evals.json)
- 기존 PLAN/PHASE-0-1/AGENT-UI는 후보 설계로 보존. 이번 M0의 실제 범위는 MVP-CONTRACT가 우선.

## 다음 행동

- [ ] 실제 접근 가능한 농가 1곳·작목·현재 쓰는 서식 1종 확인.
- [ ] 실제 데이터 동의·보관·삭제·모델 처리 방식 결정 후 5농가 2주 concierge.
- [ ] 저스팀 본인 사업자 보유 상태와 2027 청년농 연령/교육 예외·가족농지 권원 확인.
- [ ] 9loop의 브랜드·운영 범위 및 '9'의 의미 확인.
- [ ] 한국어 농업 발화/숫자/단위 STT 평가셋과 농민용 입력시간 실측. 실제 휴대폰 마이크·Safari·PWA 설치·오프라인 재전송 검증.
- [ ] 농가 지속 게이트 통과 후 실데이터 운영정책, 공식 서식 1종 및 안전한 배포 방식 확정.

## 정본 링크

- 지식·결정: `~/Documents/_personal/my_brain` (`#farm-log`)
- 원본·증빙: `./files/`
