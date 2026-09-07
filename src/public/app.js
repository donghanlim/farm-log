'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const state = { bootstrap: null, fixtureId: null, draft: null, supersedes: null, records: [], busy: false, retry: null, ledgerLoading: false, evalLoading: false, reportLoading: false };
  const fieldIds = { worked_at: 'worked-at', parcel_id: 'parcel-id', crop: 'crop', work_type: 'work-type', amount: 'amount', unit: 'unit' };
  const labels = { worked_at: '작업일', parcel_id: '필지', crop: '작물', work_type: '작업 유형', amount: '작업량', unit: '단위' };
  const node = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined && text !== null) el.textContent = String(text); if (className) el.className = className; return el; };
  const status = (id, text, type = '') => { $(id).textContent = text; $(id).classList.remove('error', 'success'); if (type) $(id).classList.add(type); };
  const stringify = (value) => typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  async function api(route, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(route, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, cache: 'no-store', credentials: 'same-origin', redirect: 'error' });
      let data;
      try { data = await res.json(); } catch { throw new Error('서버가 JSON 계약과 다른 응답을 반환했어요. 서버 상태를 확인해 주세요.'); }
      if (!res.ok) throw new Error(data?.error || ('서버 오류 HTTP ' + res.status));
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('서버 응답이 지연돼요. 저장 요청이었다면 반영 여부가 불확실해요. 원장을 확인하거나 같은 값으로 다시 시도해 주세요.');
      if (error instanceof TypeError) throw new Error('로컬 서버에 연결하지 못했어요. 서버 실행 상태를 확인하고 다시 시도해 주세요. 저장 여부를 확인할 때는 원장을 새로고침해 주세요.');
      throw error;
    } finally { clearTimeout(timer); }
  }
  function syncButtons() {
    $('extract').disabled = state.busy || !state.fixtureId || !state.bootstrap;
    $('save').disabled = state.busy || !state.draft || !$('reviewed').checked;
    $('cancel-edit').disabled = state.busy;
    document.querySelectorAll('.fixture').forEach((el) => { el.disabled = state.busy; });
    Object.values(fieldIds).forEach((id) => { $(id).disabled = state.busy; });
    $('reviewed').disabled = state.busy;
    document.querySelectorAll('[data-correct]').forEach((el) => { el.disabled = state.busy; });
    $('download-report').disabled = state.reportLoading || !$('report-reviewed').checked;
  }
  function selectOptions(id, values) {
    const el = $(id); el.replaceChildren(node('option', '선택하지 않음')); el.firstElementChild.value = '';
    values.forEach((value) => { const opt = node('option', typeof value === 'string' ? value : value.name); opt.value = typeof value === 'string' ? value : value.id; el.append(opt); });
  }
  function clearDraft() {
    state.draft = null; state.supersedes = null; state.retry = null;
    $('review-form').hidden = true; $('review-empty').hidden = false; $('reviewed').checked = false;
    $('mode-tag').textContent = 'HUMAN IN THE LOOP'; syncButtons();
  }
  function renderFixtures() {
    $('fixtures').replaceChildren();
    state.bootstrap.fixtures.forEach((fixture, index) => {
      const button = node('button', null, 'fixture'); button.type = 'button'; button.setAttribute('aria-pressed', String(fixture.id === state.fixtureId));
      const radio = node('span', null, 'fixture-radio'); radio.setAttribute('aria-hidden', 'true');
      const copy = node('span'); copy.append(node('strong', fixture.title), node('small', 'SYNTHETIC SAMPLE ' + String(index + 1).padStart(2, '0'))); button.append(radio, copy);
      button.addEventListener('click', () => {
        if (state.busy) return;
        state.fixtureId = fixture.id; clearDraft(); $('source-text').textContent = fixture.text;
        $('trace').replaceChildren(node('li', '추출 후 서버의 trace를 표시해요.', 'muted'));
        renderFixtures(); syncButtons();
      }); $('fixtures').append(button);
    });
    if (!state.bootstrap.fixtures.length) $('fixtures').append(node('p', '서버에 등록된 합성 예시가 없어요.', 'muted'));
  }
  function readFields() {
    const result = {};
    Object.entries(fieldIds).forEach(([key, id]) => { const raw = $(id).value.trim(); result[key] = raw === '' ? null : key === 'amount' ? Number(raw) : raw; });
    return result;
  }
  function renderMissing() {
    const fields = readFields(); const missing = Object.keys(fieldIds).filter((key) => fields[key] === null);
    $('missing-status').textContent = missing.length ? '미입력 ' + missing.length + '개 (작업량·단위는 선택 항목) · ' + missing.map((key) => labels[key]).join(', ') + ' · 모르면 비워 두고 검토할 수 있어요.' : '입력 항목이 채워졌어요. 정확성·안전성을 보증하는 표시는 아니에요.';
    $('missing-status').classList.toggle('complete', !missing.length);
    Object.entries(fieldIds).forEach(([key, id]) => $(id).closest('.field').classList.toggle('is-missing', missing.includes(key)));
  }
  function showDraft(draft, supersedes = null) {
    state.draft = draft; state.supersedes = supersedes; state.retry = null; state.fixtureId = draft.fixtureId;
    $('review-form').hidden = false; $('review-empty').hidden = true; $('reviewed').checked = false;
    $('mode-tag').textContent = supersedes ? 'APPEND-ONLY CORRECTION' : 'HUMAN IN THE LOOP';
    $('correction-note').hidden = !supersedes; $('correction-note').textContent = supersedes ? '정정 대상: ' + supersedes + ' · 원본은 보존하고 새 event로 연결해요.' : '';
    $('save').textContent = supersedes ? '정정 이벤트 추가' : '검토한 기록 저장';
    Object.entries(fieldIds).forEach(([key, id]) => { $(id).value = draft[key] ?? ''; });
    $('source-text').textContent = draft.raw_input || state.bootstrap.fixtures.find((f) => f.id === draft.fixtureId)?.text || '원문 없음';
    $('warnings').replaceChildren(); (Array.isArray(draft.warnings) ? draft.warnings : []).forEach((warning) => $('warnings').append(node('li', stringify(warning))));
    $('question').hidden = !draft.question; $('question').textContent = draft.question || '';
    status('save-status', '아직 저장되지 않은 검토 초안이에요.'); renderMissing(); renderFixtures(); syncButtons();
  }
  $('extract').addEventListener('click', async () => {
    if (state.busy || !state.fixtureId) return;
    clearDraft(); $('trace').replaceChildren(node('li', '현재 요청의 trace를 기다리고 있어요.', 'muted')); state.busy = true; syncButtons(); status('global-status', '결정론적 baseline으로 예시를 추출하는 중이에요.');
    try {
      const data = await api('/api/extract', { fixtureId: state.fixtureId });
      if (!data?.draft || !Array.isArray(data.trace)) throw new Error('추출 응답이 계약과 달라요. 저장하지 않았어요.');
      showDraft(data.draft); $('trace').replaceChildren();
      data.trace.forEach((item) => { const li = node('li', null, 'trace-item'); li.append(node('span', stringify(item.status)), node('h4', stringify(item.agent)), node('p', stringify(item.detail))); $('trace').append(li); });
      if (!data.trace.length) $('trace').append(node('li', '서버가 반환한 trace가 비어 있어요.', 'muted'));
      status('global-status', '추출 초안을 받았어요. 원문과 대조한 뒤 직접 검토해 주세요.', 'success');
    } catch (error) { $('trace').replaceChildren(node('li', '추출에 실패해 현재 요청의 trace를 확인하지 못했어요.', 'error')); status('global-status', error.message, 'error'); }
    finally { state.busy = false; syncButtons(); }
  });
  Object.values(fieldIds).forEach((id) => $(id).addEventListener('input', () => { $('reviewed').checked = false; renderMissing(); syncButtons(); }));
  $('reviewed').addEventListener('change', syncButtons);
  $('cancel-edit').addEventListener('click', () => { clearDraft(); status('global-status', '검토를 취소했어요. 새 기록은 저장하지 않았어요.'); });
  function idempotencyKey() { return globalThis.crypto?.randomUUID ? crypto.randomUUID() : 'review-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2); }
  $('review-form').addEventListener('submit', async (event) => {
    event.preventDefault(); if (state.busy || !state.draft || !$('reviewed').checked) return;
    const payload = { fixtureId: state.draft.fixtureId, fields: readFields(), reviewed: true };
    if (state.supersedes) payload.supersedes = state.supersedes;
    const signature = JSON.stringify(payload);
    if (!state.retry || state.retry.signature !== signature) state.retry = { signature, key: idempotencyKey() };
    payload.idempotencyKey = state.retry.key;
    state.busy = true; syncButtons(); status('save-status', '서버가 저장을 확인할 때까지 기다리는 중이에요.');
    try {
      const data = await api('/api/records', payload);
      if (!data?.record?.event_id || typeof data.duplicate !== 'boolean') throw new Error('저장 응답이 계약과 달라요. 저장 성공으로 표시하지 않아요. 원장을 확인해 주세요.');
      const message = data.duplicate ? '동일 요청의 기존 기록을 확인했어요. 중복 추가하지 않았어요. ' : '서버가 검토 기록 저장을 확인했어요. ';
      clearDraft(); $('report-reviewed').checked = false;
      status('global-status', message + 'event ID: ' + data.record.event_id, 'success');
      await loadLedger();
    } catch (error) { status('save-status', error.message + ' 같은 값으로 재시도하면 동일 idempotency key를 사용해요.', 'error'); }
    finally { state.busy = false; syncButtons(); }
  });
  const parcelName = (id) => state.bootstrap?.parcels.find((p) => p.id === id)?.name || id || '미입력';
  function renderRecords() {
    const records = state.records; const superseded = new Set(records.map((r) => r.supersedes).filter(Boolean)); const byId = new Map(records.map((r) => [r.event_id, r]));
    const current = records.filter((r) => !superseded.has(r.event_id));
    $('ledger-count').textContent = '최신 유효 ' + current.length + ' · 전체 이벤트 ' + records.length;
    $('records').replaceChildren();
    if (!records.length) { $('records').append(node('div', '아직 저장된 기록이 없어요. 현장 기록에서 합성 예시를 검토하고 저장해 주세요.', 'card empty')); return; }
    [...records].reverse().forEach((record) => {
      const active = !superseded.has(record.event_id); const card = node('article', null, 'card record' + (active ? '' : ' superseded'));
      const head = node('div', null, 'record-head'); const intro = node('div'); intro.append(node('h3', (record.worked_at || '작업일 미입력') + ' · ' + (record.crop || '작물 미입력') + ' ' + (record.work_type || '작업 미입력'), 'record-title'), node('div', 'event ID · ' + record.event_id, 'record-id')); head.append(intro);
      if (active) { const button = node('button', '최신 기록 정정', 'button secondary'); button.type = 'button'; button.dataset.correct = record.event_id; button.addEventListener('click', () => { if (state.busy) return; if (!state.bootstrap) { status('ledger-status', '기본 데이터를 먼저 연결해 주세요.', 'error'); return; } showDraft(record, record.event_id); $('trace').replaceChildren(node('li', '기존 기록의 사람 정정이에요. 재추출 trace를 생성하지 않아요.', 'muted')); switchTab('capture'); $('worked-at').focus(); }); head.append(button); } else head.append(node('span', '정정됨 · 원본 보존', 'tiny-tag'));
      card.append(head); const values = node('div', null, 'record-values'); [parcelName(record.parcel_id), '작업량 ' + (record.amount ?? '미입력') + ' ' + (record.unit || '단위 미입력'), active ? '최신 유효' : '과거 이력', record.reviewed === true ? '사람 검토됨' : '검토 상태 확인 필요'].forEach((value) => values.append(node('span', value))); card.append(values);
      const missing = Array.isArray(record.missing) ? record.missing : Object.keys(fieldIds).filter((key) => record[key] == null || record[key] === '');
      card.append(node('p', missing.length ? '누락: ' + missing.map((key) => labels[key] || key).join(', ') : '누락값 없음 · 규정 검증과는 별개예요.', 'fine'));
      card.append(node('p', '농약 안전·외부 규정: not_checked (미검증)', 'safety-inline'));
      const detail = node('details'); detail.append(node('summary', '원문 · 근거 event ID · 정정 이력 보기')); detail.append(node('pre', record.raw_input || '원문 없음', 'record-raw'));
      detail.append(node('p', '근거: ' + record.event_id + ' / 합성 예시 ' + record.fixtureId, 'record-id'));
      detail.append(node('p', '기록 생성: ' + record.created_at + ' / source: ' + record.source, 'record-id'));
      const history = node('ol', null, 'history'); const chain = []; const visited = new Set(); let cursor = record;
      while (cursor && !visited.has(cursor.event_id)) { visited.add(cursor.event_id); chain.unshift(cursor); cursor = byId.get(cursor.supersedes); }
      chain.forEach((entry) => history.append(node('li', entry.event_id + (entry.supersedes ? ' · supersedes: ' + entry.supersedes : ' · 최초 기록'))));
      records.filter((r) => r.supersedes === record.event_id).forEach((child) => history.append(node('li', '후속 정정 → ' + child.event_id)));
      detail.append(history); if (record.warnings?.length) detail.append(node('pre', stringify(record.warnings), 'fine')); card.append(detail); $('records').append(card);
    }); syncButtons();
  }
  async function loadLedger() {
    if (state.ledgerLoading) return; state.ledgerLoading = true; $('refresh-ledger').disabled = true; $('report-reviewed').checked = false; syncButtons(); status('ledger-status', '서버의 전체 이벤트 이력을 조회하는 중이에요.');
    try { const data = await api('/api/records'); if (!Array.isArray(data?.records)) throw new Error('원장 응답이 계약과 달라요.'); state.records = data.records; renderRecords(); status('ledger-status', '서버 조회 완료 · 원본은 변경하거나 삭제할 수 없어요.'); }
    catch (error) { status('ledger-status', error.message + ' 아래 기존 표시가 있다면 마지막 조회본이며 최신 상태는 확인되지 않았어요.', 'error'); }
    finally { state.ledgerLoading = false; $('refresh-ledger').disabled = false; }
  }
  $('refresh-ledger').addEventListener('click', loadLedger);
  $('report-reviewed').addEventListener('change', syncButtons);
  $('download-report').addEventListener('click', async () => {
    if (state.reportLoading || !$('report-reviewed').checked) return;
    state.reportLoading = true; syncButtons(); status('report-status', '서버에서 최신 유효 기록의 내부 검토 초안을 만드는 중이에요.');
    try {
      const data = await api('/api/report', { reviewed: true });
      if (typeof data?.markdown !== 'string' || !Array.isArray(data.event_ids) || !Array.isArray(data.rows)) throw new Error('문서 응답이 계약과 달라 다운로드하지 않았어요.');
      const blob = new Blob([data.markdown], { type: 'text/markdown;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = node('a'); link.href = url; link.download = 'farm-log-synthetic-review-' + new Date().toISOString().slice(0, 10) + '.md'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      status('report-status', 'Markdown 다운로드를 요청했어요. ' + data.event_ids.length + '개 근거 이벤트. ' + (data.warning || '공식 인증서식이 아닌 내부 검토 초안이에요.'), 'success');
      $('report-reviewed').checked = false;
    } catch (error) { status('report-status', error.message, 'error'); }
    finally { state.reportLoading = false; syncButtons(); }
  });
  function renderEvalMetrics(data = null) {
    const validCount = (value) => Number.isSafeInteger(value) && value >= 0;
    const count = (value) => validCount(value) ? value.toLocaleString('ko-KR') : '미확인';
    const comparison = (passed, total) => validCount(passed) && validCount(total) && total > 0 && passed <= total ? count(passed) + ' / ' + count(total) : '미확인';
    $('eval-cases').textContent = count(data?.cases);
    $('eval-fields').textContent = comparison(data?.accuracy?.field_passed, data?.accuracy?.field_total);
    $('eval-rules').textContent = comparison(data?.safety?.passed, data?.safety?.total);
  }
  async function loadEvals() {
    if (state.evalLoading) return; state.evalLoading = true; renderEvalMetrics(); $('refresh-evals').disabled = true; status('eval-status', '서버에 저장된 합성 평가 결과를 조회하는 중이에요.');
    try { const data = await api('/api/evals'); renderEvalMetrics(data); $('eval-results').hidden = data === null; if (data === null) { $('eval-results').textContent = ''; status('eval-status', '저장된 평가 결과가 없어요. 측정 수치나 통과 상태를 만들지 않아요.'); } else { if (typeof data !== 'object' || Array.isArray(data) || data.error) throw new Error('평가 응답이 계약과 달라요.'); $('eval-results').textContent = JSON.stringify(data, null, 2); status('eval-status', '서버에 저장된 결과 원문이에요. 아래 수치는 합성 평가에만 해당하며 실제 사용자 실측이 아니에요.'); } }
    catch (error) { renderEvalMetrics(); $('eval-results').hidden = true; status('eval-status', error.message + ' 평가 결과를 확인하지 못했어요.', 'error'); }
    finally { state.evalLoading = false; $('refresh-evals').disabled = false; }
  }
  $('refresh-evals').addEventListener('click', loadEvals);
  function switchTab(name, focus = false) {
    const names = ['capture', 'ledger', 'business', 'lab']; if (!names.includes(name)) return;
    names.forEach((id) => { const active = id === name; $(id).hidden = !active; $('tab-' + id).setAttribute('aria-selected', String(active)); $('tab-' + id).tabIndex = active ? 0 : -1; });
    if (focus) $('tab-' + name).focus();
    if (name === 'ledger') loadLedger(); if (name === 'lab') loadEvals();
  }
  const tabButtons = [...document.querySelectorAll('[data-tab]')];
  tabButtons.forEach((button, index) => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
    button.addEventListener('keydown', (event) => { let next; if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % tabButtons.length; if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index + tabButtons.length - 1) % tabButtons.length; if (event.key === 'Home') next = 0; if (event.key === 'End') next = tabButtons.length - 1; if (next !== undefined) { event.preventDefault(); switchTab(tabButtons[next].dataset.tab, true); } });
  });
  document.querySelector('.brand').addEventListener('click', (event) => { event.preventDefault(); switchTab('capture'); });
  async function bootstrap() {
    $('retry-bootstrap').hidden = true; status('global-status', '로컬 서버에서 합성 데모를 불러오는 중이에요.');
    try {
      const data = await api('/api/bootstrap');
      if (data?.mode !== 'synthetic-only' || data.engine !== 'deterministic-baseline' || !['fixtures', 'parcels', 'crops', 'workTypes', 'records'].every((key) => Array.isArray(data[key]))) throw new Error('데모 경계 또는 bootstrap 응답이 계약과 달라요. 기록 기능을 시작하지 않았어요.');
      state.bootstrap = data; state.records = data.records;
      selectOptions('parcel-id', data.parcels); selectOptions('crop', data.crops); selectOptions('work-type', data.workTypes);
      renderFixtures(); renderRecords(); status('global-status', '로컬 합성 데모 연결됨 · 예시를 선택해 기록 검토를 시작하세요.', 'success');
    } catch (error) { status('global-status', error.message, 'error'); $('retry-bootstrap').hidden = false; }
    finally { syncButtons(); }
  }
  $('retry-bootstrap').addEventListener('click', bootstrap);
  bootstrap();
})();
