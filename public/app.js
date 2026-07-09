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
  return {
    order_number: order.order_number,
    results: tests.map((t) => ({
      test_id: String(t.test_id),
      test_name: String(t.test_name ?? ''),
      value: '(auto-generated)',
      flag_critical: 'N',
      nilai_normal: 'Normal',
    })),
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
    $('#kmTarget').textContent = data.klikmedis_base_url + '/api/lis/receive-result';
    $('#autoSend').textContent = data.auto_send ? 'ON' : 'OFF';
    $('#lisApiKey').textContent = config.data?.lis_api_key ?? '-';
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

$('#btnRefresh').addEventListener('click', () => {
  loadHealth();
  loadOrders();
});

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
