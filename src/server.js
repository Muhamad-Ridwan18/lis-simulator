import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { listOrders, getOrder, saveOrder, markResultSent, deleteOrder } from './store.js';
import { buildResultPayload } from './resultBuilder.js';
import { sendResultToKlikmedis } from './klikmedisClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT ?? 3001);
const LIS_API_KEY = process.env.LIS_API_KEY?.trim();

if (!LIS_API_KEY) {
  console.error('LIS_API_KEY wajib diisi di file .env');
  process.exit(1);
}

function getProvidedApiKey(req) {
  const headerKey = req.headers['x-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }

  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }

  return '';
}

function requireLisApiKey(req, res, next) {
  const provided = getProvidedApiKey(req);
  if (!provided || provided !== LIS_API_KEY) {
    return res.status(401).json({
      success: false,
      message: 'API Key LIS tidak valid atau tidak dikirim (header: x-api-key)',
    });
  }
  next();
}

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function labNumber() {
  const d = new Date();
  const pad = String(Math.floor(Math.random() * 9999)).padStart(4, '0');
  return `LAB-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${pad}`;
}

async function processSendResult(orderNumber, customResults = null) {
  const order = getOrder(orderNumber);
  if (!order) {
    throw new Error('Order tidak ditemukan');
  }

  const resultPayload = customResults ?? buildResultPayload(order);
  const response = await sendResultToKlikmedis(resultPayload);
  markResultSent(orderNumber, resultPayload);
  return { resultPayload, response };
}

function scheduleAutoSend(orderNumber) {
  if (process.env.AUTO_SEND_RESULT !== 'true') return;

  const delay = Number(process.env.AUTO_SEND_DELAY_MS ?? 3000);
  setTimeout(async () => {
    try {
      await processSendResult(orderNumber);
    } catch (err) {
      markResultSent(orderNumber, null, err.message);
    }
  }, delay);
}

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'lis-simulator',
    klikmedis_base_url: process.env.KLIKMEDIS_BASE_URL ?? 'http://127.0.0.1:8000',
    auto_send: process.env.AUTO_SEND_RESULT === 'true',
    lis_auth_required: true,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/config', (_req, res) => {
  res.json({
    success: true,
    data: {
      lis_api_key: LIS_API_KEY,
      order_auth_header: 'x-api-key',
    },
  });
});

app.post('/order', requireLisApiKey, (req, res) => {
  try {
    const payload = req.body;
    const orderNumber = payload?.order_info?.order_number;

    if (!orderNumber) {
      return res.status(422).json({
        success: false,
        message: 'order_info.order_number wajib diisi',
      });
    }

    if (!Array.isArray(payload?.order) || payload.order.length === 0) {
      return res.status(422).json({
        success: false,
        message: 'order wajib berisi minimal 1 test',
      });
    }

    const order = saveOrder(payload);
    scheduleAutoSend(order.order_number);

    res.status(200).json({
      success: true,
      message: 'Order diterima oleh LIS Simulator',
      data: {
        order_number: order.order_number,
        lab_number: labNumber(),
        status: 'received',
        tests_received: order.test_count,
        received_at: order.received_at,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

app.get('/api/orders', (_req, res) => {
  res.json({ success: true, data: listOrders() });
});

app.get('/api/orders/:orderNumber', (req, res) => {
  const order = getOrder(req.params.orderNumber);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order tidak ditemukan' });
  }
  res.json({ success: true, data: order });
});

app.post('/api/orders/:orderNumber/send-result', async (req, res) => {
  try {
    const customResults = req.body?.results ? req.body : null;
    const { resultPayload, response } = await processSendResult(req.params.orderNumber, customResults);
    res.json({
      success: true,
      message: 'Hasil berhasil dikirim ke Klikmedis',
      data: { result_payload: resultPayload, klikmedis_response: response },
    });
  } catch (err) {
    markResultSent(req.params.orderNumber, null, err.message);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

app.delete('/api/orders/:orderNumber', (req, res) => {
  const deleted = deleteOrder(req.params.orderNumber);
  if (!deleted) {
    return res.status(404).json({ success: false, message: 'Order tidak ditemukan' });
  }
  res.json({ success: true, message: 'Order dihapus' });
});

app.listen(PORT, () => {
  console.log(`LIS Simulator running at http://127.0.0.1:${PORT}`);
  console.log(`Order endpoint: POST http://127.0.0.1:${PORT}/order`);
  console.log(`LIS API Key: ${LIS_API_KEY}`);
});
