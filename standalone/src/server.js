import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KlikmedisApiClient } from './klikmedisApi.js';
import { buildResultPayload, inferResultForTest } from './resultGenerator.js';
import { getRun, listRuns, saveRun, updateRun } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const ENV_PATH = path.join(__dirname, '..', '.env');

const runtimeConfig = {
  port: Number(process.env.PORT ?? 3010),
  baseUrl: process.env.KLIKMEDIS_BASE_URL?.trim() ?? '',
  email: process.env.KLIKMEDIS_EMAIL?.trim() ?? '',
  password: process.env.KLIKMEDIS_PASSWORD?.trim() ?? '',
  autoGenerateSpecimen: process.env.AUTO_GENERATE_SPECIMEN !== 'false',
};

if (!runtimeConfig.baseUrl) {
  console.error('KLIKMEDIS_BASE_URL wajib diisi pada .env standalone');
  process.exit(1);
}

let client = new KlikmedisApiClient({
  baseUrl: runtimeConfig.baseUrl,
  email: runtimeConfig.email,
  password: runtimeConfig.password,
});

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function nowSql() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function saveEnvConfig(nextConfig) {
  const nextMap = {
    PORT: String(nextConfig.port),
    KLIKMEDIS_BASE_URL: nextConfig.baseUrl,
    KLIKMEDIS_EMAIL: nextConfig.email,
    KLIKMEDIS_PASSWORD: nextConfig.password,
    AUTO_GENERATE_SPECIMEN: nextConfig.autoGenerateSpecimen ? 'true' : 'false',
  };

  const existingLines = fs.existsSync(ENV_PATH)
    ? fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)
    : [];
  const foundKeys = new Set();
  const updatedLines = existingLines
    .filter((line) => !/^KLIKMEDIS_API_KEY=/.test(line))
    .map((line) => {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) return line;
      const key = match[1];
      if (!(key in nextMap)) return line;
      foundKeys.add(key);
      return `${key}=${nextMap[key]}`;
    });

  Object.keys(nextMap).forEach((key) => {
    if (!foundKeys.has(key)) {
      updatedLines.push(`${key}=${nextMap[key]}`);
    }
  });

  fs.writeFileSync(ENV_PATH, `${updatedLines.join('\n').trim()}\n`, 'utf8');
}

function applyRuntimeConfig(nextConfig) {
  runtimeConfig.baseUrl = nextConfig.baseUrl;
  runtimeConfig.email = nextConfig.email;
  runtimeConfig.password = nextConfig.password;
  runtimeConfig.autoGenerateSpecimen = nextConfig.autoGenerateSpecimen;
  client = new KlikmedisApiClient({
    baseUrl: runtimeConfig.baseUrl,
    email: runtimeConfig.email,
    password: runtimeConfig.password,
  });
}

function buildPatientPayload(overrides = {}) {
  const suffix = String(Date.now()).slice(-6);
  const fallback = {
    patient_id: null,
    patient_name: `Pasien Simulasi ${suffix}`,
    gender: 'L',
    date_of_birth: '1990-05-15',
    identity_number: `3201234567${suffix}`,
    phone_number: '081234567890',
    email: `pasien.${suffix}@example.com`,
    address: 'Jl. Simulasi No. 1',
  };
  return { ...fallback, ...overrides };
}

function pickItems(items, selectedIds = []) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Referensi tindakan kosong');
  }
  if (Array.isArray(selectedIds) && selectedIds.length > 0) {
    const selectedSet = new Set(selectedIds.map(String));
    const selected = items.filter((item) => selectedSet.has(String(item.id)));
    if (!selected.length) {
      throw new Error('Tindakan yang dipilih tidak ditemukan');
    }
    return selected;
  }
  return items.slice(0, Math.min(items.length, 2));
}

function normalizeInsurance(insurance = null) {
  const name = String(insurance?.insurance_name ?? 'Umum').trim() || 'Umum';
  const number = String(insurance?.insurance_number ?? '').trim();

  if (name.toUpperCase() === 'BPJS') {
    return {
      insurance_name: 'BPJS',
      insurance_number: number || '000123456789012',
    };
  }

  return {
    insurance_name: 'Umum',
    insurance_number: number || '',
  };
}

function buildVisitPayload({
  patientId,
  doctorId,
  departmentId,
  items,
  includeSpecimen = true,
  notes,
  insurance = null,
}) {
  const order = items.map((item, idx) => {
    const row = {
      item_id: String(item.id),
      item_name: item.item_name,
    };
    if (includeSpecimen) {
      row.specimen_number = `SPC-${idx + 1}`;
    }
    return row;
  });

  const specimens = includeSpecimen
    ? order.map((row, idx) => ({
        specimen_number: row.specimen_number,
        specimen_type: idx === 0 ? 'Darah EDTA' : 'Urin',
        status: 'Menunggu',
        collection_time: nowSql(),
      }))
    : undefined;

  return {
    patient_id: patientId,
    department_id: departmentId,
    doctor_id: doctorId,
    order_date: nowSql(),
    notes: notes || 'Order simulasi dari standalone dashboard (API v1 JWT)',
    insurance: normalizeInsurance(insurance),
    order,
    specimens,
  };
}

