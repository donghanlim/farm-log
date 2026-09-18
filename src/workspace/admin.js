import { esc, icon, api, statusOf, statusLabel, formatDate, today, csvCell } from './shared.js';

const STATUSES = ['pending', 'needs_changes', 'checked'];

function stateOf(ctx) {
  ctx.ui.admin ??= {};
  const state = ctx.ui.admin;
  state.filters ??= { search: '', parcel: '', status: '', from: '', to: '' };
  state.notes ??= {};
  state.details ??= {};
  return state;
}

function entriesOf(ctx) {
  return Array.isArray(ctx.data.entries) ? ctx.data.entries : [];
}

function parcelsOf(ctx) {
  return ctx.data.profile?.parcels || [];
}

function parcelName(ctx, entry) {
  return entry.parcel_name || parcelsOf(ctx).find(parcel => parcel.id === entry.parcel_id)?.name || '필지 미기재';
}

function displayValue(value, unit = '') {
  return value === null || value === undefined || value === '' ? '미기재' : `${value}${unit}`;
}

function dateText(value) {
  return value ? formatDate(value) : '날짜 미기재';
}

function statusBadge(ctx, entry) {
  const status = statusOf(ctx, entry);
  const safeStatus = STATUSES.includes(status) ? status : 'pending';
  return `<span class="status-badge status-${safeStatus}">${esc(statusLabel(status))}</span>`;
}

function invalidRange(filters) {
  return Boolean(filters.from && filters.to && filters.from > filters.to);
}

