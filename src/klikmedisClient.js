let cachedToken = '';

function trimBaseUrl(url) {
  return String(url ?? '').replace(/\/$/, '');
}

async function parseBody(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function loginKlikmedis(baseUrl) {
  const email = process.env.KLIKMEDIS_EMAIL?.trim();
  const password = process.env.KLIKMEDIS_PASSWORD?.trim();

  if (!email || !password) {
    throw new Error('KLIKMEDIS_EMAIL dan KLIKMEDIS_PASSWORD wajib diisi di .env');
  }

  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(body?.message ?? body?.error ?? `Login gagal (HTTP ${response.status})`);
  }

  const token = body?.data?.token;
  if (!token) {
    throw new Error('Login gagal: token JWT tidak ditemukan');
  }

  cachedToken = token;
  return token;
}

async function getAuthToken(baseUrl, forceRefresh = false) {
  if (!forceRefresh && cachedToken) {
    return cachedToken;
  }
  return loginKlikmedis(baseUrl);
}

export async function sendResultToKlikmedis(resultPayload) {
  const baseUrl = trimBaseUrl(process.env.KLIKMEDIS_BASE_URL ?? 'http://127.0.0.1:8000');
  const url = `${baseUrl}/api/lis/v1/result/receive`;

  async function postWithToken(token) {
    return fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(resultPayload),
    });
  }

  let token = await getAuthToken(baseUrl);
  let response = await postWithToken(token);
  let body = await parseBody(response);

  if (response.status === 401) {
    token = await getAuthToken(baseUrl, true);
    response = await postWithToken(token);
    body = await parseBody(response);
  }

  if (!response.ok) {
    const message = body?.message ?? body?.error ?? `HTTP ${response.status}`;
    throw new Error(message);
  }

  return body;
}

export async function testKlikmedisAuth() {
  const baseUrl = trimBaseUrl(process.env.KLIKMEDIS_BASE_URL ?? 'http://127.0.0.1:8000');
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: process.env.KLIKMEDIS_EMAIL?.trim(),
      password: process.env.KLIKMEDIS_PASSWORD?.trim(),
    }),
  });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new Error(body?.message ?? `Login gagal (HTTP ${response.status})`);
  }
  cachedToken = body?.data?.token ?? '';
  return body;
}
