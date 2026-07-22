const $ = (selector) => document.querySelector(selector);
let references = { tindakan: [], poliklinik: [], dokter: [] };
let pendingVisit = null;
let searchedPatients = [];
let selectedPatientId = null;

function fmtDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('id-ID');
}

function statusBadge(status) {
  const map = {
    success: 'badge-success',
    failed: 'badge-danger',
    running: 'badge-warning',
    awaiting_result: 'badge-warning',
  };
  return `<span class="badge ${map[status] ?? 'badge-muted'}">${status}</span>`;
}

function showToast(message, isError = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 4000);
}

async function loadHealth() {
  try {
    const [healthRes, configRes] = await Promise.all([
      fetch('/health'),
      fetch('/api/config'),
    ]);
    const health = await healthRes.json();
    const config = await configRes.json();

    $('#healthBadge').textContent = health.auth_ready ? 'online' : 'need auth';
    $('#healthBadge').className = health.auth_ready ? 'badge badge-success' : 'badge badge-warning';
    $('#baseUrl').textContent = health.base_url;
    $('#emailPreview').textContent = config.data?.email || '-';
    $('#apiContract').textContent = config.data?.api_contract ?? 'v1-jwt';
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
      <td class="actions">
        <button class="btn btn-secondary btn-sm" onclick="openDetail('${run.id}')">Detail</button>
        ${run.status === 'awaiting_result'
          ? `<button class="btn btn-primary btn-sm" onclick="resumeResultEntry('${run.id}')">Isi Hasil</button>`
          : ''}
      </td>
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
    $('#cfgEmail').value = json.data.email ?? '';
    $('#cfgPassword').value = json.data.password ?? '';
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
      email: $('#cfgEmail').value.trim(),
      password: $('#cfgPassword').value.trim(),
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
  const previousDepartmentId = departmentSelect.value;

  doctorSelect.innerHTML = references.dokter
    .map((doctor) => `<option value="${doctor.id}">${doctor.doctor_name}${doctor.doctor_code ? ` (${doctor.doctor_code})` : ''}</option>`)
    .join('') || '<option value="">Tidak ada dokter</option>';

  departmentSelect.innerHTML = references.poliklinik
    .map((department) => `<option value="${department.id}">${department.department_name}${department.department_code ? ` (${department.department_code})` : ''}</option>`)
    .join('') || '<option value="">Tidak ada poliklinik</option>';

  const preferredDepartment =
    references.poliklinik.find((item) => /lab/i.test(String(item.department_name ?? ''))) ??
    references.poliklinik[0];
  if (previousDepartmentId && references.poliklinik.some((item) => String(item.id) === previousDepartmentId)) {
    departmentSelect.value = previousDepartmentId;
  } else if (preferredDepartment?.id) {
    departmentSelect.value = preferredDepartment.id;
  }

  testsBox.innerHTML = references.tindakan.length
    ? references.tindakan.map((item, idx) => {
      const indicators = Array.isArray(item.indicators) ? item.indicators : [];
      const indicatorText = indicators.length
        ? indicators.map((ind) => `${ind.indicator_name}${ind.unit ? ` (${ind.unit})` : ''}`).join(', ')
        : 'tanpa indikator';
      return `
      <label class="check-item">
        <span>
          <input type="checkbox" class="test-checkbox" value="${item.id}" ${idx < 2 ? 'checked' : ''}>
          ${item.item_name}
        </span>
        <small>${item.item_code || '-'} | Rp${Number(item.price || 0).toLocaleString('id-ID')}</small>
        <small class="indicator-list">${indicators.length} indikator: ${indicatorText}</small>
      </label>`;
    }).join('')
    : '<div class="empty">Belum ada tindakan. Login dulu lalu klik Refresh.</div>';
}

async function loadReferences() {
  try {
    const response = await fetch('/api/references');
    const json = await response.json();
    if (!json.success) throw new Error(json.message);
    references = {
      tindakan: Array.isArray(json.data?.tindakan) ? json.data.tindakan : [],
      poliklinik: Array.isArray(json.data?.poliklinik) ? json.data.poliklinik : [],
      dokter: Array.isArray(json.data?.dokter) ? json.data.dokter : [],
    };
    renderReferenceOptions();
    if (!references.tindakan.length) {
      showToast('Referensi tindakan kosong dari API master-data/tindakan', true);
    }
  } catch (error) {
    showToast(`Gagal load referensi: ${error.message}`, true);
  }
}

function collectFormPayload() {
  const selectedItemIds = Array.from(document.querySelectorAll('.test-checkbox:checked'))
    .map((el) => el.value);

  const patientName = $('#patientName').value.trim();
  const identityNumber = $('#patientIdentityNumber').value.trim();
  if (!patientName || !identityNumber) {
    throw new Error('Nama pasien dan No KTP wajib diisi');
  }
  if (!selectedItemIds.length) {
    throw new Error('Pilih minimal 1 tindakan');
  }

  const insuranceName = $('#insuranceType').value;
  const insuranceNumber = $('#insuranceNumber').value.trim();

  if (insuranceName === 'BPJS' && !insuranceNumber) {
    throw new Error('No kartu BPJS wajib diisi jika jenis asuransi BPJS');
  }

  return {
    patient: {
      patient_id: selectedPatientId || $('#patientId').value.trim() || null,
      patient_name: patientName,
      gender: $('#patientGender').value,
      date_of_birth: $('#patientDob').value || '1990-05-15',
      identity_number: identityNumber,
      phone_number: $('#patientPhone').value.trim() || '081234567890',
      email: $('#patientEmail').value.trim() || undefined,
      address: 'Jl. Simulasi No. 1',
    },
    doctor_id: $('#doctorSelect').value,
    department_id: $('#departmentSelect').value,
    include_specimen: $('#includeSpecimen').checked,
    selected_item_ids: selectedItemIds,
    notes: $('#orderNotes').value.trim() || null,
    insurance: {
      insurance_name: insuranceName,
      insurance_number: insuranceNumber,
    },
  };
}

function clearPatientForm({ keepModeHint = false } = {}) {
  selectedPatientId = null;
  searchedPatients = [];
  $('#patientId').value = '';
  $('#patientMrn').value = '';
  $('#patientName').value = '';
  $('#patientGender').value = 'L';
  $('#patientDob').value = '';
  $('#patientIdentityNumber').value = '';
  $('#patientPhone').value = '';
  $('#patientEmail').value = '';
  $('#patientSelect').innerHTML = '<option value="">-- pilih pasien --</option>';
  $('#patientSelect').value = '';
  if (!keepModeHint) {
    $('#patientSearchHint').textContent = 'Form pasien dikosongkan. Siap diisi manual atau dicari ulang.';
  }
}

function getPatientMode() {
  const checked = document.querySelector('input[name="patientMode"]:checked');
  return checked?.value || 'search';
}

function applyPatientMode() {
  const mode = getPatientMode();
  const searchBox = $('#patientSearchBox');
  const patientIdWrap = $('#patientIdWrap');
  const patientMrnWrap = $('#patientMrnWrap');

  if (mode === 'manual') {
    searchBox.classList.add('hidden');
    patientIdWrap.classList.add('hidden');
    patientMrnWrap.classList.add('hidden');
    selectedPatientId = null;
    $('#patientId').value = '';
    $('#patientMrn').value = '';
    $('#patientSelect').value = '';
    $('#patientModeHint').textContent = 'Mode manual: isi data pasien langsung di form. Patient ID tidak dipakai.';
    $('#patientFormTitle').textContent = 'Data Pasien (Input Manual)';
    $('#patientSearchHint').textContent = 'Mode input manual aktif.';
  } else {
    searchBox.classList.remove('hidden');
    patientIdWrap.classList.remove('hidden');
    patientMrnWrap.classList.remove('hidden');
    $('#patientModeHint').textContent = 'Mode cari: gunakan NIK atau Nama+Gender+Tgl Lahir, lalu pilih pasien untuk auto-fill. Field tetap bisa diedit.';
    $('#patientFormTitle').textContent = 'Data Pasien (bisa dari pencarian / edit manual)';
  }
}

function fillPatientForm(patient) {
  selectedPatientId = patient.id || patient.patient_id || null;
  $('#patientId').value = selectedPatientId || '';
  $('#patientMrn').value = patient.medical_record_number || '';
  $('#patientName').value = patient.patient_name || '';
  $('#patientGender').value = patient.gender || 'L';
  $('#patientDob').value = patient.date_of_birth || '';
  $('#patientIdentityNumber').value = patient.identity_number || '';
  $('#patientPhone').value = patient.phone_number || '';
  $('#patientEmail').value = patient.email || '';
  $('#patientSearchHint').textContent = `Pasien terpilih: ${patient.patient_name || selectedPatientId}`;
}

function renderPatientOptions(patients) {
  const select = $('#patientSelect');
  if (!patients.length) {
    select.innerHTML = '<option value="">-- tidak ada hasil --</option>';
    return;
  }
  select.innerHTML = [
    '<option value="">-- pilih pasien --</option>',
    ...patients.map((patient, idx) => {
      const label = [
        patient.patient_name || '-',
        patient.identity_number || '-',
        patient.medical_record_number ? `RM ${patient.medical_record_number}` : null,
      ].filter(Boolean).join(' | ');
      return `<option value="${idx}">${label}</option>`;
    }),
  ].join('');
}

async function searchPatients() {
  const btn = $('#btnSearchPatient');
  btn.disabled = true;
  btn.textContent = 'Mencari...';
  try {
    const nik = $('#searchNik').value.trim();
    const name = $('#searchName').value.trim();
    const gender = $('#searchGender').value;
    const dob = $('#searchDob').value;

    const params = new URLSearchParams();
    if (nik) {
      params.set('identity_number', nik);
    } else if (name && gender && dob) {
      params.set('patient_name', name);
      params.set('gender', gender);
      params.set('date_of_birth', dob);
    } else {
      throw new Error('Isi NIK, atau kombinasi Nama + Gender + Tanggal Lahir');
    }

    const response = await fetch(`/api/patients?${params.toString()}`);
    const json = await response.json();
    if (!json.success) throw new Error(json.message);

    searchedPatients = json.data || [];
    renderPatientOptions(searchedPatients);
    $('#patientSearchHint').textContent = `Ditemukan ${searchedPatients.length} pasien`;

    if (searchedPatients.length === 1) {
      $('#patientSelect').value = '0';
      fillPatientForm(searchedPatients[0]);
      showToast('1 pasien ditemukan, form diisi otomatis');
    } else if (!searchedPatients.length) {
      showToast('Pasien tidak ditemukan', true);
    } else {
      showToast(`Ditemukan ${searchedPatients.length} pasien, silakan pilih`);
    }
  } catch (error) {
    showToast(error.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Cari Pasien';
  }
}

function onPatientSelectChange() {
  const idx = $('#patientSelect').value;
  if (idx === '') return;
  const patient = searchedPatients[Number(idx)];
  if (!patient) return;
  fillPatientForm(patient);
  showToast(`Pasien dipilih: ${patient.patient_name}`);
}

function syncInsuranceField() {
  const isBpjs = $('#insuranceType').value === 'BPJS';
  const input = $('#insuranceNumber');
  input.placeholder = isBpjs ? '000123456789012' : '(opsional untuk Umum)';
  input.required = isBpjs;
}

function renderResultForm(items) {
  const box = $('#resultFormBox');
  box.innerHTML = (items || []).map((item) => `
    <div class="result-group" data-item-id="${item.item_id}">
      <h4 style="margin:0 0 10px;">${item.item_name} <small style="color:#94a3b8">(${item.item_code || item.item_id})</small></h4>
      ${(item.indicators || []).map((indicator) => `
        <div class="result-row" data-test-id="${indicator.test_id}">
          <h5>
            ${indicator.indicator_name}
            <small style="color:#94a3b8">(${indicator.loinc_code || indicator.test_id})</small>
          </h5>
          <div class="form-grid">
            <label>Nilai Hasil
              <input class="res-value" type="text" value="${indicator.suggested?.value ?? ''}" placeholder="contoh: 13.5">
            </label>
            <label>Satuan
              <input class="res-unit" type="text" value="${indicator.unit || indicator.suggested?.unit || ''}" placeholder="g/dL">
            </label>
            <label>Nilai Rujukan
              <input class="res-range" type="text" value="${indicator.suggested?.reference_range ?? ''}" placeholder="12.0 - 16.0">
            </label>
            <label>Flag
              <select class="res-flag">
                <option value="N" ${indicator.suggested?.flag === 'N' ? 'selected' : ''}>N - Normal</option>
                <option value="H" ${indicator.suggested?.flag === 'H' ? 'selected' : ''}>H - High</option>
                <option value="L" ${indicator.suggested?.flag === 'L' ? 'selected' : ''}>L - Low</option>
                <option value="C" ${indicator.suggested?.flag === 'C' ? 'selected' : ''}>C - Critical</option>
              </select>
            </label>
            <label>Catatan
              <input class="res-notes" type="text" value="" placeholder="opsional">
            </label>
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');
}

function showResultPanel(data) {
  pendingVisit = data;
  $('#pendingRunId').textContent = data.run_id;
  $('#pendingOrderId').textContent = data.order_id;
  $('#pendingVisitNumber').textContent = data.visit_number || '-';
  renderResultForm(data.items || []);
  $('#resultPanel').classList.remove('hidden');
  $('#resultPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function collectResultPayload() {
  if (!pendingVisit?.run_id) {
    throw new Error('Belum ada kunjungan pending. Buat kunjungan dulu.');
  }

  const groups = Array.from(document.querySelectorAll('.result-group'));
  const results = groups.map((group) => {
    const itemId = group.getAttribute('data-item-id');
    const meta = pendingVisit.items.find((x) => String(x.item_id) === String(itemId));
    const indicatorRows = Array.from(group.querySelectorAll('.result-row'));
    const indicators = indicatorRows.map((row) => {
      const value = row.querySelector('.res-value').value.trim();
      if (!value) {
        throw new Error('Semua nilai indikator wajib diisi');
      }
      const testId = row.getAttribute('data-test-id');
      const indicatorMeta = (meta?.indicators || []).find((x) => String(x.test_id) === String(testId));
      return {
        test_id: testId,
        indicator_name: indicatorMeta?.indicator_name || '',
        value,
        unit: row.querySelector('.res-unit').value.trim(),
        reference_range: row.querySelector('.res-range').value.trim(),
        flag: row.querySelector('.res-flag').value,
        notes: row.querySelector('.res-notes').value.trim(),
      };
    });

    return {
      item_id: itemId,
      item_name: meta?.item_name || '',
      indicators,
    };
  });

  return {
    run_id: pendingVisit.run_id,
    status: 'completed',
    results,
  };
}

function fillSuggestedValues() {
  if (!pendingVisit?.items?.length) return;
  document.querySelectorAll('.result-group').forEach((group) => {
    const itemId = group.getAttribute('data-item-id');
    const item = pendingVisit.items.find((x) => String(x.item_id) === String(itemId));
    group.querySelectorAll('.result-row').forEach((row) => {
      const testId = row.getAttribute('data-test-id');
      const indicator = (item?.indicators || []).find((x) => String(x.test_id) === String(testId));
      if (!indicator?.suggested) return;
      row.querySelector('.res-value').value = indicator.suggested.value ?? '';
      row.querySelector('.res-unit').value = indicator.unit || indicator.suggested.unit || '';
      row.querySelector('.res-range').value = indicator.suggested.reference_range ?? '';
      row.querySelector('.res-flag').value = indicator.suggested.flag ?? 'N';
    });
  });
  showToast('Nilai saran otomatis diisi. Silakan edit jika perlu.');
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

async function resumeResultEntry(runId) {
  const response = await fetch(`/api/runs/${runId}`);
  const json = await response.json();
  if (!json.success) {
    showToast(json.message, true);
    return;
  }
  const run = json.data;
  if (run.status !== 'awaiting_result' || !run.pending_result) {
    showToast('Run ini tidak menunggu isi hasil', true);
    return;
  }
  showResultPanel({
    run_id: run.id,
    order_id: run.pending_result.order_id,
    visit_id: run.pending_result.visit_id,
    visit_number: run.pending_result.visit_number,
    items: run.pending_result.items,
  });
}

async function testLogin() {
  const btn = $('#btnLogin');
  btn.disabled = true;
  btn.textContent = 'Logging in...';
  try {
    const response = await fetch('/api/auth/login', { method: 'POST' });
    const json = await response.json();
    if (!json.success) throw new Error(json.message);
    showToast(`Login OK: ${json.data.clinic_name || 'klinik'}`);
    await loadReferences();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test Login';
  }
}

async function runSimulation() {
  const btn = $('#btnRun');
  btn.disabled = true;
  btn.textContent = 'Running...';
  try {
    const response = await fetch('/api/simulate/full', { method: 'POST' });
    const json = await response.json();
    if (!json.success) throw new Error(json.message);
    showToast(`Run full sukses: order ${json.data.order_id}`);
    await loadRuns();
  } catch (error) {
    showToast(error.message, true);
    await loadRuns();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run Full Simulation';
  }
}

async function createVisit() {
  const btn = $('#btnCreateVisit');
  btn.disabled = true;
  btn.textContent = 'Membuat kunjungan...';
  try {
    const payload = collectFormPayload();
    const response = await fetch('/api/simulate/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await response.json();
    if (!json.success) throw new Error(json.message);
    showToast(`Kunjungan dibuat: ${json.data.visit_number || json.data.order_id}`);
    showResultPanel(json.data);
    await loadRuns();
  } catch (error) {
    showToast(error.message, true);
    await loadRuns();
  } finally {
    btn.disabled = false;
    btn.textContent = '1. Buat Kunjungan';
  }
}

async function submitResult() {
  const btn = $('#btnSubmitResult');
  btn.disabled = true;
  btn.textContent = 'Mengirim hasil...';
  try {
    const payload = collectResultPayload();
    const response = await fetch('/api/simulate/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await response.json();
    if (!json.success) throw new Error(json.message);
    showToast('Hasil pemeriksaan berhasil dikirim');
    $('#resultPanel').classList.add('hidden');
    pendingVisit = null;
    await loadRuns();
  } catch (error) {
    showToast(error.message, true);
    await loadRuns();
  } finally {
    btn.disabled = false;
    btn.textContent = '3. Kirim Hasil Pemeriksaan';
  }
}

$('#btnRefresh').addEventListener('click', () => {
  loadHealth();
  loadRuns();
  loadReferences();
});
$('#btnLogin').addEventListener('click', testLogin);
$('#btnRun').addEventListener('click', runSimulation);
$('#btnCreateVisit').addEventListener('click', createVisit);
$('#btnSubmitResult').addEventListener('click', submitResult);
$('#btnFillSuggested').addEventListener('click', fillSuggestedValues);
$('#btnSaveConfig').addEventListener('click', saveSettings);
$('#btnSearchPatient').addEventListener('click', searchPatients);
$('#btnClearPatient').addEventListener('click', () => clearPatientForm());
$('#patientSelect').addEventListener('change', onPatientSelectChange);
document.querySelectorAll('input[name="patientMode"]').forEach((el) => {
  el.addEventListener('change', applyPatientMode);
});
['patientName', 'patientIdentityNumber', 'patientDob', 'patientPhone', 'patientEmail'].forEach((id) => {
  $(`#${id}`)?.addEventListener('input', () => {
    if (getPatientMode() === 'manual') {
      selectedPatientId = null;
      $('#patientId').value = '';
      $('#patientMrn').value = '';
    }
  });
});
$('#insuranceType').addEventListener('change', syncInsuranceField);
syncInsuranceField();
applyPatientMode();
document.querySelectorAll('[data-close]').forEach((el) => {
  el.addEventListener('click', () => $('#modal').classList.add('hidden'));
});

window.openDetail = openDetail;
window.resumeResultEntry = resumeResultEntry;

loadHealth();
loadSettings();
loadRuns();
loadReferences();
