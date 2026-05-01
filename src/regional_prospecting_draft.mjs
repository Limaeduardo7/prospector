#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const ROOT = process.env.PROSPECTOR_ROOT || process.cwd();
const CONFIG_PATH = process.env.REGIONAL_PROSPECTING_CONFIG || path.join(ROOT, 'config/regions.json');
const STORE_PATH = process.env.REGIONAL_PROSPECTING_STORE || path.join(ROOT, 'data/campaigns.json');
const ENV_PATH = process.env.PROSPECTOR_ENV_FILE || path.join(ROOT, '.env');

async function readEnvFile(file) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return Object.fromEntries(raw.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => {
      const idx = line.indexOf('=');
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      return [key, value];
    }));
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
const EVOLUTION_INSTANCE = env('EVOLUTION_INSTANCE', 'Fastfix');
const EVOLUTION_WHATSAPP_NUMBERS_PATH = env('EVOLUTION_WHATSAPP_NUMBERS_PATH', '/chat/whatsappNumbers/{instance}');

const DEFAULT_REGION_DDDS = {
  'caxias do sul': ['54'],
  'porto alegre': ['51'],
  'canoas': ['51'],
  'novo hamburgo': ['51'],
};

const BAD_SOURCE_HOSTS = new Set([
  'duckduckgo.com', 'www.duckduckgo.com', 'google.com', 'www.google.com', 'bing.com', 'www.bing.com',
  'facebook.com', 'www.facebook.com', 'm.facebook.com', 'instagram.com', 'www.instagram.com',
  'youtube.com', 'www.youtube.com', 'tiktok.com', 'www.tiktok.com', 'linkedin.com', 'www.linkedin.com',
]);

function normalizePhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (!digits.startsWith('55')) return null;
  const national = digits.slice(2);
  if (![10, 11].includes(national.length)) return null;
  const ddd = national.slice(0, 2);
  if (/^0/.test(ddd)) return null;
  const subscriber = national.slice(2);
  if (subscriber.length === 9 && subscriber[0] !== '9') return null;
  if (new Set(digits).size <= 3) return null;
  return digits;
}

function normalizeCityKey(city = '') {
  return String(city || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function allowedDddsForRegion(region = {}) {
  if (Array.isArray(region.allowedDdds) && region.allowedDdds.length) {
    return region.allowedDdds.map((d) => String(d).replace(/\D/g, '')).filter(Boolean);
  }
  return DEFAULT_REGION_DDDS[normalizeCityKey(region.city)] || [];
}

function isAllowedDdd(phone, region = {}) {
  const normalized = normalizePhone(phone);
  if (!normalized) return false;
  const allowed = allowedDddsForRegion(region);
  return !allowed.length || allowed.includes(normalized.slice(2, 4));
}

function extractPhones(text) {
  return Array.from(new Set((text.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-.\s]?\d{4}/g) ?? []).map((m) => m.trim())));
}

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function cleanText(value) {
  return decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleFromHtml(html = '', fallback = '') {
  const match = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = match ? cleanText(match[1]).replace(/\s[-|–—].*$/g, '').trim() : '';
  return title.length >= 3 ? title.slice(0, 80) : fallback;
}

function snippetAroundPhone(text = '', rawPhone = '') {
  const cleaned = cleanText(text);
  const idx = cleaned.indexOf(rawPhone.trim());
  if (idx >= 0) return cleaned.slice(Math.max(0, idx - 180), idx + rawPhone.length + 180).trim();
  const digits = rawPhone.replace(/\D/g, '');
  const digitIdx = digits ? cleaned.replace(/\D/g, '').indexOf(digits) : -1;
  if (digitIdx >= 0) return cleaned.slice(0, 500);
  return cleaned.slice(0, 500);
}

function looksLikeBusinessPage(text = '', region = {}) {
  const value = cleanText(text).toLowerCase();
  const city = normalizeCityKey(region.city || '');
  const hasRepairTerm = /(assist[eê]ncia|t[eé]cnica|celular|smartphone|iphone|samsung|reparo|conserto|manuten[cç][aã]o|telefone|whatsapp|contato)/i.test(value);
  const hasCity = !city || normalizeCityKey(value).includes(city);
  return hasRepairTerm && hasCity;
}

function decodeDuckDuckGoUrl(rawHref = '') {
  let href = decodeHtml(rawHref).trim();
  if (!href) return null;
  if (href.startsWith('//')) href = `https:${href}`;
  if (href.startsWith('/')) href = `https://duckduckgo.com${href}`;
  try {
    const url = new URL(href);
    const uddg = url.searchParams.get('uddg');
    if (uddg) return decodeURIComponent(uddg);
    return url.href;
  } catch {
    return null;
  }
}

function isAllowedResultUrl(rawUrl = '') {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, 'www.');
    if (BAD_SOURCE_HOSTS.has(host) || BAD_SOURCE_HOSTS.has(host.replace(/^www\./, ''))) return false;
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    return true;
  } catch {
    return false;
  }
}

