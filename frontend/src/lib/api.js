import { authHeaders, getRefreshToken, logout, saveToken } from './auth';

const configuredApiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export const API_ROOT = configuredApiUrl.endsWith('/api')
  ? configuredApiUrl.slice(0, -4)
  : configuredApiUrl;

export function apiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_ROOT}/api${normalizedPath}`;
}

function buildHeaders(options = {}) {
  const isFormData = options.body instanceof FormData;
  return {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...authHeaders(),
    ...(options.headers || {})
  };
}

function isAuthFailure(response, body) {
  const message = String(body?.error || '').toLowerCase();
  return response.status === 401 || (response.status === 403 && (message.includes('token') || message.includes('session')));
}

function expireSession() {
  logout();
  window.dispatchEvent(new Event('iems-auth-expired'));
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const response = await fetch(apiUrl('/auth/refresh-token'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.token) return false;

  saveToken(body.token);
  return true;
}

async function parseResponse(response) {
  return response.json().catch(() => null);
}

export async function request(path, options = {}) {
  const execute = () => fetch(apiUrl(path), {
    ...options,
    headers: buildHeaders(options),
    credentials: 'include'
  });

  let response = await execute();
  let body = await parseResponse(response);

  if (!response.ok && isAuthFailure(response, body)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await execute();
      body = await parseResponse(response);
    } else {
      expireSession();
    }
  }

  if (!response.ok) {
    if (isAuthFailure(response, body)) expireSession();
    let detail = body?.error || body?.errors?.join?.(', ') || response.statusText || 'API request failed';
    if (response.status === 403 && String(detail).toLowerCase().includes('unauthorized role')) {
      detail = 'This feature is restricted for your current role.';
    }
    throw new Error(`${detail} (${response.status})`);
  }

  return body;
}

export async function requestBlob(path) {
  const execute = () => fetch(apiUrl(path), { headers: buildHeaders(), credentials: 'include' });
  let response = await execute();
  if (!response.ok && isAuthFailure(response, await parseResponse(response))) {
    if (await refreshAccessToken()) response = await execute();
    else expireSession();
  }
  if (!response.ok) {
    const body = await parseResponse(response);
    throw new Error(body?.error || `Document could not be opened (${response.status}).`);
  }
  return response.blob();
}

export function buildFormData(payload) {
  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      formData.append(key, value);
    }
  });
  return formData;
}
