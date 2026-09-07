# 농민용 앱 v1 검증

2026-09-07 · 주 앱 `http://127.0.0.1:8880/` · 로컬 시험판

## 결론

관리자 M0의 고정 fixture 선택 화면과 분리해 **말·사진·자유대화 → 원문 확인 → 실제 로컬 AI 구조화 → 농민 확인 → 영농일지 저장/조회/정정/출력**을 구현했다. 공개 자료와 비민감 합성 입력으로 실제 실행했다. 실농가 품질·수요·운영정책·휴대폰 실기기 검증 완료를 뜻하지 않는다.

## 검사 범위와 결과

| 검사 | 결과 | 근거/해석 |
|---|---|---|
| 신규 농민용 회귀 | 54 통과, 0 실패, opt-in 실측 3 skip | `farmer-tests-final.txt`. 단위·계약 검사이며 농업 정확도 아님 |
| 저장소 전체 회귀 | 131 통과, 0 실패, 3 skip | `tests-farmer-and-m0.txt`. 기존 M0 77개를 포함하므로 신규 제품 성과로 합산하지 않음 |
| 실제 LLM 추가 실측 | 3개 시나리오, 4회 추론의 검사항목 통과 | `farmer-ai-live-v2.json`. 각각 약 6~11초, 소규모 사례 검사 |
| 초기 LLM 실패 보존 | 비료 이름 과확장 등 초기 결과 보존 | `farmer-ai-live.json`. 과거 작목 기본값 기준이 섞여 있어 현재 정확도로 재주장하지 않음 |
| 실제 OCR | 공개 영농일지 PNG → 1,307자, 약 3.7초 | `farmer-media-live-v2.json`. 표/글자 오인식 존재. confidence 83은 정확도 83%가 아님 |
| 실제 한국어 STT | 공개 FLEURS 12.48초 음성 → 한국어 전사 | `browser-speech-korean-live.json`. 전체 16.474초, 추론 9.906초 |
| STT 오류 | 정규화 CER 16.98%, 53글자 중 9 edits | `2011→2021` 등 중요한 오류. 농업 용어 정확도나 자동 확정 근거가 아님 |
| WASM 실행/외부 요청 | encoder+decoder 실제 실행, 실측 worker 외부 resource 요청 0 | `browser-speech-feasibility.json`, `browser-speech-korean-live.json`. sine 시험의 `[끝끝]` hallucination도 보존 |
| 실제 앱 브라우저 | 음성 파일→수정 가능한 글, 사진→OCR, 대화→저장 확인 | `farmer-browser-final.json` |
| 출력 서버 | 확인된 최신 기록 1건의 HTML/CSV 생성 확인 | 같은 JSON. 실제 OS 인쇄 대화상자/프린터/PDF 저장은 미검증 |

공개 음성: **Google FLEURS dataset, CC-BY-4.0**, https://huggingface.co/datasets/google/fleurs . 정답·실제 출력·source metadata는 한국어 STT 증거 JSON 참조. 사용자 마이크나 개인 음성을 사용하지 않았다.

## 실제 앱에서 확인한 흐름

1. 자유 문장으로 대화 시작. 날짜/작목/시간 보완과 수확 추가를 수행했다.
2. 최종 양식 `2026-09-07 / 윗밭 / 고추 / 수확·관수 / 20분 / 5kg`을 확인했다. 확인 체크 전 저장 버튼 비활성, 확인 후 로컬 원장 저장과 최근 일지 표시를 확인했다.
3. 공개 한국어 WAV를 앱의 파일 입력으로 읽어 WASM STT 결과가 편집창에 표시되는 것을 확인했다. 오인식 결과를 그대로 기록했으며 농사 기록으로 저장하지 않았다.
4. 공개 영농일지 이미지를 앱에 첨부해 실제 OCR 결과를 확인했다. 작업명·수확량·자재 사용은 자동 확정되지 않았고 `ready=false`, `inputs=[]`로 남았다.
5. 브라우저 STT 원본 후보는 감사용 metadata로 보존하되 AI context에는 재주입하지 않는다. 사용자가 고친 대화 글을 원래 오인식 결과가 덮어쓰지 않는 회귀를 추가했다.

