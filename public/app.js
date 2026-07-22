let currentOrderNumber = null;

const $ = (sel) => document.querySelector(sel);

function showToast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3500);
}

function statusBadge(status) {
  const map = {
    received: 'badge-warning',
    result_sent: 'badge-success',
    failed: 'badge-danger',
  };
  return `<span class="badge ${map[status] ?? 'badge-muted'}">${status}</span>`;
}

function fmtDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID');
}

function buildPreviewResult(order) {
  const tests = order?.payload?.order ?? [];
  const orderId = order.order_id ?? order.payload?.order_info?.order_id ?? order.order_number;
  return {
    order_id: orderId,
    status: 'completed',
    validation_time: '(auto ISO)',
    validator_name: '(auto)',
    notes: 'Pemeriksaan selesai',
    results: tests.map((t) => ({
      test_id: String(t.test_id ?? t.indicator_id ?? t.item_id ?? ''),
      parameter: String(t.parameter ?? t.test_name ?? t.item_name ?? ''),
      value: '(auto-generated)',
      flag: 'N',
      reference_range: t.reference_range ?? t.normal_value ?? '-',
      unit: t.unit ?? '-',
      notes: 'Hasil normal',
      item_id: String(t.item_id ?? t.test_id ?? ''),
      item_name: String(t.item_name ?? t.test_name ?? ''),
    })),
    specimens: '(auto dari payload order)',
  };
}

async function loadHealth() {
  try {
    const [healthRes, configRes] = await Promise.all([
      fetch('/health'),
      fetch('/api/config'),
    ]);
    const data = await healthRes.json();
    const config = await configRes.json();
    $('#healthBadge').textContent = 'online';
    $('#healthBadge').className = 'badge badge-success';
    $('#orderEndpoint').textContent = `POST ${location.origin}/order`;
    $('#kmTarget').textContent = config.data?.result_target ?? data.klikmedis_base_url + '/api/lis/v1/result/receive';
    $('#autoSend').textContent = data.auto_send ? 'ON' : 'OFF';
    $('#lisApiKey').textContent = config.data?.lis_api_key ?? '-';
    $('#kmAuth').textContent = config.data?.klikmedis_email
      ? `${config.data.klikmedis_email} (${config.data.klikmedis_auth ?? 'JWT'})`
      : 'KLIKMEDIS_EMAIL belum diisi';
    if (!data.klikmedis_auth_ready) {
      showToast('Isi KLIKMEDIS_EMAIL dan KLIKMEDIS_PASSWORD di .env untuk kirim hasil', true);
    }
  } catch {
    $('#healthBadge').textContent = 'offline';
    $('#healthBadge').className = 'badge badge-danger';
  }
}

async function loadOrders() {
  const res = await fetch('/api/orders');
  const json = await res.json();
  const orders = json.data ?? [];
  $('#totalOrders').textContent = orders.length;

  const tbody = $('#ordersBody');
  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Belum ada order</td></tr>';
    return;
  }

  tbody.innerHTML = orders.map((o) => `
    <tr>
      <td>${fmtDate(o.received_at)}</td>
      <td><code>${o.order_number}</code></td>
      <td>${o.patient_name ?? '-'}</td>
      <td>${o.test_count ?? 0}</td>
      <td>${statusBadge(o.status)}</td>
      <td class="actions">
        <button class="btn btn-secondary btn-sm" onclick="openDetail('${o.order_number}')">Detail</button>
        <button class="btn btn-primary btn-sm" onclick="sendResult('${o.order_number}')">Kirim Hasil</button>
        <button class="btn btn-danger btn-sm" onclick="deleteOrder('${o.order_number}')">Hapus</button>
      </td>
    </tr>
  `).join('');
}

async function openDetail(orderNumber) {
  const res = await fetch(`/api/orders/${orderNumber}`);
  const json = await res.json();
  if (!json.success) return showToast(json.message, true);

  const order = json.data;
  currentOrderNumber = orderNumber;

  $('#dOrderNumber').textContent = order.order_number;
  $('#dPatient').textContent = order.patient_name ?? '-';
  $('#dStatus').innerHTML = statusBadge(order.status);
  $('#dReceived').textContent = fmtDate(order.received_at);
  $('#dPayload').textContent = JSON.stringify(order.payload, null, 2);
  $('#dResult').textContent = JSON.stringify(
    order.result_payload ?? buildPreviewResult(order),
    null,
    2
  );

  const errBox = $('#dError');
  if (order.error) {
    errBox.textContent = order.error;
    errBox.classList.remove('hidden');
  } else {
    errBox.classList.add('hidden');
  }

  $('#modal').classList.remove('hidden');
}

async function sendResult(orderNumber) {
  if (!confirm('Kirim hasil lab ke Klikmedis?')) return;

  try {
    const res = await fetch(`/api/orders/${orderNumber}/send-result`, { method: 'POST' });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    showToast('Hasil berhasil dikirim');
    await loadOrders();
    if (currentOrderNumber === orderNumber) await openDetail(orderNumber);
  } catch (err) {
    showToast(err.message, true);
    await loadOrders();
  }
}

async function deleteOrder(orderNumber) {
  if (!confirm('Hapus order ini?')) return;
  await fetch(`/api/orders/${orderNumber}`, { method: 'DELETE' });
  showToast('Order dihapus');
  await loadOrders();
}

async function testLogin() {
  const btn = $('#btnLogin');
  btn.disabled = true;
  btn.textContent = 'Logging in...';
  try {
    const res = await fetch('/api/auth/login', { method: 'POST' });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    showToast(`JWT OK: ${json.data?.clinic_name || 'klinik'}`);
  } catch (err) {
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test Login JWT';
  }
}

$('#btnRefresh').addEventListener('click', () => {
  loadHealth();
  loadOrders();
});
$('#btnLogin').addEventListener('click', testLogin);

$('#btnSendResult').addEventListener('click', () => {
  if (currentOrderNumber) sendResult(currentOrderNumber);
});

document.querySelectorAll('[data-close]').forEach((el) => {
  el.addEventListener('click', () => $('#modal').classList.add('hidden'));
});

window.openDetail = openDetail;
window.sendResult = sendResult;
window.deleteOrder = deleteOrder;

loadHealth();
loadOrders();
setInterval(loadOrders, 5000);
