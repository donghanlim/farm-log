import { api, esc, icon } from './shared.js';
import { renderFarmer, bindFarmer } from './farmer.js';
import { renderAdmin, bindAdmin } from './admin.js';

const admin = location.pathname.startsWith('/admin');
const ctx = {
  data: null,
  ui: { view: 'home', step: 1 },
  render,
  refresh,
  notify
};
let toastTimer;
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
function render() {
  if (!ctx.data) return;
  const view = ctx.ui.view;
  const links = admin ? `<a class="nav-item active" href="/admin" aria-current="page">${icon('grid')}기록 대시보드</a>` : [
    ['home', 'home', '오늘의 농장'], ['records', 'book', '내 기록'], ['farm', 'field', '내 농장']
  ].map(([key, glyph, label]) => `<button class="nav-item ${view === key ? 'active' : ''}" data-view="${key}" ${view === key ? 'aria-current="page"' : ''}>${icon(glyph)}${label}</button>`).join('');
  document.querySelector('#app').innerHTML = `
    <aside class="sidebar">
      <a class="brand" href="/mvp">${icon('leaf')}<span>팜로그<small>농사 기록, 가볍게.</small></span></a>
      <div class="workspace-label">${admin ? '관리자 워크스페이스' : '나의 워크스페이스'}</div>
      <nav class="side-nav" aria-label="주 메뉴">${links}</nav>
      <div class="sidebar-bottom"><div class="local-label"><span class="live-dot"></span>내 컴퓨터에 저장 중</div>
        <p>외부 전송 없는 로컬 시험용<br>실제 개인정보는 넣지 마세요.</p>
        <a class="switch-link" href="${admin ? '/mvp' : '/admin'}">${icon(admin ? 'home' : 'grid')}${admin ? '농업인 앱 보기' : '관리자 화면 보기'}${icon('arrow')}</a>
      </div>
    </aside>
    <div class="main-shell ${admin ? 'admin-shell' : ''}">
      <header class="topbar"><span class="topbar-title">${admin ? '팜로그 / 관리자' : '나의 농사 파트너'}</span><span class="topbar-farm">${icon('field')}${esc(ctx.data.profile.farm_name)}<span class="demo-pill">로컬 MVP</span><a class="mobile-role-link" href="${admin ? '/mvp' : '/admin'}">${admin ? '농업인 앱' : '관리자'}</a></span></header>
      <main id="screen" tabindex="-1">${admin ? renderAdmin(ctx) : renderFarmer(ctx)}</main>
      <footer class="page-footer">FarmLog · 기록은 농업인이, 확인은 함께.<span>인증 판정·자동 제출은 지원하지 않아요.</span></footer>
    </div>
    ${admin ? '' : `<nav class="mobile-nav" aria-label="모바일 주 메뉴">${links}</nav>`}`;
  if (admin) bindAdmin(ctx); else bindFarmer(ctx);
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', async () => {
    if (ctx.ui.saving) return;
    ctx.ui.view = button.dataset.view;
    try { await refresh(); } catch (error) { notify(error.message); render(); }
  }));
}
refresh().catch(error => {
  document.querySelector('#app').innerHTML = `<main class="loading-state"><h1>농장에 연결하지 못했어요</h1><p>로컬 서버를 확인한 뒤 다시 열어 주세요.</p><p>${esc(error.message)}</p><button id="retry" class="button primary">다시 연결</button></main>`;
  document.querySelector('#retry').addEventListener('click', () => location.reload());
});
// A returning tab reads the same journal again. Never replace an in-progress form.
window.addEventListener('focus', () => {
  if (ctx.data && !ctx.ui.saving && !ctx.ui.admin?.reviewBusy && !ctx.ui.selectedId && ['home', 'records'].includes(ctx.ui.view)) {
    refresh().catch(error => notify(error.message));
  }
});