async function getReferences(departmentId = null) {
  const [tindakan, poliklinik, dokter] = await Promise.all([
    client.getTindakan(departmentId),
    client.getPoliklinik(),
    client.getDokter(),
  ]);
  return {
    tindakan: tindakan?.data ?? [],
    poliklinik: poliklinik?.data ?? [],
    dokter: dokter?.data ?? [],
  };
}

async function ensureAuth() {
  if (!runtimeConfig.email || !runtimeConfig.password) {
    throw new Error('Isi KLIKMEDIS_EMAIL dan KLIKMEDIS_PASSWORD di pengaturan dashboard / .env');
  }
  return client.login();
}

async function createVisitOnly({
  patientInput = null,
  selectedItemIds = [],
  doctorId = null,
  departmentId = null,
  includeSpecimen = runtimeConfig.autoGenerateSpecimen,
  notes = null,
  insurance = null,
}) {
  const run = {
    id: crypto.randomUUID(),
    started_at: new Date().toISOString(),
    status: 'awaiting_result',
    steps: [],
    error: null,
    payloads: {},
    responses: {},
    pending_result: null,
  };

  try {
    const loginResponse = await ensureAuth();
    run.steps.push('auth_login');
    run.responses.auth = {
      clinic_name: loginResponse?.data?.clinic_name ?? null,
      token_type: loginResponse?.data?.token_type ?? 'Bearer',
      expires_in: loginResponse?.data?.expires_in ?? null,
    };

    const references = await getReferences(departmentId);
    run.steps.push('referensi_loaded');
    run.responses.references = {
      tindakan_count: references.tindakan.length,
      poliklinik_count: references.poliklinik.length,
      dokter_count: references.dokter.length,
    };

    const patientPayload = buildPatientPayload(patientInput ?? undefined);
    run.payloads.patient = patientPayload;
    const patientResponse = await client.syncPasien(patientPayload);
    run.steps.push('patient_synced');
    run.responses.patient = patientResponse;

    const patientId = patientResponse?.data?.patient_id;
    if (!patientId) {
      throw new Error('patient_id tidak ditemukan pada response sync pasien');
    }

    const chosenItems = pickItems(references.tindakan, selectedItemIds);
    const doctor =
      references.dokter.find((item) => String(item.id) === String(doctorId ?? '')) ??
      references.dokter[0];
    const department =
      references.poliklinik.find((item) => String(item.id) === String(departmentId ?? '')) ??
      references.poliklinik[0];

    if (!doctor?.id) {
      throw new Error('Dokter tidak tersedia. Pastikan master dokter sudah ada di klinik.');
    }
    if (!department?.id) {
      throw new Error('Poliklinik tidak tersedia. Pastikan master poliklinik sudah ada di klinik.');
    }

    const visitPayload = buildVisitPayload({
      patientId,
      doctorId: doctor.id,
      departmentId: department.id,
      items: chosenItems,
      includeSpecimen,
      notes,
      insurance,
    });
    run.payloads.visit = visitPayload;
    const visitResponse = await client.submitVisit(visitPayload);
    run.steps.push('visit_submitted');
    run.responses.visit = visitResponse;

    const orderId = visitResponse?.data?.order_id;
    if (!orderId) {
      throw new Error('order_id tidak ditemukan pada response visit');
    }

    const orderedItems = chosenItems.map((item) => {
      const indicators = Array.isArray(item.indicators) ? item.indicators : [];
      if (indicators.length > 0) {
        return {
          item_id: String(item.id),
          item_name: item.item_name,
          item_code: item.item_code ?? '',
          indicators: indicators.map((indicator) => {
            const indicatorName = indicator.indicator_name || item.item_name;
            const suggested = inferResultForTest(indicatorName);
            if (indicator.unit) {
              suggested.unit = indicator.unit;
            }
            return {
              test_id: String(indicator.indicator_id || indicator.id),
              indicator_name: indicatorName,
              loinc_code: indicator.loinc_code || '',
              unit: indicator.unit || suggested.unit,
              suggested,
            };
          }),
        };
      }

      return {
        item_id: String(item.id),
        item_name: item.item_name,
        item_code: item.item_code ?? '',
        indicators: [{
          test_id: String(item.id),
          indicator_name: item.item_name,
          loinc_code: '',
          unit: '',
          suggested: inferResultForTest(item.item_name),
        }],
      };
    });

    run.pending_result = {
      order_id: orderId,
      visit_id: visitResponse?.data?.visit_id ?? null,
      visit_number: visitResponse?.data?.visit_number ?? null,
      items: orderedItems,
    };

    saveRun(run);
    return { ok: true, run };
  } catch (error) {
    run.status = 'failed';
    run.error = error.message;
    run.finished_at = new Date().toISOString();
    saveRun(run);
    return { ok: false, run };
  }
}

