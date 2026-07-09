const $ = (selector) => document.querySelector(selector);
let references = { pemeriksaan: [], poliklinik: [], dokter: [] };

function fmtDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('id-ID');
}

function statusBadge(status) {
  const map = {
    success: 'badge-success',
    failed: 'badge-danger',
    running: 'badge-warning',
  };
  return `<span class="badge ${map[status] ?? 'badge-muted'}">${status}</span>`;
}

function showToast(message, isError = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3500);
}

async function loadHealth() {
  try {
    const [healthRes, configRes] = await Promise.all([
      fetch('/health'),
      fetch('/api/config'),
    ]);
    const health = await healthRes.json();
    const config = await configRes.json();

    $('#healthBadge').textContent = 'online';
    $('#healthBadge').className = 'badge badge-success';
    $('#baseUrl').textContent = health.base_url;
    $('#apiKeyPreview').textContent = config.data?.api_key_preview ?? '-';
    $('#autoSpecimen').textContent = config.data?.auto_generate_specimen ? 'ON' : 'OFF';
  } catch {
    $('#healthBadge').textContent = 'offline';
    $('#healthBadge').className = 'badge badge-danger';
  }
}

async function loadRuns() {
  const response = await fetch('/api/runs');
  const json = await response.json();
  const runs = json.data ?? [];
  $('#totalRuns').textContent = runs.length;

  const body = $('#runsBody');
  if (!runs.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty">Belum ada run simulasi</td></tr>';
    return;
  }

  body.innerHTML = runs.map((run) => `
    <tr>
      <td>${fmtDate(run.started_at)}</td>
      <td><code>${run.id}</code></td>
      <td>${statusBadge(run.status)}</td>
      <td>${run.steps.length}</td>
      <td><button class="btn btn-secondary btn-sm" onclick="openDetail('${run.id}')">Detail</button></td>
    </tr>
  `).join('');
}

async function loadSettings() {
  try {
    const response = await fetch('/api/settings');
    const json = await response.json();
    if (!json.success) throw new Error(json.message);
    $('#cfgPort').value = json.data.port ?? 3010;
    $('#cfgBaseUrl').value = json.data.base_url ?? '';
    $('#cfgApiKey').value = json.data.api_key ?? '';
    $('#cfgAutoSpecimen').checked = Boolean(json.data.auto_generate_specimen);
  } catch (error) {
    showToast(`Gagal load setting: ${error.message}`, true);
  }
}

async function saveSettings() {
  const btn = $('#btnSaveConfig');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';
  try {
    const payload = {
      port: Number($('#cfgPort').value || 3010),
      base_url: $('#cfgBaseUrl').value.trim(),
      api_key: $('#cfgApiKey').value.trim(),
      auto_generate_specimen: $('#cfgAutoSpecimen').checked,
    };
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await response.json();
    if (!json.success) throw new Error(json.message);
    showToast(json.message);
    await loadHealth();
    await loadReferences();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan Pengaturan';
  }
}

function renderReferenceOptions() {
  const doctorSelect = $('#doctorSelect');
  const departmentSelect = $('#departmentSelect');
  const testsBox = $('#testsBox');

  doctorSelect.innerHTML = references.dokter
    .map((doctor) => `<option value="${doctor.doctor_id}">${doctor.doctor_name}</option>`)
    .join('');
  departmentSelect.innerHTML = references.poliklinik
    .map((department) => `<option value="${department.department_id}">${department.department}</option>`)
    .join('');
  testsBox.innerHTML = references.pemeriksaan
    .map((test, idx) => `
      <label class="check-item">
        <span>
          <input type="checkbox" class="test-checkbox" value="${test.test_id}" ${idx < 2 ? 'checked' : ''}>
          ${test.test_name}
        </span>
        <small>${test.loinc_code || '-'} | Rp${Number(test.price || 0).toLocaleString('id-ID')}</small>
      </label>
    `)
    .join('');
}

async function loadReferences() {
  try {
    const response = await fetch('/api/references');
    const json = await response.json();
    if (!json.success) throw new Error(json.message);
    references = json.data;
    renderReferenceOptions();
  } catch (error) {
    showToast(`Gagal load referensi: ${error.message}`, true);
  }
}

function collectFormPayload() {
  const selectedTestIds = Array.from(document.querySelectorAll('.test-checkbox:checked'))
    .map((el) => el.value);

  const patientName = $('#patientName').value.trim();
  const identityNumber = $('#patientIdentityNumber').value.trim();
  if (!patientName || !identityNumber) {
    throw new Error('Nama pasien dan No KTP wajib diisi');
  }

  return {
    patient: {
      patient_name: patientName,
      gender: $('#patientGender').value,
      date_of_birth: $('#patientDob').value || '1990-05-15',
      identity_type: 'KTP',
      identity_number: identityNumber,
      phone_number: $('#patientPhone').value.trim() || '081234567890',
      fill_address: false,
      insurance_number: $('#patientInsuranceNumber').value.trim() || '0001234567890',
    },
    doctor_id: $('#doctorSelect').value,
    department_id: $('#departmentSelect').value,
    include_specimen: $('#includeSpecimen').checked,
    selected_test_ids: selectedTestIds,
  };
}

async function openDetail(runId) {
  const response = await fetch(`/api/runs/${runId}`);
  const json = await response.json();
  if (!json.success) {
    showToast(json.message, true);
    return;
  }
  const run = json.data;
  $('#dRunId').textContent = run.id;
  $('#dStatus').innerHTML = statusBadge(run.status);
  $('#dStarted').textContent = fmtDate(run.started_at);
  $('#dFinished').textContent = fmtDate(run.finished_at);
  $('#dSteps').textContent = JSON.stringify(run.steps, null, 2);
  $('#dPayloads').textContent = JSON.stringify(run.payloads, null, 2);
  $('#dResponses').textContent = JSON.stringify(run.responses, null, 2);
  const err = $('#dError');
  if (run.error) {
    err.textContent = run.error;
    err.classList.remove('hidden');
  } else {
    err.classList.add('hidden');
  }
  $('#modal').classList.remove('hidden');
}

async function runSimulation() {
  const btn = $('#btnRun');
  btn.disabled = true;
  btn.textContent = 'Running...';
  try {
    const response = await fetch('/api/simulate/full', { method: 'POST' });
    const json = await response.json();
    if (!json.success) throw new Error(json.message);
    showToast(`Run sukses: ${json.data.run_id}`);
    await loadRuns();
  } catch (error) {
    showToast(error.message, true);
    await loadRuns();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run Full Simulation';
  }
}

async function runCustomSimulation() {
  const btn = $('#btnRunCustom');
  btn.disabled = true;
  btn.textContent = 'Running...';
  try {
    const payload = collectFormPayload();
    const response = await fetch('/api/simulate/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await response.json();
    if (!json.success) throw new Error(json.message);
    showToast(`Run manual sukses: ${json.data.run_id}`);
    await loadRuns();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Jalankan Simulasi Manual';
  }
}

$('#btnRefresh').addEventListener('click', () => {
  loadHealth();
  loadRuns();
  loadReferences();
});
$('#btnRun').addEventListener('click', runSimulation);
$('#btnRunCustom').addEventListener('click', runCustomSimulation);
$('#btnSaveConfig').addEventListener('click', saveSettings);
document.querySelectorAll('[data-close]').forEach((el) => {
  el.addEventListener('click', () => $('#modal').classList.add('hidden'));
});

window.openDetail = openDetail;

loadHealth();
loadSettings();
loadRuns();
loadReferences();