브라우저 점검 중 `물을 30분 줬어`, `물 준 시간` 표현에서 작업이 빠지는 사례를 발견해 보완했다. 최신 상대날짜, 시간/분 정정, 추가 수확, 비료량과 수확량 혼동 방지, 필지 띄어쓰기 변형을 회귀에 추가했다. 모든 자연어를 처리한다는 주장은 하지 않는다.

## 처리·저장 경계

- LLM: 설치된 로컬 Ollama `qwen3:4b`만. cloud/remote 모델 거부.
- OCR: Tesseract.js 한국어/영어 WASM. STT: 브라우저 Whisper tiny multilingual q8 WASM 전용 worker.
- 공개 패키지/모델의 최초 setup 다운로드와 런타임 데이터 처리를 분리한다. 런타임 외부 fetch 차단, same-origin CSP, manifest allowlist 정적 제공.
- Swift Vision/MLX native 실행 차단과 초기 실패는 `farmer-media-live.json`에 보존했다. 보안 설정을 변경하거나 실행 차단을 우회하지 않고 WASM 방식으로 대체했다.
- `.local-data/farmer-app/`은 M0 원장과 분리한다. 확인 저장·정정·idempotency·exclusive writer lock·append-only journal을 사용한다. 원본 삭제/수정 대신 새 정정 이벤트를 만든다.
- 미전송 글/Blob은 IndexedDB, 앱 shell은 SW 캐시. 사진 EXIF/위치/연락처 자동 추출, 기존 사용자 자료 자동 유입, 외부 API 전송 없음.
- 현재 시험 원장에는 합성 일지 1건과 공개 OCR 시험용 미확정 대화가 있다. 실제 농가 기록이 아니다.

## 남은 검증과 제한

- 실제 휴대폰의 마이크/카메라 권한, Safari, PWA 설치, 390px 실제 viewport, 현장 비행기모드/재전송, 실제 인쇄/PDF 저장은 미검증이다. 브라우저 도구의 viewport 변경은 지원되지 않았다.
- STT는 숫자·연도·농업 용어를 틀릴 수 있다. all-zero 무음 차단은 VAD가 아니며 잡음 hallucination을 막는다는 뜻이 아니다. 인식한 글을 반드시 확인·수정한다.
- 사진은 JPEG/PNG/WebP, 8MB 이하. 장면 이해·병충해 진단·HEIC 지원은 아니다. OCR은 참고자료이며 농약 사용/안전 판정이 아니다.
- 음성은 16MB/180초. 녹음 종료 전 데이터는 메모리에 있다. 추가 미디어는 대화 중이 아니라 홈의 새 기록에서 붙인다.
- 서버가 종료되어도 미전송 입력은 보관되지만, STT 모델 전체를 PWA 오프라인 캐시하는 구현은 아니다. 인터넷 없이 인식하려면 로컬 서버와 설치된 모델 파일이 필요하다.
- 세부 작업내용은 발화·정정 원문을 보존한다. 제출용 문장으로 자동 윤문하지 않으므로 출력 전 직접 다듬을 수 있다.
- 전송 응답 유실 후 재시도에서 임시 세션이 중복될 가능성이 있다. 최종 확인 저장은 idempotency로 보호한다.
- 로그인·농가별 권한·동의/보관/삭제정책·백업복구·안전한 HTTPS 배포·농약/PLS/PHI/인증 판정·공식 자동 제출은 범위 밖이다. 실농가 공개 서비스로 운영하지 않는다.
- 이전 개발용 8877 및 별도 WASM 시험 8886 프로세스는 도구의 signal 권한 제한으로 종료를 확인하지 못했다. 주 앱은 8880이며 이전 시험 페이지를 사용하지 않는다.

## 재현 (Mac)

```bash
cd /Users/justimmacbook/Documents/_work/farm-log
npm start
# 코드 변경을 동반하는 개발: npm run dev
node --test test/farmer*.test.mjs
FARMLOG_AI_LIVE_V2=1 node --test test/farmer-ai.test.mjs
```

이미 8880이 실행 중이면 새 writer를 띄우지 말고 해당 페이지를 연다. 설치가 없는 새 환경의 OCR/STT setup 명령은 README 참조. 실제 농가 한 곳·작목·서식 한 종류와 휴대폰을 확보한 다음 STT 정정률·입력시간·필드 정확도를 검증한다.