async function submitManualResult({ runId, results, status = 'completed' }) {
  const run = getRun(runId);
  if (!run) {
    throw new Error('Run tidak ditemukan');
  }
  if (run.status !== 'awaiting_result') {
    throw new Error(`Run tidak menunggu hasil (status: ${run.status})`);
  }
  if (!run.pending_result?.order_id) {
    throw new Error('order_id pending tidak ditemukan');
  }

  await ensureAuth();
  const resultPayload = buildResultPayload({
    orderId: run.pending_result.order_id,
    orderedItems: run.pending_result.items,
    manualResults: results,
    status,
  });

  run.payloads.result = resultPayload;
  const resultResponse = await client.submitResult(resultPayload);
  run.steps.push('result_submitted');
  run.responses.result = resultResponse;
  run.status = 'success';
  run.finished_at = new Date().toISOString();
  run.error = null;
  updateRun(runId, run);
  return run;
}

async function runSimulation({
  patientInput = null,
  selectedItemIds = [],
  doctorId = null,
  departmentId = null,
  includeSpecimen = runtimeConfig.autoGenerateSpecimen,
  notes = null,
  insurance = null,
}) {
  const visitResult = await createVisitOnly({
    patientInput,
    selectedItemIds,
    doctorId,
    departmentId,
    includeSpecimen,
    notes,
    insurance,
  });

  if (!visitResult.ok) {
    return visitResult;
  }

  const run = visitResult.run;
  try {
    const resultPayload = buildResultPayload({
      orderId: run.pending_result.order_id,
      orderedItems: run.pending_result.items,
    });
    run.payloads.result = resultPayload;
    const resultResponse = await client.submitResult(resultPayload);
    run.steps.push('result_submitted');
    run.responses.result = resultResponse;
    run.status = 'success';
    run.finished_at = new Date().toISOString();
    updateRun(run.id, run);
    return { ok: true, run };
  } catch (error) {
    run.status = 'failed';
    run.error = error.message;
    run.finished_at = new Date().toISOString();
    updateRun(run.id, run);
    return { ok: false, run };
  }
}

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'lis-simulator-standalone',
    api_contract: 'v1-jwt',
    base_url: runtimeConfig.baseUrl,
    auth_ready: Boolean(runtimeConfig.email && runtimeConfig.password),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/config', (_req, res) => {
  res.json({
    success: true,
    data: {
      base_url: runtimeConfig.baseUrl,
      email: runtimeConfig.email,
      auto_generate_specimen: runtimeConfig.autoGenerateSpecimen,
      api_contract: 'v1-jwt',
    },
  });
});

app.get('/api/settings', (_req, res) => {
  res.json({
    success: true,
    data: {
      port: runtimeConfig.port,
      base_url: runtimeConfig.baseUrl,
      email: runtimeConfig.email,
      password: runtimeConfig.password,
      auto_generate_specimen: runtimeConfig.autoGenerateSpecimen,
    },
  });
});

app.put('/api/settings', (req, res) => {
  const body = req.body ?? {};
  const nextConfig = {
    port: Number(body.port ?? runtimeConfig.port),
    baseUrl: String(body.base_url ?? '').trim(),
    email: String(body.email ?? '').trim(),
    password: String(body.password ?? '').trim(),
    autoGenerateSpecimen: Boolean(body.auto_generate_specimen),
  };

  if (!nextConfig.baseUrl) {
    return res.status(422).json({
      success: false,
      message: 'base_url wajib diisi',
    });
  }
  if (!Number.isFinite(nextConfig.port) || nextConfig.port < 1 || nextConfig.port > 65535) {
    return res.status(422).json({
      success: false,
      message: 'port tidak valid',
    });
  }

  const previousPort = runtimeConfig.port;
  saveEnvConfig(nextConfig);
  applyRuntimeConfig(nextConfig);
  runtimeConfig.port = nextConfig.port;
  const restartRequired = nextConfig.port !== previousPort;

  return res.json({
    success: true,
    message: restartRequired
      ? 'Konfigurasi disimpan. Restart server diperlukan untuk menerapkan PORT baru.'
      : 'Konfigurasi berhasil disimpan.',
    data: { restart_required: restartRequired },
  });
});

