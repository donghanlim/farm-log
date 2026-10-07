// Local runtime adapter. The public Pages build replaces only this file.
export async function request(path, body) {
  const response = await fetch(`/api/app/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    signal: AbortSignal.timeout(20000),
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || `요청 실패 (${response.status})`), { status: response.status });
  return data;
}

export async function resetRuntime() {
  return false;
}

export function runtimeInfo() {
  return { publicDemo: false, storage: 'local-server' };
}
