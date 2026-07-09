import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { KlikmedisApiClient } from './klikmedisApi.js';
import { buildResultPayload } from './resultGenerator.js';
import { getRun, listRuns, saveRun } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const PORT = Number(process.env.PORT ?? 3010);
const BASE_URL = process.env.KLIKMEDIS_BASE_URL?.trim();
const API_KEY = process.env.KLIKMEDIS_API_KEY?.trim();
const AUTO_GENERATE_SPECIMEN = process.env.AUTO_GENERATE_SPECIMEN !== 'false';

if (!BASE_URL || !API_KEY) {
  console.error('KLIKMEDIS_BASE_URL dan KLIKMEDIS_API_KEY wajib diisi pada .env standalone');
  process.exit(1);
}

const client = new KlikmedisApiClient({ baseUrl: BASE_URL, apiKey: API_KEY });

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function nowSql() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function buildPatientPayload(overrides = {}) {
  const suffix = String(Date.now()).slice(-6);
  const fallback = {
    patient_name: `Pasien Simulasi ${suffix}`,
    gender: 'L',
    date_of_birth: '1990-05-15',
    identity_type: 'KTP',
    identity_number: `3201234567${suffix}`,
    phone_number: '081234567890',
    fill_address: false,
    insurance_number: `INS-${suffix}`,
  };
  return { ...fallback, ...overrides };
}

function pickOrderTests(tests, selectedIds = []) {
  if (!Array.isArray(tests) || tests.length === 0) {
    throw new Error('Referensi pemeriksaan kosong');
  }
  if (Array.isArray(selectedIds) && selectedIds.length > 0) {
    const selectedSet = new Set(selectedIds.map(String));
    const selected = tests.filter((item) => selectedSet.has(String(item.test_id)));
    if (!selected.length) {
      throw new Error('Pemeriksaan yang dipilih tidak ditemukan');
    }
    return selected;
  }
  return tests.slice(0, Math.min(tests.length, 2));
}

function buildKunjunganPayload({ patient, doctor, department, tests, includeSpecimen = true }) {
  const orderInfo = {
    order_date: nowSql(),
    priority: 'normal',
    notes: 'Order simulasi dari standalone dashboard',
    diagnoses: ['Z01.7'],
  };

  const orderedTests = tests.map((test, idx) => {
    const row = {
      test_id: String(test.test_id),
      test_name: test.test_name,
      loinc_code: test.loinc_code ?? '',
    };
    if (includeSpecimen) {
      row.specimen_number = `SPC-${idx + 1}`;
    }
    return row;
  });

  const specimens = includeSpecimen
    ? orderedTests.map((test, idx) => ({
        specimen_number: test.specimen_number,
        specimen_type: idx === 0 ? 'Darah EDTA' : 'Urin',
        status: 'Menunggu',
        collection_time: nowSql(),
        condition: 'Baik',
        notes: 'Dibuat otomatis oleh simulator',
      }))
    : undefined;

  return {
    patient_type: 'rawat_jalan',
    order_info: orderInfo,
    patient: {
      name: patient.patient_name,
      identity_number: patient.identity_number,
      date_of_birth: patient.date_of_birth,
      gender: patient.gender,
    },
    ordering_physician: {
      doctor_name: doctor?.doctor_name ?? 'dr. Simulasi',
      department: department?.department ?? 'Laboratorium',
    },
    insurance: {
      insurance_name: 'BPJS',
      insurance_number: patient.insurance_number,
    },
    order: orderedTests,
    specimens,
  };
}

async function getReferences() {
  const [pemeriksaan, poliklinik, dokter] = await Promise.all([
    client.getPemeriksaan(),
    client.getPoliklinik(),
    client.getDokter(),
  ]);
  return {
    pemeriksaan: pemeriksaan?.data ?? [],
    poliklinik: poliklinik?.data ?? [],
    dokter: dokter?.data ?? [],
  };
}

