// Browser-only storage adapter for the public GitHub Pages demo.
// All visitor state stays in the supplied browser storage.
export const DEMO_STORAGE_KEY = 'farm-log-public-demo-v1';
const VERSION = 1;
const WORK_TYPES = ['파종','정식','관수','시비','방제','제초','적심','수확','출하','자재구매','기타'];
const DRAFT_KEYS = ['worked_at','parcel_id','crop','work_type','weather','area_m2','worker_count','duration_minutes','inputs','harvest_amount','harvest_unit','details'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const clone = value => JSON.parse(JSON.stringify(value));
const isoNow = () => new Date().toISOString();
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('JSON object required');
  return value;
};
const allowedKeys = (value, allowed) => {
  object(value);
  if (Object.keys(value).some(key => !allowed.includes(key))) fail('Unknown field');
};
const text = (value, max = 200, allowEmpty = false) => {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim()) || value.includes('\0')) fail('Invalid text');
  return value;
};
const number = (value, max = 1e12) => {
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max)) fail('Invalid number');
  return value;
};
const dateOK = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const emptyDraft = (workedAt = null) => ({ worked_at: workedAt, parcel_id: null, crop: null, work_type: null, weather: null, area_m2: null, worker_count: null, duration_minutes: null, inputs: [], harvest_amount: null, harvest_unit: null, details: '' });
const defaultProfile = () => ({
  farm_name: '팜로그 체험 농장',
  parcels: [
    { id: 'house-3', name: '3번 하우스', aliases: [], crop: '토마토', area_m2: null },
    { id: 'upper-field', name: '윗밭', aliases: [], crop: '고추', area_m2: null }
  ]
});
const emptyState = () => ({ version: VERSION, profile: defaultProfile(), sessions: {}, entries: [], reviews: [], manualRequests: {}, idempotency: {} });