app.post('/api/auth/login', async (_req, res) => {
  try {
    const response = await ensureAuth();
    return res.json({
      success: true,
      message: 'Login berhasil',
      data: {
        clinic_name: response?.data?.clinic_name ?? null,
        expires_in: response?.data?.expires_in ?? null,
        token_preview: client.token
          ? `${client.token.slice(0, 12)}...${client.token.slice(-6)}`
          : null,
      },
    });
  } catch (error) {
    return res.status(401).json({ success: false, message: error.message });
  }
});

app.get('/api/runs', (_req, res) => {
  res.json({ success: true, data: listRuns() });
});

app.get('/api/runs/:runId', (req, res) => {
  const run = getRun(req.params.runId);
  if (!run) {
    return res.status(404).json({ success: false, message: 'Run tidak ditemukan' });
  }
  return res.json({ success: true, data: run });
});

app.get('/api/references', async (req, res) => {
  try {
    await ensureAuth();
    const departmentId = req.query.department_id || null;
    const references = await getReferences(departmentId);
    return res.json({ success: true, data: references });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/patients', async (req, res) => {
  try {
    await ensureAuth();
    const query = {};
    if (req.query.identity_number) query.identity_number = String(req.query.identity_number).trim();
    if (req.query.patient_name) query.patient_name = String(req.query.patient_name).trim();
    if (req.query.gender) query.gender = String(req.query.gender).trim();
    if (req.query.date_of_birth) query.date_of_birth = String(req.query.date_of_birth).trim();

    if (!query.identity_number && !(query.patient_name && query.gender && query.date_of_birth)) {
      return res.status(422).json({
        success: false,
        message: 'Cari pakai NIK, atau kombinasi nama + gender + tanggal lahir',
      });
    }

    const response = await client.getPasien(query);
    return res.json({
      success: true,
      data: Array.isArray(response?.data) ? response.data : [],
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/simulate/full', async (_req, res) => {
  const result = await runSimulation({});
  if (!result.ok) {
    return res.status(500).json({
      success: false,
      message: result.run.error,
      data: { run_id: result.run.id, steps: result.run.steps },
    });
  }
  return res.json({
    success: true,
    message: 'Simulasi full selesai (API v1 JWT)',
    data: {
      run_id: result.run.id,
      order_id: result.run.responses?.visit?.data?.order_id ?? null,
      visit_id: result.run.responses?.visit?.data?.visit_id ?? null,
      visit_number: result.run.responses?.visit?.data?.visit_number ?? null,
      steps: result.run.steps,
    },
  });
});

app.post('/api/simulate/visit', async (req, res) => {
  const body = req.body ?? {};
  const selectedItemIds = Array.isArray(body.selected_item_ids) ? body.selected_item_ids : [];
  if (!selectedItemIds.length) {
    return res.status(422).json({
      success: false,
      message: 'Pilih minimal 1 tindakan',
    });
  }

  const result = await createVisitOnly({
    patientInput: body.patient ?? null,
    selectedItemIds,
    doctorId: body.doctor_id ?? null,
    departmentId: body.department_id ?? null,
    includeSpecimen: Boolean(body.include_specimen),
    notes: body.notes ?? null,
    insurance: body.insurance ?? null,
  });

  if (!result.ok) {
    return res.status(500).json({
      success: false,
      message: result.run.error,
      data: { run_id: result.run.id, steps: result.run.steps },
    });
  }

  return res.json({
    success: true,
    message: 'Kunjungan berhasil dibuat. Silakan isi nilai hasil pemeriksaan.',
    data: {
      run_id: result.run.id,
      order_id: result.run.pending_result.order_id,
      visit_id: result.run.pending_result.visit_id,
      visit_number: result.run.pending_result.visit_number,
      items: result.run.pending_result.items,
      steps: result.run.steps,
    },
  });
});

app.post('/api/simulate/result', async (req, res) => {
  try {
    const body = req.body ?? {};
    const runId = body.run_id;
    const results = Array.isArray(body.results) ? body.results : [];
    if (!runId) {
      return res.status(422).json({ success: false, message: 'run_id wajib diisi' });
    }
    if (!results.length) {
      return res.status(422).json({ success: false, message: 'results wajib diisi' });
    }

    const run = await submitManualResult({
      runId,
      results,
      status: body.status || 'completed',
    });

    return res.json({
      success: true,
      message: 'Hasil pemeriksaan berhasil dikirim',
      data: {
        run_id: run.id,
        order_id: run.pending_result?.order_id ?? null,
        steps: run.steps,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.listen(runtimeConfig.port, () => {
  console.log(`Standalone simulator (API v1 JWT) running at http://127.0.0.1:${runtimeConfig.port}`);
});