function filteredEntries(ctx) {
  const filters = stateOf(ctx).filters;
  if (invalidRange(filters)) return [];
  const query = filters.search.trim().normalize('NFKC').toLocaleLowerCase('ko');
  return entriesOf(ctx).filter(entry => {
    if (filters.parcel && entry.parcel_id !== filters.parcel) return false;
    if (filters.status && statusOf(ctx, entry) !== filters.status) return false;
    if (filters.from && (!entry.worked_at || entry.worked_at < filters.from)) return false;
    if (filters.to && (!entry.worked_at || entry.worked_at > filters.to)) return false;
    const text = [parcelName(ctx, entry), entry.crop, entry.work_type, entry.details, entry.source_text]
      .filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase('ko');
    return !query || text.includes(query);
  }).sort((a, b) => String(b.worked_at || '').localeCompare(String(a.worked_at || ''))
    || String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

function renderStats(ctx) {
  const entries = entriesOf(ctx);
  const cards = [
    ['book', '전체 기록', entries.length, '농업인이 확인하고 저장한 기록', 'neutral'],
    ['clock', '확인 대기', entries.filter(entry => statusOf(ctx, entry) === 'pending').length, '차근차근 살펴볼 기록', 'amber'],
    ['alert', '보완 요청', entries.filter(entry => statusOf(ctx, entry) === 'needs_changes').length, '추가 설명을 요청한 기록', 'rose'],
    ['check', '확인 완료', entries.filter(entry => statusOf(ctx, entry) === 'checked').length, '내부 확인을 마친 기록', 'green'],
  ];
  return `<section class="admin-overview" aria-labelledby="overview-title">
    <div class="section-heading"><h2 id="overview-title">기록 현황</h2><span class="muted">전체 기간 · 필터 미적용</span></div>
    <div class="stat-grid">${cards.map(([symbol, label, count, hint, tone]) => `
      <article class="stat-card stat-${tone}"><div class="stat-heading"><span>${label}</span><span class="stat-icon" aria-hidden="true">${icon(symbol)}</span></div>
        <p class="stat-value">${count.toLocaleString('ko-KR')}<span>건</span></p><p class="stat-hint">${hint}</p>
      </article>`).join('')}</div>
  </section>`;
}

function renderFarm(ctx) {
  const parcels = parcelsOf(ctx);
  const entries = entriesOf(ctx);
  return `<aside class="farm-panel panel" aria-labelledby="farm-panel-title">
    <div class="section-heading"><h2 id="farm-panel-title">우리 농장</h2><span aria-hidden="true">${icon('field')}</span></div>
    <h3 class="farm-name">${esc(ctx.data.profile?.farm_name || '나의 농장')}</h3>
    <p class="muted">현재 기기에 설정된 단일 농장</p>
    <div class="farm-meta"><span>등록 필지</span><strong>${parcels.length}곳</strong></div>
    <ul class="parcel-list">${parcels.map(parcel => `<li class="parcel-item">
      <span class="parcel-symbol" aria-hidden="true">${icon('leaf')}</span><div><strong>${esc(parcel.name)}</strong>
      <p class="muted">${esc(parcel.crop || '작물 미기재')}${parcel.area_m2 == null ? '' : ` · ${esc(parcel.area_m2)} ㎡`}</p></div>
      <span class="parcel-count">${entries.filter(entry => entry.parcel_id === parcel.id).length}건</span></li>`).join('') || '<li class="muted">아직 등록된 필지가 없어요.</li>'}</ul>
    <div class="farm-panel-note"><span aria-hidden="true">${icon('book')}</span><p>필지별 기록을 모아두면<br>지난 농사도 쉽게 돌아볼 수 있어요.</p></div>
    <p class="scope-note">설정된 농장·필지 정보예요. 실제 농가 검증을 뜻하지 않아요.</p>
  </aside>`;
}

function renderFilters(ctx) {
  const { filters } = stateOf(ctx);
  const options = new Map(parcelsOf(ctx).map(parcel => [parcel.id, parcel.name]));
  for (const entry of entriesOf(ctx)) {
    if (entry.parcel_id && !options.has(entry.parcel_id)) options.set(entry.parcel_id, parcelName(ctx, entry));
  }
  return `<form id="admin-filters" class="record-filters" aria-label="기록 검색과 필터">
    <label class="search-field" for="admin-search"><span class="filter-label">기록 검색</span><span class="input-icon" aria-hidden="true">${icon('search')}</span>
      <input id="admin-search" name="search" type="search" value="${esc(filters.search)}" placeholder="작물, 작업, 기록 내용 검색" autocomplete="off"></label>
    <div class="filter-row">
      <label class="filter-field" for="admin-parcel"><span>필지</span><select id="admin-parcel" name="parcel"><option value="">모든 필지</option>${[...options].map(([id, name]) => `<option value="${esc(id)}"${filters.parcel === id ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select></label>
      <label class="filter-field" for="admin-status"><span>확인 상태</span><select id="admin-status" name="status"><option value="">모든 상태</option>${STATUSES.map(status => `<option value="${status}"${filters.status === status ? ' selected' : ''}>${esc(statusLabel(status))}</option>`).join('')}</select></label>
      <label class="filter-field" for="admin-from"><span>시작일</span><input id="admin-from" name="from" type="date" value="${esc(filters.from)}" aria-describedby="admin-range-help"></label>
      <label class="filter-field" for="admin-to"><span>종료일</span><input id="admin-to" name="to" type="date" value="${esc(filters.to)}" aria-describedby="admin-range-help"></label>
      <button type="button" class="button button-quiet" data-admin-action="reset">초기화</button>
    </div>
    <p id="admin-range-help" class="${invalidRange(filters) ? 'form-error' : 'scope-note'}"${invalidRange(filters) ? ' role="alert"' : ''}>${invalidRange(filters) ? '종료일을 시작일과 같거나 이후로 선택해 주세요.' : '날짜를 비워두면 전체 기간을 조회해요.'}</p>
  </form>`;
}

function renderRecords(ctx, entries) {
  const allEmpty = entriesOf(ctx).length === 0;
  return `<div class="table-wrap"><table class="records-table">
    <caption class="sr-only">필터에 맞는 농사 기록 ${entries.length}건. 기록 보기 버튼으로 상세 내용을 확인할 수 있어요.</caption>
    <thead><tr><th scope="col">작업일</th><th scope="col">필지 / 작물</th><th scope="col">작업</th><th scope="col">기록 내용</th><th scope="col">확인 상태</th><th scope="col"><span class="sr-only">상세 보기</span></th></tr></thead>
    <tbody>${entries.map(entry => `<tr class="record-row${ctx.ui.selectedId === entry.id ? ' is-selected' : ''}" data-admin-row="${esc(entry.id)}">
      <td data-label="작업일" class="record-date">${esc(dateText(entry.worked_at))}</td>
      <td data-label="필지 / 작물"><strong>${esc(parcelName(ctx, entry))}</strong><span class="cell-secondary">${esc(entry.crop || '작물 미기재')}</span></td>
      <td data-label="작업"><span class="work-tag">${esc(entry.work_type || '작업 미기재')}</span></td>
      <td data-label="기록 내용" class="record-description">${esc(entry.details || '세부 내용 미기재')}</td>
      <td data-label="확인 상태">${statusBadge(ctx, entry)}</td>
      <td class="record-open"><button type="button" class="button button-quiet" data-admin-open="${esc(entry.id)}" aria-label="${esc(`${dateText(entry.worked_at)} ${parcelName(ctx, entry)} ${entry.work_type || '기록'} 상세 보기`)}" aria-expanded="${ctx.ui.selectedId === entry.id}"${ctx.ui.selectedId === entry.id ? ' aria-controls="admin-detail"' : ''}>보기<span aria-hidden="true">${icon('chevron')}</span></button></td>
    </tr>`).join('') || `<tr><td colspan="6"><div class="empty-state"><span aria-hidden="true">${icon(allEmpty ? 'book' : 'search')}</span><h3>${allEmpty ? '아직 저장된 기록이 없어요' : '조건에 맞는 기록이 없어요'}</h3><p>${allEmpty ? '농업인이 일지를 확인하고 저장하면 이곳에 표시돼요.<br>예시 기록을 자동으로 넣지 않아요.' : '검색어를 줄이거나 필지·상태·날짜 조건을 바꿔보세요.'}</p></div></td></tr>`}</tbody>
  </table></div>`;
}

function renderEntryFields(ctx, entry) {
  const fields = [
    ['작업일', dateText(entry.worked_at)], ['필지', parcelName(ctx, entry)],
    ['작물', entry.crop], ['작업', entry.work_type], ['날씨', entry.weather],
    ['작업면적', displayValue(entry.area_m2, ' ㎡')], ['작업인원', displayValue(entry.worker_count, ' 명')],
    ['작업시간', displayValue(entry.duration_minutes, ' 분')],
    ['수확량', entry.harvest_amount == null ? null : `${entry.harvest_amount} ${entry.harvest_unit || '(단위 미기재)'}`],
  ];
  return `<dl class="detail-fields">${fields.map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(displayValue(value))}</dd></div>`).join('')}</dl>
    <div class="detail-block"><h3>세부 작업내용</h3><p class="preserve-lines">${esc(entry.details || '미기재')}</p></div>
    <div class="detail-block"><h3>구입·사용한 자재</h3>${(entry.inputs || []).length ? `<ul class="input-list">${entry.inputs.map(input => `<li><strong>${input.action === 'purchase' ? '구입' : '사용'} · ${esc(({ pesticide: '농약', fertilizer: '비료', seed: '종자', other: '기타' })[input.kind] || '종류 미기재')} · ${esc(displayValue(input.name))}</strong><p>${esc(displayValue(input.quantity))} ${esc(displayValue(input.unit))}${input.dilution ? ` · 희석 ${esc(input.dilution)}` : ''}</p></li>`).join('')}</ul>` : '<p class="muted">미기재</p>'}</div>`;
}

function renderDetail(ctx) {
  const state = stateOf(ctx);
  const id = ctx.ui.selectedId;
  const listEntry = entriesOf(ctx).find(entry => entry.id === id);
  if (!listEntry) return '';
  const detail = state.details[id];
  const entry = detail?.entry || listEntry;
  const latest = ctx.data.reviews?.[id];
  // Entry history is a correction chain, not an administrator review ledger.
  const history = Array.isArray(detail?.history) ? detail.history : [];
  const reviewHistory = Array.isArray(detail?.reviewHistory) ? detail.reviewHistory : null;
  const busy = Boolean(state.reviewBusy);
  return `<section id="admin-detail" class="detail-panel panel" aria-labelledby="admin-detail-title" tabindex="-1"${busy ? ' aria-busy="true"' : ''}>
    <header class="detail-header"><div><p class="eyebrow">농업인이 확인한 기록</p><h2 id="admin-detail-title">${esc(parcelName(ctx, entry))} · ${esc(entry.work_type || '기록 상세')}</h2><p class="muted">${esc(dateText(entry.worked_at))} · ${esc(entry.crop || '작물 미기재')}</p></div>
      <button type="button" class="icon-button" data-admin-action="close" aria-label="기록 상세 닫기"${busy ? ' disabled' : ''}>${icon('close')}</button></header>
    <div class="detail-status">${statusBadge(ctx, entry)}<span class="muted">시험용 관리자 · 권한 분리 전</span></div>
    ${renderEntryFields(ctx, entry)}
    ${state.detailLoading === id ? '<p class="muted" role="status">원문과 정정 이력을 불러오고 있어요.</p>' : ''}
    ${state.detailError === id ? '<div class="inline-warning"><p>원문과 이력을 불러오지 못했어요. 다시 불러온 뒤 확인해 주세요.</p><button type="button" class="button button-secondary" data-admin-action="retry-detail">다시 불러오기</button></div>' : ''}
    <details class="source-details"><summary>입력 원문과 첨부 정보</summary><p class="preserve-lines">${esc(entry.source_text || '보존된 입력 원문이 없어요.')}</p>
      ${(entry.attachments || []).map((attachment, index) => `<div class="attachment-source"><strong>${attachment.kind === 'photo' ? '사진' : '음성'} 첨부 ${index + 1}</strong><p class="preserve-lines">${esc(attachment.ocrText || attachment.transcript || attachment.transcriptCandidate || '추출된 글 없음')}</p><small>인식된 글은 참고용이며 실제 작업·자재 사용을 증명하지 않아요.</small></div>`).join('')}</details>
    <details class="source-details"><summary>기록 정정 이력${detail ? ` · ${history.length}건` : ''}</summary>
      <p class="scope-note">농업인이 저장·정정한 기록의 연결 이력이에요. 관리자 확인 이력과 달라요.</p>
      <ol class="history-list">${history.map(item => `<li><strong>${esc(dateText(item.created_at || item.worked_at))}${item.id === entry.id ? ' · 현재 선택 기록' : ''}</strong><p>${esc(item.work_type || '작업 미기재')} · ${esc(item.details || '세부 내용 미기재')}</p></li>`).join('') || '<li>불러온 정정 이력이 없어요.</li>'}</ol></details>
    <div class="detail-block review-history"><h3>${reviewHistory ? '관리자 확인 이력' : '최근 관리자 확인'}</h3>
      ${(reviewHistory || (latest ? [latest] : [])).map(review => `<article class="review-item"><strong>${esc(statusLabel(review.status))}</strong>${review.entry_id && review.entry_id !== entry.id ? ' <small>정정 전 기록</small>' : ''}<span class="muted"> ${esc(dateText(review.created_at || review.at))}</span><p class="preserve-lines">${esc(review.note || '남긴 메모 없음')}</p></article>`).join('') || '<p class="muted">아직 관리자 확인이 없어요.</p>'}
      ${reviewHistory ? '' : '<p class="scope-note">최신 확인만 표시해요. 전체 관리자 확인 이력은 이 화면에서 제공하지 않아요.</p>'}</div>
    <form id="admin-review-form" class="review-form"><label for="admin-review-note">농업인에게 남길 메모 <span class="muted">보완 요청 시 필수</span></label>
      <textarea id="admin-review-note" name="note" rows="4" maxlength="1000" placeholder="어떤 내용을 더 알려주면 좋을지 구체적으로 적어주세요." aria-describedby="admin-review-help"${busy ? ' disabled' : ''}>${esc(state.notes[id] || '')}</textarea>
      <p id="admin-review-help" class="scope-note">내부 확인이며 인증·농약 안전 판정이 아니에요</p>
      <p class="scope-note">요청은 이 기기의 기록에만 남아요. 문자·알림을 전송하지 않아요.</p>
      <div class="review-actions"><button type="submit" name="status" value="needs_changes" class="button button-secondary"${busy || !detail || state.detailLoading === id || state.detailError === id ? ' disabled' : ''}>${icon('edit')} 보완 요청</button>
        <button type="submit" name="status" value="checked" class="button button-primary"${busy || !detail || state.detailLoading === id || state.detailError === id ? ' disabled' : ''}>${icon('check')} ${busy ? '저장 중…' : '확인 완료'}</button></div>
    </form>
  </section>`;
}

export function renderAdmin(ctx) {
  const state = stateOf(ctx);
  const entries = filteredEntries(ctx);
  return `<div class="admin-page">
    <header class="page-header admin-header"><div><p class="eyebrow">농장 운영 / 기록 검토</p><h1>농사 기록을 한눈에</h1><p class="page-subtitle">농업인이 확인한 기록을 살펴보고, 필요한 내용만 요청해요.</p></div>
      <div class="admin-identity"><span class="demo-badge">LOCAL DEMO</span><span>시험용 관리자 · 권한 분리 전</span></div></header>
    ${renderStats(ctx)}
    <div class="admin-content"><div class="admin-main"><section class="records-panel panel" aria-labelledby="records-title">
      <div class="section-heading records-heading"><div><h2 id="records-title">농사 기록 <span class="count-badge">${entries.length}</span></h2><p class="muted">조건에 맞는 최신 기록만 모았어요.</p></div>
        <div class="section-actions"><button type="button" class="button button-secondary" data-admin-action="refresh"${state.refreshBusy || state.reviewBusy ? ' disabled' : ''}>${icon('clock')} ${state.refreshBusy ? '불러오는 중…' : '새로고침'}</button><button type="button" class="button button-secondary" data-admin-action="csv"${entries.length ? '' : ' disabled'}>${icon('download')} CSV 받기</button></div></div>
      ${renderFilters(ctx)}${renderRecords(ctx, entries)}
      <footer class="records-footer"><span role="status" aria-live="polite">총 ${entriesOf(ctx).length}건 중 ${entries.length}건</span><span>CSV는 현재 검색·필지·상태·기간 조건을 모두 반영해요.</span></footer>
    </section>${renderDetail(ctx)}</div>${renderFarm(ctx)}</div>
    <p class="admin-local-note">이 기기에 저장된 한 농장만 보는 로컬 시험 화면이에요. 실제 사용자 인증·농가별 권한 분리는 아직 없어요.</p>
  </div>`;
}

async function openDetail(ctx, id, force = false) {
  const state = stateOf(ctx);
  if (state.reviewBusy || !entriesOf(ctx).some(entry => entry.id === id)) return;
  ctx.ui.selectedId = id;
  state.detailError = null;
  if (!state.details[id] || force) {
    state.detailLoading = id;
    ctx.render();
    try {
      const response = await api(`entries/${encodeURIComponent(id)}`);
      if (!response?.entry || response.entry.id !== id) throw new Error('기록 상세 응답이 올바르지 않아요.');
      state.details[id] = response;
    } catch (error) {
      state.detailError = id;
      ctx.notify(`기록을 불러오지 못했어요. ${error.message || ''}`);
    } finally {
      if (state.detailLoading === id) state.detailLoading = null;
    }
  }
  ctx.render();
  if (ctx.ui.selectedId === id) document.querySelector('#admin-detail')?.focus({ preventScroll: true });
}


function exportCSV(ctx) {
  const entries = filteredEntries(ctx);
  if (!entries.length) return ctx.notify('내보낼 기록이 없어요.');
  const rows = [['기록 ID', '작업일', '필지', '작물', '작업', '작업내용', '확인 상태', '최근 확인 메모', '날씨', '면적(㎡)', '인원(명)', '시간(분)', '수확량', '수확단위', '자재(JSON)', '확인 범위'],
    ...entries.map(entry => [entry.id, entry.worked_at, parcelName(ctx, entry), entry.crop, entry.work_type,
      entry.details, statusLabel(statusOf(ctx, entry)), ctx.data.reviews?.[entry.id]?.note, entry.weather,
      entry.area_m2, entry.worker_count, entry.duration_minutes, entry.harvest_amount, entry.harvest_unit,
      JSON.stringify(entry.inputs || []), '내부 확인이며 인증·농약 안전 판정이 아니에요'])];
  const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `farm-log-records-${today()}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  ctx.notify(`현재 조건에 맞는 ${entries.length}건의 CSV 다운로드를 시작했어요.`);
}

async function refreshAdmin(ctx) {
  const state = stateOf(ctx);
  if (state.refreshBusy || state.reviewBusy) return;
  state.refreshBusy = true;
  ctx.render();
  try {
    state.details = {};
    await ctx.refresh();
    if (ctx.ui.selectedId) await openDetail(ctx, ctx.ui.selectedId, true);
    ctx.notify('최신 기록을 불러왔어요.');
  } catch (error) {
    ctx.notify(`새로고침하지 못했어요. ${error.message || ''}`);
  } finally {
    state.refreshBusy = false;
    ctx.render();
  }
}

async function submitReview(ctx, status) {
  const state = stateOf(ctx);
  const id = ctx.ui.selectedId;
  if (state.reviewBusy || !['checked', 'needs_changes'].includes(status) || !state.details[id] || state.detailLoading === id || state.detailError === id) return;
  const note = (state.notes[id] || '').trim();
  if (status === 'needs_changes' && !note) {
    ctx.notify('보완이 필요한 내용을 메모에 적어주세요.');
    document.querySelector('#admin-review-note')?.focus();
    return;
  }
  if (note.length > 1000) {
    ctx.notify('메모는 1,000자 이내로 적어주세요.');
    return;
  }
  state.reviewBusy = true;
  const expectedReviewId = ctx.data.reviews?.[id]?.id ?? null;
  ctx.render();
  let saved = false;
  try {
    await api(`entries/${encodeURIComponent(id)}/review`, { status, note, expectedReviewId });
    saved = true;
    state.notes[id] = '';
    delete state.details[id];
    await ctx.refresh();
    const response = await api(`entries/${encodeURIComponent(id)}`);
    if (!response?.entry || response.entry.id !== id) throw new Error('상세 응답을 다시 확인해 주세요.');
    state.details[id] = response;
    ctx.notify(status === 'needs_changes' ? '보완 요청을 기록했어요.' : '내부 확인 완료를 기록했어요.');
  } catch (error) {
    if (saved) state.detailError = id;
    ctx.notify(saved
      ? '확인은 저장됐지만 최신 화면을 불러오지 못했어요. 다시 제출하지 말고 새로고침해 주세요.'
      : `확인을 저장하지 못했어요. ${error.message || '새로고침 후 다시 확인해 주세요.'}`);
  } finally {
    state.reviewBusy = false;
    ctx.render();
  }
}

export function bindAdmin(ctx) {
  const root = document.querySelector('#screen');
  if (!root) return;
  const state = stateOf(ctx);
  // Binding to current DOM nodes makes repeated render/bind cycles idempotent.
  root.querySelectorAll('[data-admin-open]').forEach(button => {
    button.onclick = () => openDetail(ctx, button.dataset.adminOpen);
  });
  root.querySelectorAll('[data-admin-row]').forEach(row => {
    row.onclick = event => {
      if (event.target.closest('button, a, input, textarea, select') || window.getSelection()?.toString()) return;
      openDetail(ctx, row.dataset.adminRow);
    };
  });
  root.querySelectorAll('[data-admin-action]').forEach(button => {
    button.onclick = () => {
      const action = button.dataset.adminAction;
      if (action === 'refresh') return refreshAdmin(ctx);
      if (action === 'csv') {
        try { exportCSV(ctx); } catch (error) { ctx.notify(`CSV를 만들지 못했어요. ${error.message || ''}`); }
      }
      if (action === 'reset') {
        state.filters = { search: '', parcel: '', status: '', from: '', to: '' };
        ctx.render();
      }
      if (action === 'retry-detail') return openDetail(ctx, ctx.ui.selectedId, true);
      if (action === 'close' && !state.reviewBusy) {
        const selected = ctx.ui.selectedId;
        ctx.ui.selectedId = null;
        ctx.render();
        [...document.querySelectorAll('[data-admin-open]')].find(item => item.dataset.adminOpen === selected)?.focus();
      }
    };
  });
  const form = root.querySelector('#admin-filters');
  if (form) {
    const apply = event => {
      const target = event?.target;
      const caret = target?.type === 'search' ? target.selectionStart : null;
      const focusId = target?.id;
      state.filters = Object.fromEntries(new FormData(form));
      ctx.render();
      const replacement = focusId ? document.getElementById(focusId) : null;
      replacement?.focus({ preventScroll: true });
      if (caret !== null && replacement?.type === 'search') replacement.setSelectionRange(caret, caret);
    };
    form.onsubmit = event => { event.preventDefault(); apply(event); };
    form.onchange = event => { if (event.target.name !== 'search') apply(event); };
    const search = form.querySelector('[name="search"]');
    search.oninput = event => { if (!event.isComposing) apply(event); };
    search.oncompositionend = apply;
  }
  const note = root.querySelector('#admin-review-note');
  if (note) note.oninput = () => { state.notes[ctx.ui.selectedId] = note.value; };
  const reviewForm = root.querySelector('#admin-review-form');
  if (reviewForm) reviewForm.onsubmit = event => {
    event.preventDefault();
    submitReview(ctx, event.submitter?.value);
  };
}