function storage() {
  const candidate = globalThis.localStorage;
  if (!candidate || typeof candidate.getItem !== 'function' || typeof candidate.setItem !== 'function') fail('localStorage is required for the public demo', 503);
  return candidate;
}
function load() {
  const raw = storage().getItem(DEMO_STORAGE_KEY);
  if (!raw) return emptyState();
  try {
    const state = JSON.parse(raw);
    if (!state || state.version !== VERSION || !state.profile || !state.sessions || !Array.isArray(state.entries) || !Array.isArray(state.reviews) || !state.manualRequests || !state.idempotency) return emptyState();
    return state;
  } catch { return emptyState(); }
}
function save(state) {
  storage().setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
}
function uuid() {
  if (!globalThis.crypto?.randomUUID) fail('crypto.randomUUID is required for the public demo', 503);
  return globalThis.crypto.randomUUID();
}
function cleanRoute(path) {
  if (typeof path !== 'string') fail('Path required');
  const [beforeQuery, query = ''] = path.split('?', 2);
  let route = beforeQuery.replace(/^\/+/, '').replace(/^api\/app\//, '');
  try { route = decodeURIComponent(route); } catch { fail('Invalid path'); }
  if (!route || route.includes('..') || route.includes('\\')) fail('Invalid path');
  return { route, params: new URLSearchParams(query) };
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function validateProfile(profile) {
  allowedKeys(profile, ['farm_name', 'parcels']);
  text(profile.farm_name, 80);
  if (!Array.isArray(profile.parcels) || profile.parcels.length > 10) fail('At most 10 parcels');
  const ids = new Set();
  const sensitive = value => {
    if (/(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b|\b\d{6}[- ]?[1-4]\d{6}\b)/.test(value)) fail('Use non-sensitive farm labels only');
  };
  sensitive(profile.farm_name);
  return {
    farm_name: profile.farm_name,
    parcels: profile.parcels.map(parcel => {
      allowedKeys(parcel, ['id', 'name', 'aliases', 'crop', 'area_m2']);
      const id = parcel.id ?? uuid();
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id) || ids.has(id)) fail('Invalid parcel id');
      ids.add(id);
      text(parcel.name, 80); sensitive(parcel.name);
      if (!Array.isArray(parcel.aliases) || parcel.aliases.length > 10) fail('Invalid aliases');
      parcel.aliases.forEach(alias => { text(alias, 80); sensitive(alias); });
      if (parcel.crop !== null) text(parcel.crop, 80);
      number(parcel.area_m2);
      return { id, name: parcel.name, aliases: [...parcel.aliases], crop: parcel.crop, area_m2: parcel.area_m2 };
    })
  };
}
function validateDraft(draft, profile) {
  allowedKeys(draft, DRAFT_KEYS);
  for (const key of DRAFT_KEYS) if (!own(draft, key)) fail('Missing draft field: ' + key);
  if (draft.worked_at !== null && !dateOK(draft.worked_at)) fail('Invalid worked_at');
  if (draft.parcel_id !== null && !profile.parcels.some(parcel => parcel.id === draft.parcel_id)) fail('Unknown parcel');
  for (const key of ['crop', 'weather', 'harvest_unit']) if (draft[key] !== null) text(draft[key], 200);
  if (draft.work_type !== null) {
    text(draft.work_type, 120);
    if (draft.work_type.split('·').some(type => !WORK_TYPES.includes(type))) fail('Invalid work_type');
  }
  for (const key of ['area_m2', 'worker_count', 'duration_minutes', 'harvest_amount']) number(draft[key]);
  if (draft.worker_count !== null && !Number.isInteger(draft.worker_count)) fail('worker_count must be integer');
  if ((draft.harvest_amount === null) !== (draft.harvest_unit === null)) fail('Harvest amount and unit must be paired');
  text(draft.details, 100000, true);
  if (!Array.isArray(draft.inputs) || draft.inputs.length > 100) fail('Invalid inputs');
  const inputs = draft.inputs.map(input => {
    allowedKeys(input, ['action', 'kind', 'name', 'quantity', 'unit', 'dilution']);
    if (Object.keys(input).length !== 6 || !['purchase', 'use'].includes(input.action) || !['pesticide', 'fertilizer', 'seed', 'other'].includes(input.kind)) fail('Invalid input');
    for (const key of ['name', 'unit', 'dilution']) if (input[key] !== null) text(input[key], 200);
    number(input.quantity);
    if ((input.quantity === null) !== (input.unit === null)) fail('Input quantity and unit must be paired');
    return clone(input);
  });
  return { ...clone(draft), inputs };
}
const ready = draft => ['worked_at', 'parcel_id', 'crop', 'work_type'].every(key => typeof draft[key] === 'string' && draft[key].trim());
function currentEntries(state, filters = {}) {
  const superseded = new Set(state.entries.map(entry => entry.supersedes).filter(Boolean));
  return state.entries.filter(entry => !superseded.has(entry.id) && (!filters.from || entry.worked_at >= filters.from) && (!filters.to || entry.worked_at <= filters.to) && (!filters.parcel_id || entry.parcel_id === filters.parcel_id)).sort((a, b) => b.worked_at.localeCompare(a.worked_at) || b.created_at.localeCompare(a.created_at));
}
function latestReviews(state) {
  const reviews = {};
  for (const review of state.reviews) reviews[review.entry_id] = review;
  return reviews;
}
function source(session) { return session.messages.filter(message => message.role === 'user').map(message => message.text).join('\n'); }
function getSession(state, id) {
  if (!UUID.test(id) || !state.sessions[id]) fail('Session not found', 404);
  return state.sessions[id];
}
function getEntry(state, id) {
  const entry = state.entries.find(item => item.id === id);
  if (!entry) fail('Entry not found', 404);
  return entry;
}
function summary(state) {
  const entries = currentEntries(state), reviews = latestReviews(state);
  const total = { total: entries.length, pending: 0, checked: 0, needs_changes: 0 };
  for (const entry of entries) total[reviews[entry.id]?.status ?? 'pending']++;
  return total;
}
function historyFor(state, entry) {
  const ids = new Set([entry.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of state.entries) {
      if ((ids.has(item.id) && item.supersedes && !ids.has(item.supersedes)) || (item.supersedes && ids.has(item.supersedes) && !ids.has(item.id))) {
        ids.add(item.id);
        if (item.supersedes) ids.add(item.supersedes);
        changed = true;
      }
    }
  }
  return { history: state.entries.filter(item => ids.has(item.id)), reviewHistory: state.reviews.filter(review => ids.has(review.entry_id)) };
}
const escapeHTML = value => String(value ?? '미기재').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const csvCell = value => {
  let cell = String(value ?? '미기재');
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(cell)) cell = "'" + cell;
  return '"' + cell.replaceAll('"', '""') + '"';
};
function buildExport(entries) {
  const headers = ['작업일', '필지', '작목', '날씨', '작업명', '세부 작업내용', '근거 이벤트 ID'];
  const rows = entries.map(entry => [entry.worked_at, entry.parcel_name, entry.crop, entry.weather, entry.work_type, entry.details, entry.id]);
  const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>팜로그 체험 농장 영농일지</title></head><body><h1>팜로그 체험 농장 영농일지</h1>${rows.length ? rows.map(row => `<article>${headers.map((header, index) => `<p><strong>${escapeHTML(header)}</strong>: ${escapeHTML(row[index])}</p>`).join('')}</article>`).join('') : '<p>선택한 기간에 저장된 일지가 없어요.</p>'}</body></html>`;
  return { csv, html, event_ids: entries.map(entry => entry.id), title: '팜로그 체험 농장 영농일지' };
}

export function resetDemo() {
  storage().removeItem(DEMO_STORAGE_KEY);
}
export function demoStorageInfo() {
  const raw = storage().getItem(DEMO_STORAGE_KEY);
  return { key: DEMO_STORAGE_KEY, version: VERSION, hasData: raw !== null, bytes: raw?.length ?? 0 };
}

export async function demoApi(path, body) {
  const { route, params } = cleanRoute(path);
  const isGet = body === undefined;
  const state = load();
  const respond = value => clone(value);

  if (route === 'workspace' && isGet) {
    const entries = currentEntries(state), reviews = latestReviews(state);
    return respond({ profile: state.profile, entries, reviews, summary: summary(state), pending: Object.values(state.sessions).filter(session => !session.confirmedEntryId).map(session => ({ id: session.id, updated_at: session.updated_at, preview: source(session).slice(0, 120) })) });
  }
  if (route === 'entries' && isGet) {
    const filters = Object.fromEntries(params);
    allowedKeys(filters, ['from', 'to', 'parcel_id']);
    if (filters.from && !dateOK(filters.from)) fail('Invalid from');
    if (filters.to && !dateOK(filters.to)) fail('Invalid to');
    if (filters.from && filters.to && filters.from > filters.to) fail('Invalid date range');
    if (filters.parcel_id) text(filters.parcel_id, 80);
    return respond({ entries: currentEntries(state, filters) });
  }
  if (route === 'profile' && !isGet) {
    state.profile = validateProfile(body); save(state); return respond({ profile: state.profile });
  }
  if (route === 'manual-sessions' && !isGet) {
    allowedKeys(body, ['draft', 'sourceText', 'requestKey']);
    text(body.sourceText, 100000);
    let key, digest;
    if (body.requestKey !== undefined) {
      key = body.requestKey;
      if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(key)) fail('Invalid manual requestKey');
      digest = canonical({ draft: body.draft, sourceText: body.sourceText });
      const prior = own(state.manualRequests, key) ? state.manualRequests[key] : null;
      if (prior) {
        if (prior.digest !== digest) fail('Manual request key conflict', 409);
        return respond(getSession(state, prior.sessionId));
      }
    }
    const draft = validateDraft(body.draft, state.profile), timestamp = isoNow();
    const session = { id: uuid(), workedAt: draft.worked_at, messages: [{ role: 'user', text: body.sourceText, created_at: timestamp }], draft, question: null, clarificationCount: 0, engine: 'manual', warnings: [], attachments: [], ready: ready(draft), updated_at: timestamp };
    state.sessions[session.id] = session;
    if (key) state.manualRequests[key] = { key, digest, sessionId: session.id };
    save(state); return respond(session);
  }

  const sessionMatch = route.match(/^sessions\/([^/]+)(?:\/(draft|confirm))?$/);
  if (sessionMatch) {
    const [, id, action] = sessionMatch;
    const session = getSession(state, id);
    if (!action && isGet) return respond(session);
    if (!action || isGet) fail('Method not allowed', 405);
    if (action === 'draft') {
      if (session.confirmedEntryId) fail('Saved session is immutable; create correction', 409);
      allowedKeys(body, ['draft']);
      session.draft = validateDraft(body.draft, state.profile);
      session.workedAt = session.draft.worked_at;
      session.question = null;
      session.ready = ready(session.draft);
      session.updated_at = isoNow();
      save(state); return respond(session);
    }
    allowedKeys(body, ['reviewed', 'idempotencyKey', 'supersedes']);
    if (body.reviewed !== true || typeof body.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.idempotencyKey)) fail('Explicit review and valid idempotency key required');
    if (body.supersedes !== undefined && body.supersedes !== (session.supersedes ?? null)) fail('Correction target is server-fixed', 409);
    const digest = canonical({ session: session.id, draft: session.draft, supersedes: session.supersedes ?? null, reviewed: true });
    const prior = own(state.idempotency, body.idempotencyKey) ? state.idempotency[body.idempotencyKey] : null;
    if (prior) {
      if (prior.digest !== digest) fail('Idempotency conflict', 409);
      return respond({ entry: getEntry(state, prior.entryId), duplicate: true });
    }
    if (session.confirmedEntryId) fail('Session already confirmed', 409);
    if (!ready(session.draft)) fail('Four required fields must be completed');
    if (session.supersedes && !currentEntries(state).some(entry => entry.id === session.supersedes)) fail('Correction target is no longer current', 409);
    const parcel = state.profile.parcels.find(item => item.id === session.draft.parcel_id);
    const entry = { ...clone(session.draft), id: uuid(), session_id: session.id, parcel_name: parcel.name, created_at: isoNow(), supersedes: session.supersedes ?? null, source_text: source(session), attachments: [], engine: 'manual', regulatory_status: 'not_checked', reviewed: true };
    session.confirmedEntryId = entry.id;
    session.updated_at = isoNow();
    state.entries.push(entry);
    state.idempotency[body.idempotencyKey] = { key: body.idempotencyKey, digest, entryId: entry.id };
    save(state); return respond({ entry, duplicate: false });
  }

  const entryMatch = route.match(/^entries\/([^/]+)(?:\/(correct|review))?$/);
  if (entryMatch) {
    const [, id, action] = entryMatch;
    const entry = getEntry(state, id);
    if (!action && isGet) return respond({ entry, ...historyFor(state, entry) });
    if (!action || isGet) fail('Method not allowed', 405);
    if (action === 'correct') {
      allowedKeys(body, []);
      if (!currentEntries(state).some(item => item.id === entry.id)) fail('Current entry not found', 404);
      const original = getSession(state, entry.session_id);
      const draft = Object.fromEntries(DRAFT_KEYS.map(key => [key, clone(entry[key])]));
      const session = { ...clone(original), id: uuid(), draft, workedAt: draft.worked_at, supersedes: entry.id, updated_at: isoNow(), question: null, clarificationCount: 2, ready: true };
      delete session.confirmedEntryId;
      state.sessions[session.id] = session;
      save(state); return respond(session);
    }
    allowedKeys(body, ['status', 'note', 'expectedReviewId']);
    if (!['checked', 'needs_changes'].includes(body.status)) fail('Invalid review status');
    const note = body.note === undefined && body.status === 'checked' ? '' : body.note;
    text(note, 1000, body.status === 'checked');
    if (!own(body, 'expectedReviewId') || (body.expectedReviewId !== null && typeof body.expectedReviewId !== 'string')) fail('expectedReviewId must be a review id or null');
    if (!currentEntries(state).some(item => item.id === entry.id)) fail('Entry is no longer current', 409);
    const latest = latestReviews(state)[entry.id];
    if (body.expectedReviewId !== (latest?.id ?? null)) fail('Review changed; reload workspace', 409);
    const review = { id: uuid(), entry_id: entry.id, status: body.status, note, created_at: isoNow() };
    state.reviews.push(review); save(state); return respond({ review });
  }

  if (route === 'export' && !isGet) {
    allowedKeys(body, ['from', 'to', 'parcel_id', 'reviewed']);
    if (body.reviewed !== true || !dateOK(body.from) || !dateOK(body.to) || body.from > body.to) fail('Review and date range required');
    if (body.parcel_id !== undefined) text(body.parcel_id, 80);
    return respond(buildExport(currentEntries(state, body)));
  }
  fail('Not found', 404);
}