async function runSimulation({
  patientInput = null,
  selectedTestIds = [],
  doctorId = null,
  departmentId = null,
  includeSpecimen = AUTO_GENERATE_SPECIMEN,
}) {
  const run = {
    id: crypto.randomUUID(),
    started_at: new Date().toISOString(),
    status: 'running',
    steps: [],
    error: null,
    payloads: {},
    responses: {},
  };

  try {
    const references = await getReferences();
    run.steps.push('referensi_loaded');
    run.responses.references = {
      pemeriksaan_count: references.pemeriksaan.length,
      poliklinik_count: references.poliklinik.length,
      dokter_count: references.dokter.length,
    };

    const patientPayload = buildPatientPayload(patientInput ?? undefined);
    run.payloads.patient = patientPayload;
    const patientResponse = await client.upsertPasien(patientPayload);
    run.steps.push('patient_upserted');
    run.responses.patient = patientResponse;

    const chosenTests = pickOrderTests(references.pemeriksaan, selectedTestIds);
    const doctor =
      references.dokter.find((item) => String(item.doctor_id) === String(doctorId ?? '')) ??
      references.dokter[0];
    const department =
      references.poliklinik.find((item) => String(item.department_id) === String(departmentId ?? '')) ??
      references.poliklinik[0];
    const kunjunganPayload = buildKunjunganPayload({
      patient: patientPayload,
      doctor,
      department,
      tests: chosenTests,
      includeSpecimen,
    });
    run.payloads.kunjungan = kunjunganPayload;
    const kunjunganResponse = await client.submitKunjungan(kunjunganPayload);
    run.steps.push('kunjungan_submitted');
    run.responses.kunjungan = kunjunganResponse;

    const orderNumber = kunjunganResponse?.data?.order_number;
    if (!orderNumber) {
      throw new Error('order_number tidak ditemukan pada response kunjungan');
    }

    const responseTests = Array.isArray(kunjunganResponse?.data?.tests) ? kunjunganResponse.data.tests : [];
    const resolvedTests = chosenTests.map((test) => {
      const matched = responseTests.find((item) => String(item?.test_name ?? '').trim() === String(test.test_name).trim());
      const resolvedTestId = matched?.test_id ?? matched?.id ?? null;
      return {
        ...test,
        test_id: isUuid(resolvedTestId) ? resolvedTestId : test.test_id,
      };
    });

    const unresolved = resolvedTests.filter((test) => !isUuid(test.test_id));
    if (unresolved.length > 0) {
      throw new Error(
        `Klikmedis tidak mengembalikan test_id UUID hasil order untuk: ${unresolved.map((item) => item.test_name).join(', ')}. ` +
        'Response kunjungan hanya berisi test_code, sehingga submit hasil tidak bisa dipetakan.'
      );
    }

    const resultPayload = buildResultPayload({
      orderNumber,
      orderedTests: resolvedTests,
      specimens: kunjunganPayload.specimens ?? [],
      validatorName: 'dr. Validator Simulator',
    });
    run.payloads.hasil = resultPayload;
    const hasilResponse = await client.submitHasil(resultPayload);
    run.steps.push('hasil_submitted');
    run.responses.hasil = hasilResponse;

    run.status = 'success';
    run.finished_at = new Date().toISOString();
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

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'lis-simulator-standalone',
    base_url: BASE_URL,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/config', (_req, res) => {
  res.json({
    success: true,
    data: {
      base_url: BASE_URL,
      api_key_preview: `${API_KEY.slice(0, 4)}***${API_KEY.slice(-2)}`,
      auto_generate_specimen: AUTO_GENERATE_SPECIMEN,
    },
  });
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

app.get('/api/references', async (_req, res) => {
  try {
    const references = await getReferences();
    return res.json({ success: true, data: references });
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
    message: 'Simulasi full selesai',
    data: {
      run_id: result.run.id,
      order_number: result.run.responses?.kunjungan?.data?.order_number ?? null,
      steps: result.run.steps,
    },
  });
});

app.post('/api/simulate/custom', async (req, res) => {
  const body = req.body ?? {};
  const selectedTestIds = Array.isArray(body.selected_test_ids) ? body.selected_test_ids : [];
  if (!selectedTestIds.length) {
    return res.status(422).json({
      success: false,
      message: 'Pilih minimal 1 pemeriksaan',
    });
  }

  const result = await runSimulation({
    patientInput: body.patient ?? null,
    selectedTestIds,
    doctorId: body.doctor_id ?? null,
    departmentId: body.department_id ?? null,
    includeSpecimen: Boolean(body.include_specimen),
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
    message: 'Simulasi custom selesai',
    data: {
      run_id: result.run.id,
      order_number: result.run.responses?.kunjungan?.data?.order_number ?? null,
      steps: result.run.steps,
    },
  });
});

app.listen(PORT, () => {
  console.log(`Standalone simulator running at http://127.0.0.1:${PORT}`);
});
