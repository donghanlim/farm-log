import { api, esc, icon, today, formatDate, statusOf, statusLabel, emptyDraft, workChoices, workLabel, downloadExport } from './shared.js';

const parcelName = (ctx, id) => ctx.data.profile.parcels.find(parcel => parcel.id === id)?.name || '필지 미선택';
const badge = (ctx, entry) => `<span class="status-badge ${statusOf(ctx, entry)}">${statusLabel(statusOf(ctx, entry))}</span>`;
const value = (data, unit = '') => data === null || data === undefined || data === '' ? '미기재' : `${esc(data)}${unit}`;
const fieldArt = `<svg class="field-art" viewBox="0 0 400 240" fill="none" aria-hidden="true"><circle cx="312" cy="47" r="26" fill="#e7c46e"/><path d="M30 173 200 84l177 93-177 83Z" fill="#c3d0a7"/><path d="m30 150 170-89 177 93-177 83Z" fill="#e4e9d1"/><path d="m42 153 151-78 70 37-152 79Z" fill="#96b281"/><path d="m131 202 150-78 75 39-153 75Z" fill="#65886b"/><g stroke="#cbd9b4" stroke-width="6"><path d="m156 195 126-65M178 207l126-65M201 219l126-65M224 230l126-65"/></g><g stroke="#e1ebce" stroke-width="5"><path d="m59 155 134-69M81 167l134-69M104 179l134-69"/></g><path d="M227 96V63l39-24 40 24v33l-40 22Z" fill="#fafbf1"/><path d="m218 65 48-33 49 32-12 7-37-25-37 26Z" fill="#40644f"/><path d="M259 90V69l17 1v29Z" fill="#bdcfae"/><path d="M76 123V88" stroke="#557657" stroke-width="5"/><ellipse cx="63" cy="85" rx="16" ry="8" transform="rotate(32 63 85)" fill="#81a475"/><ellipse cx="88" cy="74" rx="17" ry="9" transform="rotate(-35 88 74)" fill="#a4bc8f"/></svg>`;

