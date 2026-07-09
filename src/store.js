import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'orders.json');

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  }
}

function readAll() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeAll(orders) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(orders, null, 2), 'utf8');
}

export function listOrders() {
  return readAll().sort((a, b) => new Date(b.received_at) - new Date(a.received_at));
}

export function getOrder(orderNumber) {
  return readAll().find((o) => o.order_number === orderNumber) ?? null;
}

export function saveOrder(payload) {
  const orderNumber = payload?.order_info?.order_number;
  if (!orderNumber) {
    throw new Error('order_info.order_number wajib ada');
  }

  const orders = readAll();
  const existing = orders.find((o) => o.order_number === orderNumber);
  const now = new Date().toISOString();

  if (existing) {
    existing.payload = payload;
    existing.received_at = now;
    existing.status = 'received';
    existing.result_payload = null;
    existing.sent_at = null;
    existing.error = null;
    writeAll(orders);
    return existing;
  }

  const order = {
    id: crypto.randomUUID(),
    order_number: orderNumber,
    patient_name: payload?.patient?.name ?? '-',
    test_count: Array.isArray(payload?.order) ? payload.order.length : 0,
    payload,
    status: 'received',
    result_payload: null,
    received_at: now,
    sent_at: null,
    error: null,
  };

  orders.push(order);
  writeAll(orders);
  return order;
}

export function markResultSent(orderNumber, resultPayload, error = null) {
  const orders = readAll();
  const order = orders.find((o) => o.order_number === orderNumber);
  if (!order) return null;

  order.result_payload = resultPayload;
  order.sent_at = new Date().toISOString();
  order.status = error ? 'failed' : 'result_sent';
  order.error = error;
  writeAll(orders);
  return order;
}

export function deleteOrder(orderNumber) {
  const orders = readAll();
  const filtered = orders.filter((o) => o.order_number !== orderNumber);
  if (filtered.length === orders.length) return false;
  writeAll(filtered);
  return true;
}
