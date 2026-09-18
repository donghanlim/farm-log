// Small, dependency-free helpers shared by the farmer and admin screens.
export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

const paths = {
  leaf: '<path d="M20 3C9 2 3 7 5 14c3 7 14 4 15-11ZM4 21 16 9"/>',
  home: '<path d="m3 10 9-7 9 7v11h-7v-7h-4v7H3Z"/>',
  book: '<path d="M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3ZM12 6v16"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  field: '<path d="M3 21V10l9-7 9 7v11M3 12h18M8 12v9M16 12v9M3 21h18"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14Z"/>',
  alert: '<path d="m12 3 10 18H2ZM12 9v5M12 17v1"/>',
  mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
  camera: '<path d="M3 6h4l2-3h6l2 3h4v15H3Z"/><circle cx="12" cy="13" r="4"/>'
};
export function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.leaf}</svg>`;
}
export const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
export function formatDate(date) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(date || '');
  const parsed = new Date(dateOnly ? `${date}T12:00:00+09:00` : date);
  if (!date || !Number.isFinite(parsed.getTime())) return date || '날짜 없음';
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' }).format(parsed);
}
export function statusOf(ctx, entry) { return ctx.data.reviews[entry.id]?.status || 'pending'; }
export function statusLabel(status) {
  return ({ pending: '확인 대기', checked: '확인 완료', needs_changes: '보완 요청' })[status] || '확인 대기';
}
export async function api(path, body) {
  const response = await fetch(`/api/app/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    signal: AbortSignal.timeout(20000),
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) {
    const readable = {
      'Review changed; reload workspace': '다른 화면에서 먼저 확인했어요. 새로고침한 뒤 다시 시도해 주세요.',
      'Entry is no longer current': '이미 정정된 기록이에요. 목록을 새로고침한 뒤 최신 기록을 열어주세요.',
      'Review conflict': '다른 화면에서 먼저 확인했어요. 새로고침한 뒤 다시 시도해 주세요.',
      'Origin required': '로컬 앱 화면에서 다시 시도해 주세요.',
      'Invalid date range': '종료일은 시작일보다 빠를 수 없어요.'
    };
    throw Object.assign(new Error(readable[data.error] || data.error || `요청 실패 (${response.status})`), { status: response.status });
  }
  return data;
}
export async function downloadExport(filters, type) {
  const result = await api('export', { ...filters, reviewed: true });
  const text = type === 'csv' ? result.csv : result.html;
  const blob = new Blob([text], { type: type === 'csv' ? 'text/csv;charset=utf-8' : 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = type === 'csv' ? 'farm-log-records.csv' : 'farm-log-print.html';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function emptyDraft(date = today()) {
  return { worked_at: date, parcel_id: null, crop: null, work_type: null, weather: null,
    area_m2: null, worker_count: null, duration_minutes: null, inputs: [],
    harvest_amount: null, harvest_unit: null, details: '' };
}
export const workChoices = [
  ['관수', '물 주기'], ['제초', '풀 뽑기'], ['시비', '비료 주기'],
  ['방제', '병해충 관리'], ['수확', '수확'], ['정식', '모종 심기'],
  ['파종', '씨 뿌리기'], ['적심', '순 따기'], ['출하', '출하'], ['자재구매', '자재 구입'], ['기타', '기타']
];
export const workLabel = value => workChoices.find(([key]) => key === value)?.[1] || value || '작업 미선택';

// CSV columns may differ by purpose, but missing-value and formula rules stay shared.
export function csvCell(value) {
  let text = String(value ?? '미기재');
  if (/^[\s\u0000-\u001f\u007f]*[=+\-@＝＋－＠]/u.test(text) || /^[\t\r\n]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
