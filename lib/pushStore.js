import fs from 'fs';
import path from 'path';

const DATA_DIR  = path.join(process.cwd(), 'data');
const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json');
const STATE_FILE = path.join(DATA_DIR, 'push-state.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch { return fallback; }
}

function writeJSON(file, data) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export function getSubscriptions() {
  return readJSON(SUBS_FILE, []);
}

export function upsertSubscription(subscription, symbols) {
  const subs = getSubscriptions();
  const idx = subs.findIndex((s) => s.subscription.endpoint === subscription.endpoint);
  const record = { subscription, symbols, updatedAt: new Date().toISOString() };
  if (idx >= 0) subs[idx] = record;
  else subs.push(record);
  writeJSON(SUBS_FILE, subs);
}

export function removeSubscription(endpoint) {
  const subs = getSubscriptions().filter((s) => s.subscription.endpoint !== endpoint);
  writeJSON(SUBS_FILE, subs);
}

export function removeExpiredSubscriptions(endpoints) {
  const subs = getSubscriptions().filter((s) => !endpoints.includes(s.subscription.endpoint));
  writeJSON(SUBS_FILE, subs);
}

export function getPushState() {
  return readJSON(STATE_FILE, { sentLinks: [], lastCheck: null });
}

export function savePushState(state) {
  writeJSON(STATE_FILE, state);
}
