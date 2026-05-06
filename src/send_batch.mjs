#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const ROOT = process.env.PROSPECTOR_ROOT || process.cwd();
const CONFIG_PATH = process.env.PROSPECTOR_CONFIG || path.join(ROOT, 'config/posvendaia.local.json');
const STORE_PATH = process.env.PROSPECTOR_STORE || path.join(ROOT, 'data/posvendaia.paperclip.json');
const ENV_PATH = process.env.PROSPECTOR_ENV_FILE || path.join(ROOT, '.env');

// SP timezone offset (UTC-3, sem ajuste de horário de verão — Brasil aboliu)
const SP_OFFSET_HOURS = -3;

async function readEnvFile(file) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return Object.fromEntries(
      raw.split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const idx = line.indexOf('=');
          return [line.slice(0, idx).trim(), line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')];
        }),
    );
  } catch {
    return {};
  }
}

const envFile = await readEnvFile(ENV_PATH);
function env(name, fallback = '') {
  return process.env[name] || envFile[name] || fallback;
}

const EVOLUTION_BASE_URL = env('EVOLUTION_BASE_URL');
const EVOLUTION_API_KEY = env('EVOLUTION_API_KEY');
const EVOLUTION_INSTANCE = env('EVOLUTION_INSTANCE');

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spHour() {
  const now = new Date();
  return ((now.getUTCHours() + SP_OFFSET_HOURS) + 24) % 24;
}

function todayDateSP() {
  const now = new Date();
  const sp = new Date(now.getTime() + SP_OFFSET_HOURS * 3600 * 1000);
  return sp.toISOString().slice(0, 10);
}

function normalizePhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits || null;
}

function statusListSet(...lists) {
  return new Set(lists.flat().map(normalizePhone).filter(Boolean));
}

function appendAudit(store, event) {
  store.auditLog = Array.isArray(store.auditLog) ? store.auditLog : [];
  store.auditLog.unshift({ at: new Date().toISOString(), ...event });
  store.auditLog = store.auditLog.slice(0, 500);
}

async function sendText(number, text) {
  if (!EVOLUTION_BASE_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
    throw new Error('missing_evolution_config');
  }
  const url = `${EVOLUTION_BASE_URL}/message/sendText/${EVOLUTION_INSTANCE}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
    body: JSON.stringify({ number, text, delay: 0 }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`evolution_http_${response.status}: ${body.slice(0, 200)}`);
  }
  return response.json().catch(() => ({}));
}

const config = await readJson(CONFIG_PATH, {});
const store = await readJson(STORE_PATH, { campaigns: [], knownPhones: [], lastRunAt: null });

const SEND_DELAY_MS = Number(config.sendDelayMs) || 3500;
const DAILY_LIMIT = Number(config.dailySendLimit) || 30;
const MIN_DAILY_TARGET = Number(config.minDailySendTarget) || 0;
const BUSINESS_HOUR_START = Number(config.businessHourStart ?? 9);
const BUSINESS_HOUR_END = Number(config.businessHourEnd ?? 18);

const hourSP = spHour();
if (hourSP < BUSINESS_HOUR_START || hourSP >= BUSINESS_HOUR_END) {
  console.log(JSON.stringify({
    ok: true,
    skipped: true,
    reason: 'outside_business_hours',
    hourSP,
    window: `${BUSINESS_HOUR_START}:00–${BUSINESS_HOUR_END}:00 SP`,
  }, null, 2));
  process.exit(0);
}

const today = todayDateSP();

// Count how many were already sent today
const sentToday = (store.campaigns || []).flatMap((c) => c.prospects || [])
  .filter((p) => p.status === 'sent' && p.sentAt?.startsWith(today)).length;

if (sentToday >= DAILY_LIMIT) {
  console.log(JSON.stringify({ ok: true, skipped: true, reason: 'daily_limit_reached', sentToday, limit: DAILY_LIMIT }, null, 2));
  process.exit(0);
}

let remaining = DAILY_LIMIT - sentToday;
let totalSent = 0;
let totalFailed = 0;
let totalSkippedBlocked = 0;
const blockedPhones = statusListSet(
  config.blockedPhones || [],
  config.blacklistPhones || [],
  store.blockedPhones || [],
  store.blacklistPhones || [],
  store.manualInterventionPhones || [],
  store.ownerInterventionPhones || [],
);

for (const campaign of store.campaigns || []) {
  if (!['draft_pending_approval', 'sending'].includes(campaign.status)) continue;
  if (remaining <= 0) break;

  campaign.status = 'sending';
  const sendable = (campaign.prospects || []).filter((p) => p.status === 'new');

  for (const prospect of sendable) {
    if (remaining <= 0) break;

    const message = prospect.draftMessage;
    const normalizedPhone = normalizePhone(prospect.normalizedPhone);
    if (blockedPhones.has(normalizedPhone)) {
      prospect.status = 'send_blocked';
      prospect.skipReason = 'blocked_or_manual_intervention';
      prospect.blockedAt = new Date().toISOString();
      totalSkippedBlocked++;
      appendAudit(store, { type: 'send_blocked', prospectId: prospect.id, campaignId: campaign.id, reason: prospect.skipReason });
      continue;
    }
    if (!message || !prospect.normalizedPhone) {
      prospect.status = 'send_skipped';
      prospect.skipReason = 'missing_message_or_phone';
      continue;
    }

    try {
      await sendText(prospect.normalizedPhone, message);
      prospect.status = 'sent';
      prospect.sentAt = new Date().toISOString();
      totalSent++;
      remaining--;
      appendAudit(store, { type: 'sent', prospectId: prospect.id, campaignId: campaign.id, client: campaign.client || config.client || null });
      process.stderr.write(`[sent] ${prospect.name} ${prospect.normalizedPhone}\n`);
    } catch (err) {
      prospect.status = 'send_failed';
      prospect.sendError = err.message;
      prospect.failedAt = new Date().toISOString();
      totalFailed++;
      appendAudit(store, { type: 'send_failed', prospectId: prospect.id, campaignId: campaign.id, error: err.message });
      process.stderr.write(`[failed] ${prospect.name} ${prospect.normalizedPhone}: ${err.message}\n`);
    }

    if (remaining > 0) await sleep(SEND_DELAY_MS);
  }

  const stillNew = (campaign.prospects || []).some((p) => p.status === 'new');
  if (!stillNew) campaign.status = 'sent';
}

await writeJson(STORE_PATH, store);

console.log(JSON.stringify({
  ok: true,
  sent: totalSent,
  failed: totalFailed,
  sentToday: sentToday + totalSent,
  dailyLimit: DAILY_LIMIT,
  remainingToday: remaining,
  skippedBlocked: totalSkippedBlocked,
  minDailyTarget: MIN_DAILY_TARGET,
  belowDailyTarget: MIN_DAILY_TARGET > 0 ? sentToday + totalSent < MIN_DAILY_TARGET : false,
  targetGap: MIN_DAILY_TARGET > 0 ? Math.max(0, MIN_DAILY_TARGET - (sentToday + totalSent)) : 0,
}, null, 2));