function recordCard(ctx, entry) {
  return `<button class="record-card" data-entry="${esc(entry.id)}"><span class="record-icon">${icon(entry.work_type === '수확' ? 'leaf' : 'book')}</span><span class="record-copy"><small>${esc(formatDate(entry.worked_at))} · ${esc(entry.parcel_name)}</small><strong>${esc(entry.crop)} · ${esc(workLabel(entry.work_type))}</strong><span>${esc(entry.details || '세부 메모 없이 저장한 기록')}</span></span>${badge(ctx, entry)}${icon('chevron')}</button>`;
}
function home(ctx) {
  const entries = ctx.data.entries;
  const monthCount = entries.filter(entry => entry.worked_at.startsWith(today().slice(0, 7))).length;
  const requests = entries.filter(entry => statusOf(ctx, entry) === 'needs_changes');
  return `<div class="page-heading"><div><p class="eyebrow">${esc(formatDate(today()))}</p><h1>오늘도, 잘 자라고 있나요?</h1><p>오늘 한 일을 남겨두면 내일의 농사가 편해져요.</p></div><span class="season-label">MY FARM JOURNAL</span></div>
    <div class="farmer-grid"><div class="farmer-main">
      <section class="hero-card"><div class="hero-copy"><span class="small-label">짧게 남겨도 괜찮아요</span><h2>농사 끝, 기록 한 번.</h2><p>어느 밭에서 무엇을 했는지<br>하나씩 고르면 일지가 돼요.</p><button class="button primary large" data-action="new">${icon('plus')}오늘 한 일 남기기</button><span class="hero-hint">필지 선택 · 작업 기록 · 확인 후 저장</span></div>${fieldArt}</section>
      <div class="input-shortcuts"><a href="/" class="shortcut">${icon('mic')}<span><strong>말로 남기고 싶다면</strong><small>기존 음성·AI 기록 도구 열기</small></span>${icon('arrow')}</a><a href="/" class="shortcut">${icon('camera')}<span><strong>사진도 함께 남기기</strong><small>기존 사진 첨부 도구 열기</small></span>${icon('arrow')}</a></div>
      ${requests.length ? `<section class="request-banner">${icon('alert')}<div><strong>함께 확인할 기록이 ${requests.length}개 있어요</strong><p>담당자가 남긴 메모를 보고 필요한 내용만 보완해 주세요.</p></div><button class="button secondary" data-action="requests">확인하기</button></section>` : ''}
      <section class="recent-section"><div class="section-heading"><h2>차곡차곡, 최근 기록</h2><button class="text-button" data-view="records">전체 보기 ${icon('arrow')}</button></div>${entries.length ? entries.slice(0, 4).map(entry => recordCard(ctx, entry)).join('') : `<div class="empty-state">${icon('book')}<h3>첫 기록을 기다리고 있어요</h3><p>오늘 한 농사일 하나부터 가볍게 시작해요.<br>예시 기록은 자동으로 넣지 않아요.</p></div>`}</section>
    </div><aside class="farmer-aside"><section class="panel month-panel"><p class="eyebrow">${Number(today().slice(5, 7))}월의 농사 기록</p><div class="month-number">${monthCount}<span>건</span></div><p>직접 확인하고 저장한 기록이에요.</p><div class="mini-stats"><span>담당자 확인 대기<strong>${ctx.data.summary.pending}</strong></span><span>담당자 확인 완료<strong>${ctx.data.summary.checked}</strong></span></div><small>담당자 상태는 전체 기간 기준이에요.</small></section>
      <section class="panel farm-panel"><div class="section-heading"><h2>나의 밭</h2>${icon('field')}</div>${ctx.data.profile.parcels.length ? ctx.data.profile.parcels.map(parcel => `<div class="parcel-row"><span class="parcel-dot"></span><div><strong>${esc(parcel.name)}</strong><small>${esc(parcel.crop || '작목을 설정해 주세요')}</small></div></div>`).join('') : '<p>내 농장에서 필지를 등록해 주세요.</p>'}<button class="text-button" data-view="farm">농장 설정 ${icon('arrow')}</button></section>
      <div class="quiet-note">${icon('check')}<p>내가 확인한 내용만 기록해요.<br>모르는 수량은 비워두어도 괜찮아요.</p></div>
    </aside></div>
    ${ctx.data.pending.length ? `<section class="panel draft-list"><h2>이어서 쓸 기록 <span>${ctx.data.pending.length}</span></h2>${ctx.data.pending.map(draft => `<button class="draft-row" data-session="${esc(draft.id)}">${icon('edit')}<span>${esc(draft.preview || '작성 중인 기록')}</span><small>임시보관</small>${icon('chevron')}</button>`).join('')}</section>` : ''}`;
}
function draftSummary(ctx, draft) {
  return `<dl class="summary-grid"><div><dt>작업한 날짜</dt><dd>${esc(formatDate(draft.worked_at))}</dd></div><div><dt>어느 밭</dt><dd>${esc(draft.parcel_name || parcelName(ctx, draft.parcel_id))}</dd></div><div><dt>작목</dt><dd>${value(draft.crop)}</dd></div><div><dt>한 일</dt><dd>${esc(workLabel(draft.work_type))}</dd></div><div><dt>작업시간</dt><dd>${value(draft.duration_minutes, '분')}</dd></div><div><dt>수확량</dt><dd>${value(draft.harvest_amount, ` ${esc(draft.harvest_unit || '')}`)}</dd></div><div><dt>작업면적</dt><dd>${value(draft.area_m2, '㎡')}</dd></div><div><dt>작업인원</dt><dd>${value(draft.worker_count, '명')}</dd></div><div><dt>날씨</dt><dd>${value(draft.weather)}</dd></div></dl><div class="memo-block"><span>작업 메모</span><p>${esc(draft.details || '따로 남긴 메모가 없어요.')}</p></div>${draft.inputs.length ? `<div class="memo-block"><span>구입·사용한 자재</span>${draft.inputs.map(item => `<p>${item.action === 'purchase' ? '구입' : '사용'} · ${value(item.name)} · ${value(item.quantity)} ${value(item.unit)}${item.dilution ? ` · 희석 ${esc(item.dilution)}` : ''}</p>`).join('')}</div>` : ''}`;
}
function editScreen(ctx) {
  const ui = ctx.ui;
  const draft = ui.draft;
  const step = ui.step;
  if (ui.confirmPending) return `<div class="editor-wrap panel"><h1>저장 결과를 다시 확인해요</h1><p>연결이 끊겼을 수 있어요. 중복 저장하지 않고 같은 요청의 결과만 확인해요.</p><button class="button primary full-width" data-action="retry-confirm">저장 결과 확인</button></div>`;
  return `<div class="editor-wrap"><button class="text-button back-button" data-action="back-home">← 농장으로</button><p class="eyebrow">${ui.session?.supersedes ? '원본을 보존하며 정정해요' : '오늘의 농사 기록'}</p><h1>${['어느 밭에서, 무슨 일을 했나요?', '기억할 내용을 남겨주세요', '이대로 기록할까요?'][step - 1]}</h1><ol class="steps" aria-label="기록 단계">${['밭과 작업', '내용 적기', '확인·저장'].map((label, index) => `<li class="${step >= index + 1 ? 'current' : ''}" ${step === index + 1 ? 'aria-current="step"' : ''}><span>${index + 1}</span>${label}</li>`).join('')}</ol>
    <form id="record-form" class="panel editor-panel">
      ${step === 1 ? `<label class="field-label" for="work-date">작업한 날짜</label><input id="work-date" name="worked_at" type="date" value="${esc(draft.worked_at)}" required>
        <fieldset class="choice-field"><legend>어느 밭인가요?</legend><div class="parcel-choices">${ctx.data.profile.parcels.map(parcel => `<button type="button" class="choice-card ${draft.parcel_id === parcel.id ? 'selected' : ''}" data-parcel="${esc(parcel.id)}" aria-pressed="${draft.parcel_id === parcel.id}">${icon('field')}<strong>${esc(parcel.name)}</strong><small>${esc(parcel.crop || '작목 미설정')}</small></button>`).join('')}</div>${ctx.data.profile.parcels.length ? '' : '<p class="warning-text">내 농장에서 필지부터 등록해 주세요.</p>'}</fieldset>
        <label class="field-label" for="crop">작목</label><input id="crop" name="crop" value="${esc(draft.crop)}" placeholder="예: 토마토" maxlength="200" required><p class="field-hint">밭을 고르면 농장 설정의 작목을 불러와요. 다르면 바꿔주세요.</p>
        <fieldset class="choice-field"><legend>어떤 일을 하셨나요?</legend><div class="work-choices">${workChoices.map(([key, label]) => `<button type="button" class="work-choice ${draft.work_type === key ? 'selected' : ''}" data-work="${key}" aria-pressed="${draft.work_type === key}">${label}</button>`).join('')}</div>${draft.work_type?.includes('·') ? `<p class="field-hint">기존 복합 작업: ${esc(draft.work_type)}. 그대로 유지하거나 하나를 선택할 수 있어요.</p>` : ''}</fieldset>` : ''}
      ${step === 2 ? `<div class="selection-strip">${icon('field')}${esc(parcelName(ctx, draft.parcel_id))}<span>·</span>${esc(draft.crop)}<span>·</span>${esc(workLabel(draft.work_type))}</div><label class="field-label" for="details">어떻게 작업했나요? <small>선택</small></label><textarea id="details" name="details" rows="4" maxlength="10000" placeholder="예: 오전에 물을 주고 밭 상태를 살폈어요.">${esc(draft.details)}</textarea><p class="field-hint">기억나는 만큼만 적어요. 말하지 않은 내용은 채우지 않아요.</p>
        <div class="form-two"><label>작업시간 <small>선택 · 분</small><input name="duration_minutes" type="number" min="0" max="1000000000000" step="any" value="${esc(draft.duration_minutes)}" placeholder="예: 30"></label><label>날씨 <small>선택</small><input name="weather" value="${esc(draft.weather)}" maxlength="200" placeholder="예: 맑음"></label></div>
        <details class="optional-fields" ${draft.inputs.length ? 'open' : ''}><summary>수확량·자재 등 더 남기기 <span>선택</span></summary><div class="form-two"><label>수확량<input name="harvest_amount" type="number" min="0" step="any" value="${esc(draft.harvest_amount)}"></label><label>수확 단위<input name="harvest_unit" value="${esc(draft.harvest_unit)}" maxlength="200" placeholder="예: kg, 상자"></label><label>작업면적 (㎡)<input name="area_m2" type="number" min="0" step="any" value="${esc(draft.area_m2)}"></label><label>작업인원 (명)<input name="worker_count" type="number" min="0" step="1" value="${esc(draft.worker_count)}"></label></div>
        <h3>구입·사용한 자재</h3><p class="field-hint">농약·비료의 안전성이나 사용 적합성은 판정하지 않아요.</p>${draft.inputs.map((item, index) => `<fieldset class="material-row"><legend>자재 ${index + 1}</legend><div class="form-two"><label>구분<select name="input-${index}-action"><option value="use" ${item.action === 'use' ? 'selected' : ''}>사용</option><option value="purchase" ${item.action === 'purchase' ? 'selected' : ''}>구입</option></select></label><label>종류<select name="input-${index}-kind">${Object.entries({ pesticide: '농약', fertilizer: '비료', seed: '종자', other: '기타' }).map(([key, label]) => `<option value="${key}" ${item.kind === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>제품명<input name="input-${index}-name" value="${esc(item.name)}" maxlength="200"></label><label>수량<input name="input-${index}-quantity" type="number" min="0" step="any" value="${esc(item.quantity)}"></label><label>단위<input name="input-${index}-unit" value="${esc(item.unit)}" maxlength="200"></label><label>희석배수<input name="input-${index}-dilution" value="${esc(item.dilution)}" maxlength="200"></label></div><button type="button" class="text-button" data-remove-material="${index}">이 자재 항목 빼기</button></fieldset>`).join('')}<button type="button" class="button secondary" data-action="add-material">${icon('plus')}자재 추가</button></details>` : ''}
      ${step === 3 ? `<div class="preview-heading">${icon('book')}<div><h2>나의 영농일지</h2><p>아직 저장 전이에요. 한 번만 살펴봐 주세요.</p></div></div>${draftSummary(ctx, draft)}<label class="review-check"><input id="reviewed" type="checkbox" ${ui.reviewed ? 'checked' : ''}>날짜·밭·작목·작업 내용을 확인했어요.</label><p class="field-hint">저장하면 연결된 관리자 화면에도 같은 기록이 보여요.<br>로컬 시험용이며, 실농가 개인정보를 넣지 마세요.</p>` : ''}
      <div class="editor-actions">${step > 1 ? '<button type="button" class="button secondary" data-action="prev">이전</button>' : '<button type="button" class="button secondary" data-action="save-draft">임시보관</button>'}<button type="submit" class="button primary" ${ui.saving || (step === 3 && !ui.reviewed) ? 'disabled' : ''}>${ui.saving ? '저장 중…' : step === 3 ? `${icon('check')}확인하고 저장` : `다음 ${icon('arrow')}`}</button></div>
    </form><p class="editor-footnote">${icon('check')}빈칸은 ‘미기재’로 남아요. 자동으로 추정하지 않아요.</p></div>`;
}
function records(ctx) {
  const filters = ctx.ui.filters || {};
  const entries = ctx.data.entries.filter(entry => (!filters.parcel || entry.parcel_id === filters.parcel) && (!filters.status || statusOf(ctx, entry) === filters.status) && (!filters.from || entry.worked_at >= filters.from) && (!filters.to || entry.worked_at <= filters.to));
  return `<div class="page-heading"><div><p class="eyebrow">MY JOURNAL</p><h1>차곡차곡, 내 기록</h1><p>내가 남긴 농사와 담당자의 메모를 함께 살펴봐요.</p></div><button class="button primary" data-action="new">${icon('plus')}새 기록</button></div><form class="panel record-filters" id="farmer-filters"><label>시작일<input name="from" type="date" value="${esc(filters.from)}"></label><label>종료일<input name="to" type="date" value="${esc(filters.to)}"></label><label>밭<select name="parcel"><option value="">모든 밭</option>${ctx.data.profile.parcels.map(parcel => `<option value="${esc(parcel.id)}" ${filters.parcel === parcel.id ? 'selected' : ''}>${esc(parcel.name)}</option>`).join('')}</select></label><label>담당자 확인<select name="status"><option value="">모든 상태</option>${['pending', 'checked', 'needs_changes'].map(status => `<option value="${status}" ${filters.status === status ? 'selected' : ''}>${statusLabel(status)}</option>`).join('')}</select></label><button type="submit" class="button secondary">조회</button></form><div class="section-heading"><h2>기록 ${entries.length}건</h2><button class="text-button" data-action="export">${icon('download')}기간·밭 기준 CSV</button></div><p class="field-hint">CSV는 선택한 기간·밭의 모든 상태를 포함해요.</p>${entries.length ? entries.map(entry => recordCard(ctx, entry)).join('') : '<div class="empty-state"><h3>이 조건에 맞는 기록이 없어요</h3><p>기간이나 밭을 바꿔서 다시 확인해 주세요.</p></div>'}`;
}
function detailScreen(ctx) {
  const entry = ctx.ui.entry;
  const review = ctx.data.reviews[entry.id];
  return `<div class="editor-wrap"><button class="text-button back-button" data-view="records">← 내 기록으로</button><div class="section-heading"><h1>남겨둔 농사 기록</h1>${badge(ctx, entry)}</div>${review ? `<section class="review-message ${esc(review.status)}"><strong>담당자 ${statusLabel(review.status)}</strong><p>${esc(review.note || '기록 내용을 확인했어요.')}</p><small>내부 확인이에요. 인증·농약 안전 판정은 아니에요.</small></section>` : '<p class="field-hint">저장됐어요. 담당자가 확인하면 여기에 알려드려요.</p>'}<article class="panel">${draftSummary(ctx, entry)}<details class="optional-fields"><summary>원문·정정 이력 보기</summary><p class="source-text">${esc(entry.source_text)}</p><small>기록 ID: ${esc(entry.id)}</small>${(ctx.ui.entryHistory || []).map(item => `<p class="history-line">${esc(item.created_at)}<br>${esc(item.details || item.work_type)}${item.id === entry.id ? ' · 현재 보고 있는 버전' : ''}</p>`).join('')}${entry.attachments?.length ? `<p>첨부 ${entry.attachments.length}개는 기존 음성·사진 앱에서 확인할 수 있어요.</p><a class="button secondary" href="/">음성·사진 앱 열기</a>` : ''}</details><button class="button primary full-width" data-action="correct">${icon('edit')}내용 보완·정정하기</button><p class="field-hint">원래 기록은 남겨두고 새 버전을 저장해요.<br>정정한 기록은 담당자 확인 대기로 돌아가요.</p></article></div>`;
}
function farm(ctx) {
  const profile = ctx.data.profile;
  return `<div class="editor-wrap"><p class="eyebrow">FARM SETTINGS</p><h1>내 농장</h1><p class="intro-text">처음 보이는 필지·작목은 예시예요. 시험용 이름으로 바꿔보세요.<br>기존 기록의 필지명은 당시 이름으로 보존돼요.</p><form id="farm-form" class="panel editor-panel"><label>농장 이름<input name="farm_name" value="${esc(profile.farm_name)}" maxlength="80" required></label>${profile.parcels.map((parcel, index) => `<fieldset class="farm-fieldset"><legend>${icon('field')}필지 ${index + 1}</legend><div class="form-two"><label>밭 이름<input name="parcel-${index}-name" value="${esc(parcel.name)}" maxlength="80" required></label><label>작목<input name="parcel-${index}-crop" value="${esc(parcel.crop)}" maxlength="80"></label><label>다르게 부르는 이름<input name="parcel-${index}-aliases" value="${esc(parcel.aliases.join(', '))}" placeholder="쉼표로 구분"></label><label>면적 (㎡)<input name="parcel-${index}-area_m2" type="number" min="0" step="any" value="${esc(parcel.area_m2)}"></label></div></fieldset>`).join('')}<div class="editor-actions"><button type="button" class="button secondary" data-action="add-parcel" ${profile.parcels.length >= 10 ? 'disabled' : ''}>${icon('plus')}밭 추가</button><button type="submit" class="button primary" ${ctx.ui.saving ? 'disabled' : ''}>농장 설정 저장</button></div></form><section class="quiet-note">${icon('alert')}<p>이 화면의 역할 전환은 시연용이에요. 농업인·관리자 로그인과 농가별 접근 권한은 아직 없어요. 같은 컴퓨터를 사용하는 사람은 같은 기록을 볼 수 있어요.</p></section></div>`;
}
export function renderFarmer(ctx) {
  return ({ home, edit: editScreen, records, detail: detailScreen, farm }[ctx.ui.view] || home)(ctx);
}
function collectForm(ctx) {
  const form = document.querySelector('#record-form');
  if (!form) return;
  const data = new FormData(form);
  const draft = ctx.ui.draft;
  for (const key of ['worked_at', 'crop', 'details', 'weather', 'harvest_unit']) {
    if (data.has(key)) draft[key] = String(data.get(key)).trim() || (key === 'details' ? '' : null);
  }
  for (const key of ['duration_minutes', 'area_m2', 'worker_count', 'harvest_amount']) {
    if (data.has(key)) draft[key] = data.get(key) === '' ? null : Number(data.get(key));
  }
  draft.inputs.forEach((item, index) => {
    for (const key of ['action', 'kind', 'name', 'quantity', 'unit', 'dilution']) {
      const name = `input-${index}-${key}`;
      if (data.has(name)) item[key] = data.get(name) === '' ? null : key === 'quantity' ? Number(data.get(name)) : String(data.get(name)).trim() || null;
    }
  });
}
function sourceFor(ctx) {
  const draft = ctx.ui.draft;
  return `[직접 선택한 항목] ${draft.worked_at || '날짜 미선택'} / ${parcelName(ctx, draft.parcel_id)} / ${draft.crop || '작목 미선택'} / ${draft.work_type || '작업 미선택'}\n[직접 입력한 메모] ${draft.details || '미기재'}`;
}
async function persistSession(ctx) {
  if (ctx.ui.session) {
    ctx.ui.session = await api(`sessions/${ctx.ui.session.id}/draft`, { draft: ctx.ui.draft });
  } else {
    // Freeze the creation payload until its response is recovered. Never create a second session after a timeout.
    ctx.ui.manualPending ??= { draft: structuredClone(ctx.ui.draft), sourceText: sourceFor(ctx), requestKey: ctx.ui.confirmKey + '-session' };
    ctx.ui.session = await api('manual-sessions', ctx.ui.manualPending);
    ctx.ui.manualPending = null;
    if (JSON.stringify(ctx.ui.session.draft) !== JSON.stringify(ctx.ui.draft)) {
      ctx.ui.session = await api(`sessions/${ctx.ui.session.id}/draft`, { draft: ctx.ui.draft });
    }
  }
  return ctx.ui.session;
}
function profileFromForm(ctx) {
  const form = document.querySelector('#farm-form');
  const data = new FormData(form);
  return {
    farm_name: String(data.get('farm_name')).trim(),
    parcels: ctx.data.profile.parcels.map((parcel, index) => ({
      ...parcel,
      name: String(data.get(`parcel-${index}-name`)).trim(),
      crop: String(data.get(`parcel-${index}-crop`)).trim() || null,
      aliases: String(data.get(`parcel-${index}-aliases`)).split(',').map(value => value.trim()).filter(Boolean),
      area_m2: data.get(`parcel-${index}-area_m2`) === '' ? null : Number(data.get(`parcel-${index}-area_m2`))
    }))
  };
}
export function bindFarmer(ctx) {
  const screen = document.querySelector('#screen');
  const run = async action => {
    if (ctx.ui.saving) return;
    ctx.ui.saving = true;
    screen.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try { await action(); } catch (error) { ctx.notify(error.message); }
    finally { ctx.ui.saving = false; ctx.render(); }
  };
  const confirmRecord = async () => {
    if (!ctx.ui.confirmPending) { await persistSession(ctx); ctx.ui.confirmPending = true; }
    let result;
    try {
      result = await api(`sessions/${ctx.ui.session.id}/confirm`, { reviewed: true, idempotencyKey: ctx.ui.confirmKey });
    } catch (error) {
      // Explicit client rejection means no uncertain write: return to editable preview.
      if (error.status && error.status < 500) ctx.ui.confirmPending = false;
      throw error;
    }
    ctx.ui.confirmPending = false;
    ctx.ui.entry = result.entry;
    ctx.ui.entryHistory = [];
    ctx.ui.draft = null;
    ctx.ui.session = null;
    ctx.ui.view = 'detail';
    await ctx.refresh();
    ctx.notify('기록을 저장했어요. 관리자 화면에도 같은 기록이 보여요.');
  };
  const begin = () => {
    // Returning home keeps the draft in this tab; a fresh draft is only made when none exists.
    if (!ctx.ui.draft) {
      ctx.ui.draft = emptyDraft();
      ctx.ui.cropEdited = false;
      ctx.ui.manualPending = null;
      ctx.ui.session = null;
      ctx.ui.confirmKey = crypto.randomUUID();
      ctx.ui.confirmPending = false;
      ctx.ui.step = 1;
    }
    ctx.ui.reviewed = false;
    ctx.ui.view = 'edit';
    ctx.render();
  };
  screen.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'new') return begin();
    if (action === 'retry-confirm') return run(confirmRecord);
    if (action === 'back-home') { collectForm(ctx); ctx.ui.view = 'home'; ctx.render(); return; }
    if (action === 'prev') { collectForm(ctx); ctx.ui.reviewed = false; ctx.ui.step--; ctx.render(); return; }
    if (action === 'requests') { ctx.ui.filters = { status: 'needs_changes' }; ctx.ui.view = 'records'; ctx.render(); return; }
    if (action === 'add-material') {
      collectForm(ctx);
      if (ctx.ui.draft.inputs.length >= 100) return ctx.notify('자재는 최대 100개까지 남길 수 있어요.');
      ctx.ui.draft.inputs.push({ action: 'use', kind: 'other', name: null, quantity: null, unit: null, dilution: null });
      ctx.render(); return;
    }
    if (action === 'add-parcel') {
      ctx.data.profile = profileFromForm(ctx);
      ctx.data.profile.parcels.push({ id: crypto.randomUUID(), name: '', aliases: [], crop: null, area_m2: null });
      ctx.render(); return;
    }
    if (action === 'save-draft') {
      collectForm(ctx);
      if (!ctx.ui.confirmKey) ctx.ui.confirmKey = crypto.randomUUID();
      return run(async () => {
        await persistSession(ctx);
        ctx.ui.view = 'home';
        await ctx.refresh();
        ctx.notify('이 컴퓨터에 임시보관했어요. 이어서 쓸 기록에서 다시 열 수 있어요.');
      });
    }
    if (action === 'correct') return run(async () => {
      ctx.ui.session = await api(`entries/${ctx.ui.entry.id}/correct`, {});
      ctx.ui.draft = structuredClone(ctx.ui.session.draft);
      ctx.ui.cropEdited = true;
      ctx.ui.manualPending = null;
      ctx.ui.confirmKey = crypto.randomUUID();
      ctx.ui.step = 1;
      ctx.ui.view = 'edit';
      ctx.ui.reviewed = false;
    });
    if (action === 'export') return run(async () => {
      const filters = ctx.ui.filters || {};
      const dates = ctx.data.entries.map(entry => entry.worked_at).sort();
      await downloadExport({ from: filters.from || dates[0] || today(), to: filters.to || dates.at(-1) || today(), ...(filters.parcel ? { parcel_id: filters.parcel } : {}) }, 'csv');
      ctx.notify('선택한 기간·밭의 CSV를 내려받았어요. 상태 필터는 포함하지 않아요.');
    });
  }));
  screen.querySelectorAll('[data-parcel]').forEach(button => button.addEventListener('click', () => {
    collectForm(ctx);
    const parcel = ctx.data.profile.parcels.find(parcel => parcel.id === button.dataset.parcel);
    ctx.ui.draft.parcel_id = parcel.id;
    if (!ctx.ui.cropEdited || !ctx.ui.draft.crop) ctx.ui.draft.crop = parcel.crop;
    ctx.render();
  }));
  screen.querySelectorAll('[data-work]').forEach(button => button.addEventListener('click', () => {
    collectForm(ctx); ctx.ui.draft.work_type = button.dataset.work; ctx.render();
  }));
  screen.querySelectorAll('[data-remove-material]').forEach(button => button.addEventListener('click', () => {
    collectForm(ctx); ctx.ui.draft.inputs.splice(Number(button.dataset.removeMaterial), 1); ctx.render();
  }));
  screen.querySelectorAll('[data-entry]').forEach(button => button.addEventListener('click', () => run(async () => {
    const result = await api(`entries/${button.dataset.entry}`);
    ctx.ui.entry = result.entry;
    ctx.ui.entryHistory = result.history;
    ctx.ui.view = 'detail';
  })));
  screen.querySelectorAll('[data-session]').forEach(button => button.addEventListener('click', () => run(async () => {
    ctx.ui.session = await api(`sessions/${button.dataset.session}`);
    ctx.ui.draft = structuredClone(ctx.ui.session.draft);
      ctx.ui.cropEdited = true;
      ctx.ui.manualPending = null;
    ctx.ui.confirmKey = crypto.randomUUID();
    ctx.ui.step = 1; ctx.ui.view = 'edit'; ctx.ui.reviewed = false;
  })));
  screen.querySelector('#reviewed')?.addEventListener('change', event => {
    ctx.ui.reviewed = event.target.checked;
    screen.querySelector('[type="submit"]').disabled = !event.target.checked;
  });
  screen.querySelector('#record-form')?.addEventListener('input', event => {
    if (event.target.name === 'crop') ctx.ui.cropEdited = true;
    collectForm(ctx);
  });
  screen.querySelector('#record-form')?.addEventListener('change', () => collectForm(ctx));
  screen.querySelector('#record-form')?.addEventListener('submit', event => {
    event.preventDefault(); collectForm(ctx);
    if (ctx.ui.step === 1) {
      if (!ctx.ui.draft.parcel_id || !ctx.ui.draft.work_type) return ctx.notify('밭과 작업을 하나씩 골라주세요.');
      ctx.ui.step = 2; ctx.render(); return;
    }
    if (ctx.ui.step === 2) {
      const draft = ctx.ui.draft;
      if ((draft.harvest_amount === null) !== (draft.harvest_unit === null)) return ctx.notify('수확량과 단위는 함께 적거나 함께 비워주세요.');
      if (draft.inputs.some(item => (item.quantity === null) !== (item.unit === null))) return ctx.notify('자재 수량과 단위는 함께 적거나 함께 비워주세요.');
      ctx.ui.step = 3; ctx.ui.reviewed = false; ctx.render(); return;
    }
    if (!ctx.ui.reviewed) return;
    run(confirmRecord);
  });
  screen.querySelector('#farmer-filters')?.addEventListener('submit', event => {
    event.preventDefault();
    const filters = Object.fromEntries(new FormData(event.target));
    if (filters.from && filters.to && filters.from > filters.to) return ctx.notify('종료일은 시작일보다 빠를 수 없어요.');
    ctx.ui.filters = filters; ctx.render();
  });
  screen.querySelector('#farm-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const profile = profileFromForm(ctx);
    run(async () => {
      const result = await api('profile', profile);
      ctx.data.profile = result.profile;
      try { await ctx.refresh(); ctx.notify('농장 설정을 저장했어요.'); }
      catch { ctx.notify('농장 설정은 저장됐어요. 다른 기록의 새로고침만 실패했어요.'); }
    });
  });
}
