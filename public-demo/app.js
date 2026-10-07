import { api, esc, icon } from './shared.js';
import { resetRuntime, runtimeInfo } from './runtime.js';
import { renderFarmer, bindFarmer } from './farmer.js';
import { renderAdmin, bindAdmin } from './admin.js';

const runtime = runtimeInfo();
const params = new URLSearchParams(location.search);
const admin = location.pathname.startsWith('/admin') || params.get('view') === 'admin';
const publicDemo = runtime.publicDemo;
const roleHref = role => publicDemo ? (role === 'admin' ? './?view=admin' : './') : (role === 'admin' ? '/admin' : '/mvp');
const ctx = {
  data: null,
  publicDemo,
  ui: { view: 'home', step: 1 },
  render,
  refresh,
  notify
};
let toastTimer;
let installPrompt = null;

function notify(text) {
  const toast = document.querySelector('#toast');
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 6500);
}
async function refresh() {
  ctx.data = await api('workspace');
  render();
}
function runtimePanel() {
  if (!publicDemo) return `<div class="local-label"><span class="live-dot"></span>내 컴퓨터에 저장 중</div>
    <p>외부 전송 없는 로컬 시험용<br>실제 개인정보는 넣지 마세요.</p>`;
  return `<div class="local-label"><span class="live-dot"></span>이 브라우저에만 저장</div>
    <p>다른 방문자와 기록을 공유하지 않아요.<br>실제 개인정보는 넣지 마세요.</p>
    <button class="switch-link demo-tool" data-runtime-action="install">${icon('download')}홈 화면에 추가${icon('arrow')}</button>
    <button class="switch-link demo-tool danger-link" data-runtime-action="reset">${icon('close')}내 체험 기록 초기화${icon('arrow')}</button>`;
}
function render() {
  if (!ctx.data) return;
  const view = ctx.ui.view;
  const links = admin ? `<a class="nav-item active" href="${roleHref('admin')}" aria-current="page">${icon('grid')}기록 대시보드</a>` : [
    ['home', 'home', '오늘의 농장'], ['records', 'book', '내 기록'], ['farm', 'field', '내 농장']
  ].map(([key, glyph, label]) => `<button class="nav-item ${view === key ? 'active' : ''}" data-view="${key}" ${view === key ? 'aria-current="page"' : ''}>${icon(glyph)}${label}</button>`).join('');
  const badge = publicDemo ? '공개 체험판' : '로컬 MVP';
  document.querySelector('#app').innerHTML = `
    <aside class="sidebar">
      <a class="brand" href="${roleHref('farmer')}">${icon('leaf')}<span>팜로그<small>농사 기록, 가볍게.</small></span></a>
      <div class="workspace-label">${admin ? '관리자 워크스페이스' : '나의 워크스페이스'}</div>
      <nav class="side-nav" aria-label="주 메뉴">${links}</nav>
      <div class="sidebar-bottom">${runtimePanel()}
        <a class="switch-link" href="${roleHref(admin ? 'farmer' : 'admin')}">${icon(admin ? 'home' : 'grid')}${admin ? '농업인 앱 보기' : '관리자 화면 보기'}${icon('arrow')}</a>
      </div>
    </aside>
    <div class="main-shell ${admin ? 'admin-shell' : ''}">
      ${publicDemo ? '<div class="public-demo-banner"><strong>공개 체험판</strong><span>입력한 내용은 이 브라우저에만 남고 서버로 전송되지 않아요.</span></div>' : ''}
      <header class="topbar"><span class="topbar-title">${admin ? '팜로그 / 관리자' : '나의 농사 파트너'}</span><span class="topbar-farm">${icon('field')}${esc(ctx.data.profile.farm_name)}<span class="demo-pill">${badge}</span><a class="mobile-role-link" href="${roleHref(admin ? 'farmer' : 'admin')}">${admin ? '농업인 앱' : '관리자'}</a></span></header>
      <main id="screen" tabindex="-1">${admin ? renderAdmin(ctx) : renderFarmer(ctx)}</main>
      <footer class="page-footer">FarmLog · 기록은 농업인이, 확인은 함께.<span>체험판은 인증 판정·자동 제출·실제 데이터 수집을 지원하지 않아요.${publicDemo ? ' <a class="footer-link" href="./privacy.html">데이터 안내</a>' : ''}</span></footer>
    </div>
    ${admin ? '' : `<nav class="mobile-nav" aria-label="모바일 주 메뉴">${links}</nav>`}`;
  if (admin) bindAdmin(ctx); else bindFarmer(ctx);
  bindShell();
}
function bindShell() {
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', async () => {
    if (ctx.ui.saving) return;
    ctx.ui.view = button.dataset.view;
    try { await refresh(); } catch (error) { notify(error.message); render(); }
  }));
  document.querySelectorAll('[data-runtime-action]').forEach(button => button.addEventListener('click', async () => {
    if (button.dataset.runtimeAction === 'install') {
      if (installPrompt) {
        await installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
        notify('설치 안내를 처리했어요. 홈 화면에서 팜로그를 열 수 있어요.');
      } else {
        notify('iPhone은 Safari 공유 버튼 → 홈 화면에 추가, Android는 브라우저 메뉴 → 앱 설치를 선택해 주세요.');
      }
      return;
    }
    if (button.dataset.runtimeAction === 'reset') {
      if (!window.confirm('이 브라우저에 저장한 체험 기록과 농장 설정을 모두 지울까요?')) return;
      await resetRuntime();
      ctx.ui = { view: 'home', step: 1 };
      await refresh();
      notify('이 브라우저의 체험 기록을 초기화했어요.');
    }
  }));
}
refresh().catch(error => {
  const help = publicDemo ? '브라우저 저장 공간을 허용한 뒤 다시 열어 주세요.' : '로컬 서버를 확인한 뒤 다시 열어 주세요.';
  document.querySelector('#app').innerHTML = `<main class="loading-state"><h1>농장에 연결하지 못했어요</h1><p>${help}</p><p>${esc(error.message)}</p><button id="retry" class="button primary">다시 연결</button></main>`;
  document.querySelector('#retry').addEventListener('click', () => location.reload());
});
window.addEventListener('focus', () => {
  if (ctx.data && !ctx.ui.saving && !ctx.ui.admin?.reviewBusy && !ctx.ui.selectedId && ['home', 'records'].includes(ctx.ui.view)) {
    refresh().catch(error => notify(error.message));
  }
});
window.addEventListener('storage', event => {
  if (publicDemo && event.key === runtime.storageKey && !ctx.ui.saving) refresh().catch(error => notify(error.message));
});
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
});
if (publicDemo && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
}
