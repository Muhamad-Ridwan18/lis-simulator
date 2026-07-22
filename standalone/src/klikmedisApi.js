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

function formatApiError(parsed, status) {
  if (parsed?.errors && typeof parsed.errors === 'object') {
    const details = Object.entries(parsed.errors)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
      .join('; ');
    return `${parsed.message ?? 'Validasi gagal'} (${details})`;
  }
  return parsed?.message ?? parsed?.error ?? `HTTP ${status}`;
}

export class KlikmedisApiClient {
  constructor({ baseUrl, email, password, token = '' }) {
    this.baseUrl = trimTrailingSlash(baseUrl);
    this.email = email;
    this.password = password;
    this.token = token;
    this.tokenExpiresAt = null;
  }

  setCredentials({ baseUrl, email, password }) {
    if (baseUrl) this.baseUrl = trimTrailingSlash(baseUrl);
    if (email !== undefined) this.email = email;
    if (password !== undefined) this.password = password;
  }

  setToken(token) {
    this.token = token ?? '';
  }

  async request(method, endpoint, body = null, { auth = true, retried = false } = {}) {
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    if (auth) {
      if (!this.token) {
        await this.login();
      }
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const parsed = await parseResponseBody(response);

    if (response.status === 401 && auth && !retried) {
      this.token = '';
      await this.login();
      return this.request(method, endpoint, body, { auth: true, retried: true });
    }

    if (!response.ok) {
      throw new Error(formatApiError(parsed, response.status));
    }

    return parsed;
  }

  async login() {
    if (!this.email || !this.password) {
      throw new Error('Email dan password wajib diisi untuk autentikasi JWT');
    }

    const parsed = await this.request(
      'POST',
      '/api/v1/auth/login',
      { email: this.email, password: this.password },
      { auth: false }
    );

    const token = parsed?.data?.token;
    if (!token) {
      throw new Error('Login gagal: token tidak ditemukan pada response');
    }

    this.token = token;
    this.tokenExpiresAt = Date.now() + Number(parsed?.data?.expires_in ?? 0) * 1000;
    return parsed;
  }

  async refreshToken() {
    return this.request('POST', '/api/v1/auth/refresh', null, { auth: true });
  }

  getPasien(query = {}) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value));
      }
    });
    const qs = params.toString();
    return this.request('GET', `/api/v1/master-data/pasien${qs ? `?${qs}` : ''}`);
  }

  syncPasien(payload) {
    return this.request('POST', '/api/lis/v1/patient', payload);
  }

  getDokter() {
    return this.request('GET', '/api/v1/master-data/dokter');
  }

  syncDokter(payload) {
    return this.request('POST', '/api/lis/v1/doctor', payload);
  }

  getTindakan(departmentId = null) {
    const qs = departmentId ? `?department_id=${encodeURIComponent(departmentId)}` : '';
    return this.request('GET', `/api/v1/master-data/tindakan${qs}`);
  }

  syncTindakan(items) {
    return this.request('POST', '/api/v1/master-data/tindakan/sync', { items });
  }

  getPoliklinik() {
    return this.request('GET', '/api/v1/master-data/poliklinik');
  }

  getProvinces() {
    return this.request('GET', '/api/v1/master-data/provinces');
  }

  getRegencies(provinceId) {
    return this.request('GET', `/api/v1/master-data/regencies?province_id=${encodeURIComponent(provinceId)}`);
  }

  getDistricts(regencyId) {
    return this.request('GET', `/api/v1/master-data/districts?regency_id=${encodeURIComponent(regencyId)}`);
  }

  getVillages(districtId) {
    return this.request('GET', `/api/v1/master-data/villages?district_id=${encodeURIComponent(districtId)}`);
  }

  submitVisit(payload) {
    return this.request('POST', '/api/lis/v1/visit', payload);
  }

  submitResult(payload) {
    return this.request('POST', '/api/lis/v1/result/receive', payload);
  }

  getSatuSehatEncounters({ tanggalAwal, tanggalAkhir } = {}) {
    const params = new URLSearchParams();
    if (tanggalAwal) params.set('tanggal_awal', tanggalAwal);
    if (tanggalAkhir) params.set('tanggal_akhir', tanggalAkhir);
    const qs = params.toString();
    return this.request('GET', `/api/lis/v1/laporan/satusehat/encounters${qs ? `?${qs}` : ''}`);
  }

  getSatuSehatEncounterDetail(encounterId) {
    return this.request('GET', `/api/lis/v1/laporan/satusehat/encounters/${encounterId}`);
  }
}
