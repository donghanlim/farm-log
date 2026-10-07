# Public demo GitHub Pages 배포

## 상태와 범위

이 문서는 `farm-log`의 `public-demo/` 정적 산출물을 GitHub Pages로 공개 배포하기 위한 운영 문서다.

- 예상 URL: <https://donghanlim.github.io/farm-log/>
- 이 문서와 workflow는 배포를 실행하거나 Pages를 활성화하지 않는다.
- 현재 URL이 live라고 주장하지 않는다. 실제 배포 뒤 아래 검증 절차로 확인한다.
- 저장소 루트는 이미 public이다. GitHub Pages 배포는 이 public 저장소의 정적 파일을 외부에 공개하는 추가 동작이며, 외부 공개·배포 승인이 필요한 작업이다.

## 배포 계약

`.github/workflows/pages.yml`은 GitHub 공식 Actions만 사용한다.

- `actions/checkout@v4`
- `actions/configure-pages@v5`
- `actions/upload-pages-artifact@v3`
  - artifact path: `public-demo`
- `actions/deploy-pages@v4`
- permissions: `contents: read`, `pages: write`, `id-token: write`
- concurrency: `pages`, `cancel-in-progress: false`
- 실행 조건: `main`에 push하거나 `workflow_dispatch`를 수동 실행

기존 build script를 로컬에서 실행해 `public-demo/`를 생성하고, 정적 파일을 commit한 뒤 배포한다. workflow에는 `npm install`이나 build step이 없다. 즉, Pages runner가 의존성을 설치하거나 앱을 다시 빌드하지 않고 commit에 포함된 `public-demo/`를 그대로 업로드한다.

## 최초 수동 설정

외부 공개 배포를 승인한 뒤 repository 관리자만 다음 설정을 수동으로 한다.

1. `donghanlim/farm-log`의 **Settings**를 연다.
2. **Pages**로 이동한다.
3. **Build and deployment > Source**를 `GitHub Actions`로 선택한다.
4. `main`에 push하거나 Actions에서 `Deploy public demo to GitHub Pages` workflow의 **Run workflow**를 실행한다.
5. workflow의 `deploy` job이 성공한 뒤 예상 URL을 연다.

이 저장소에는 third-party action, secret, API key를 추가하지 않는다. Pages의 `id-token: write`는 `actions/deploy-pages@v4`가 GitHub Pages 배포를 인증하는 데 필요한 권한이다.

## 앱 데이터와 개인정보

- `public-demo`는 브라우저-local storage를 사용한다. 입력 데이터는 방문한 브라우저의 local storage에 남을 수 있으며, 브라우저·프로필을 바꾸면 공유되지 않는다.
- public URL에서 입력한 내용은 공용 기기나 타인의 브라우저에 남을 수 있으므로 개인정보, 실제 농가 정보, 연락처, 주소, 민감한 작업 기록을 입력하지 않는다. 시연에는 합성 데이터를 사용한다.
- Git의 `.gitignore`가 `.local-data/`를 제외한다. 따라서 로컬 실행 중 생성되는 `.local-data`와 그 안의 사용자 데이터는 commit 또는 Pages artifact에 포함되지 않는다.
- 다만 `public-demo/`에 직접 넣은 파일은 public 저장소와 Pages에서 공개된다. build 전에 파일 목록과 내용을 확인한다.

## HTTPS와 PWA 확인

GitHub Pages의 예상 주소는 HTTPS다. 배포가 성공한 뒤 다음을 확인한다.

- `https://donghanlim.github.io/farm-log/`로 접속되고 HTTP가 HTTPS로 제공되는지
- 모바일 브라우저에서 반응형 화면이 열리는지
- manifest와 service worker가 포함된 경우 브라우저의 PWA 설치 조건과 offline 동작이 기대 범위인지
- browser-local storage가 새로고침 뒤 유지되고, 다른 브라우저 프로필과 분리되는지

이는 배포 뒤 확인할 항목이며, 확인 전에는 HTTPS PWA가 live라고 표시하지 않는다.

## 배포 후 정확한 검증

아래 명령은 저장소의 Pages 설정·배포 기록·공개 URL을 확인한다. 모든 명령은 Mac 터미널에서 실행하며, `gh`는 이미 로그인된 GitHub CLI 세션을 사용한다. token, secret, API key를 명령어나 출력에 넣지 않는다.

### 1. Pages API

```bash
curl --fail-with-body --silent --show-error \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/donghanlim/farm-log/pages
```

성공 응답에서 `html_url`이 `https://donghanlim.github.io/farm-log/`인지, `status`와 `https_certificate` 상태를 확인한다. Pages를 아직 활성화하지 않았다면 `404 Not Found`가 나올 수 있으며, 이는 live 배포의 증거가 아니다.

### 2. GitHub CLI로 Pages 상태와 workflow 확인

```bash
gh api repos/donghanlim/farm-log/pages \
  --jq '{html_url,build_type,status,https_certificate}'

gh run list \
  --repo donghanlim/farm-log \
  --workflow pages.yml \
  --limit 5 \
  --json databaseId,status,conclusion,headSha,url
```

가장 최근 run의 `databaseId`를 `<RUN_ID>`로 바꿔 deploy job까지 확인한다.

```bash
gh run view <RUN_ID> \
  --repo donghanlim/farm-log \
  --json status,conclusion,jobs,url
```

`conclusion`이 `success`이고 `deploy` job이 성공해야 한다. API·CLI 결과와 공개 URL 응답이 모두 확인되기 전에는 배포 완료 또는 live 상태로 기록하지 않는다.

### 3. 공개 HTTPS 응답

```bash
curl --fail --silent --show-error --location --head \
  https://donghanlim.github.io/farm-log/
```

응답의 최종 URL이 HTTPS이고 HTTP 성공 상태인지 확인한다. 필요하면 실제 브라우저에서 PWA·local storage 항목도 직접 확인한다.

## 롤백

문제가 생기면 먼저 공개 URL을 확인하고, 원인을 고친 뒤 다시 배포한다.

1. **이전 artifact로 롤백:** GitHub **Actions**에서 이전에 성공한 `pages.yml` run을 열고, 보관 중인 이전 Pages artifact를 사용해 `deploy`를 재실행할 수 있는 경우 해당 prior artifact를 재배포한다.
2. **이전 commit으로 롤백:** 정상으로 확인된 commit을 기준으로 rollback commit을 만들어 `main`에 반영하면 push-triggered workflow가 그 commit의 `public-demo/`를 다시 업로드한다.
3. 롤백 후에도 위 Pages API, `gh run view`, 공개 HTTPS 응답을 다시 확인한다.

artifact 보관 기간이 지났거나 이전 artifact를 재배포할 수 없으면, 검증된 이전 commit으로 롤백하는 방법을 사용한다.

## 보류 사항

- Custom domain 연결은 보류한다.
- 도메인·DNS·인증서 설정을 추가하지 않는다.
- 실제 농가 데이터와 개인정보를 public demo에 넣지 않는다.
- 외부 공개 배포는 저스팀의 별도 승인 없이는 실행하지 않는다.