function extractResultUrls(html = '') {
  const urls = [];
  const seen = new Set();
  const patterns = [
    /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"/gi,
    /<a[^>]+href="([^"]*\/l\/\?uddg=[^"]+)"/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const decoded = decodeDuckDuckGoUrl(match[1]);
      if (!decoded || seen.has(decoded) || !isAllowedResultUrl(decoded)) continue;
      seen.add(decoded);
      urls.push(decoded);
    }
  }
  return urls.slice(0, 12);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSearchHtml(query) {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0 FastFix prospecting research' } });
  if (!response.ok) throw new Error(`DuckDuckGo HTTP ${response.status}`);
  return { url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`, html: await response.text() };
}

async function fetchPage(url) {
  const response = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 FastFix prospecting research',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
  });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !/text\/html|application\/xhtml|text\/plain/i.test(contentType)) return null;
  const html = await response.text();
  return { url: response.url || url, html, text: cleanText(html), title: titleFromHtml(html) };
}

async function checkWhatsAppNumbers(numbers = []) {
  if (!EVOLUTION_BASE_URL || !EVOLUTION_API_KEY) return new Map();
  const uniqueNumbers = Array.from(new Set(numbers.map(normalizePhone).filter(Boolean)));
  if (!uniqueNumbers.length) return new Map();
  const endpoint = `${EVOLUTION_BASE_URL}${EVOLUTION_WHATSAPP_NUMBERS_PATH.replace('{instance}', EVOLUTION_INSTANCE)}`;
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
    body: JSON.stringify({ numbers: uniqueNumbers }),
  }, 20000);
  const data = await response.json().catch(() => []);
  if (!response.ok || !Array.isArray(data)) return new Map();
  return new Map(data.map((item) => [normalizePhone(item.number), { exists: item.exists === true, jid: item.jid || null, raw: item }]).filter(([number]) => Boolean(number)));
}

async function scrapeRegion(region, knownPhones) {
  const city = region.city;
  const uf = region.region || '';
  const query = region.query || 'assistência técnica celular';
  const limit = Math.max(1, Math.min(100, Number(region.limit) || 30));
  const searches = [
    `${query} ${city} ${uf} whatsapp telefone site`,
    `assistência técnica celular ${city} ${uf} contato whatsapp`,
    `conserto celular ${city} ${uf} telefone assistência`,
  ];

  const seenUrls = new Set();
  const seenPhones = new Set();
  const prospects = [];

  for (const search of searches) {
    const { html } = await fetchSearchHtml(search);
    const urls = extractResultUrls(html);
    for (const resultUrl of urls) {
      if (seenUrls.has(resultUrl)) continue;
      seenUrls.add(resultUrl);
      const page = await fetchPage(resultUrl).catch(() => null);
      if (!page || !looksLikeBusinessPage(page.text, region)) continue;

      for (const rawPhone of extractPhones(page.text)) {
        const normalizedPhone = normalizePhone(rawPhone);
        const dedupeKey = normalizedPhone || rawPhone.replace(/\D/g, '');
        if (!dedupeKey || seenPhones.has(dedupeKey)) continue;
        seenPhones.add(dedupeKey);

        const allowedDdd = normalizedPhone ? isAllowedDdd(normalizedPhone, region) : false;
        const duplicate = normalizedPhone && knownPhones.has(normalizedPhone);
        const status = !normalizedPhone ? 'invalid_phone' : !allowedDdd ? 'discarded_ddd_mismatch' : duplicate ? 'duplicate' : 'candidate_unverified';
        prospects.push({
          id: crypto.randomUUID(),
          name: page.title || `Assistência técnica ${city}`,
          phone: rawPhone,
          normalizedPhone,
          city,
          region: uf || null,
          sourceUrl: page.url,
          snippet: snippetAroundPhone(page.text, rawPhone),
          status,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  const candidates = prospects.filter((p) => p.status === 'candidate_unverified');
  const whatsapp = await checkWhatsAppNumbers(candidates.map((p) => p.normalizedPhone));
  for (const prospect of candidates) {
    const wa = whatsapp.get(prospect.normalizedPhone);
    if (whatsapp.size && !wa?.exists) {
      prospect.status = 'discarded_not_whatsapp';
      prospect.whatsapp = wa?.raw || null;
    } else {
      prospect.status = 'new';
      prospect.whatsapp = wa?.raw || null;
    }
  }

  return prospects.slice(0, Math.max(limit * 5, limit));
}

function summarize(prospects) {
  return {
    scraped: prospects.length,
    valid: prospects.filter((p) => p.status === 'new').length,
    duplicates: prospects.filter((p) => p.status === 'duplicate').length,
    invalidPhone: prospects.filter((p) => p.status === 'invalid_phone').length,
    dddMismatch: prospects.filter((p) => p.status === 'discarded_ddd_mismatch').length,
    notWhatsapp: prospects.filter((p) => p.status === 'discarded_not_whatsapp').length,
    unverified: prospects.filter((p) => p.status === 'candidate_unverified').length,
    badSource: prospects.filter((p) => p.status === 'discarded_bad_source').length,
  };
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const config = await readJson(CONFIG_PATH, { enabled: false, regions: [] });
const store = await readJson(STORE_PATH, { campaigns: [], knownPhones: [], lastRunAt: null });
if (!config.enabled && !force) {
  console.log(JSON.stringify({ ok: true, skipped: true, reason: 'config_disabled' }, null, 2));
  process.exit(0);
}
const knownPhones = new Set(store.knownPhones || []);
const campaigns = [];
const now = Date.now();
for (const region of config.regions || []) {
  if (region.enabled === false) continue;
  const last = region.lastRunAt ? Date.parse(region.lastRunAt) : 0;
  const cadenceMs = Math.max(1, Number(region.cadenceHours || config.cadenceHours || 168)) * 60 * 60 * 1000;
  if (!force && last && now - last < cadenceMs) continue;
  const prospects = await scrapeRegion(region, knownPhones);
  for (const p of prospects) if (p.normalizedPhone && p.status === 'new') knownPhones.add(p.normalizedPhone);
  const campaign = {
    id: crypto.randomUUID(),
    status: 'draft_pending_paperclip_approval',
    city: region.city,
    region: region.region || null,
    query: region.query || 'assistência técnica celular',
    messageTemplate: config.messageTemplate,
    createdAt: new Date().toISOString(),
    prospects,
    summary: summarize(prospects),
  };
  region.lastRunAt = campaign.createdAt;
  campaigns.push(campaign);
}
store.campaigns = [...campaigns, ...(store.campaigns || [])].slice(0, 100);
store.knownPhones = Array.from(knownPhones).slice(0, 10000);
store.lastRunAt = new Date().toISOString();
await writeJson(CONFIG_PATH, config);
await writeJson(STORE_PATH, store);
console.log(JSON.stringify({ ok: true, created: campaigns.length, campaigns: campaigns.map((c) => ({ id: c.id, city: c.city, region: c.region, summary: c.summary })) }, null, 2));
