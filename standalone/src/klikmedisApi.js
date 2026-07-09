function trimTrailingSlash(url) {
  return String(url ?? '').replace(/\/$/, '');
}

async function parseResponseBody(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export class KlikmedisApiClient {
  constructor({ baseUrl, apiKey }) {
    this.baseUrl = trimTrailingSlash(baseUrl);
    this.apiKey = apiKey;
  }

  async request(method, endpoint, body = null) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const parsed = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(parsed?.message ?? parsed?.error ?? `HTTP ${response.status}`);
    }
    return parsed;
  }

  getPemeriksaan() {
    return this.request('GET', '/api/integrasi-lab/pemeriksaan');
  }

  getPoliklinik() {
    return this.request('GET', '/api/integrasi-lab/poliklinik');
  }

  getDokter() {
    return this.request('GET', '/api/integrasi-lab/dokter');
  }

  upsertPasien(payload) {
    return this.request('POST', '/api/integrasi-lab/pasien', payload);
  }

  submitKunjungan(payload) {
    return this.request('POST', '/api/integrasi-lab/kunjungan', payload);
  }

  submitHasil(payload) {
    return this.request('POST', '/api/integrasi-lab/hasil', payload);
  }
}
