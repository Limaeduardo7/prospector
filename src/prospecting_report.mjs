#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const ROOT = process.env.PROSPECTOR_ROOT || process.cwd();
const CONFIG_PATH = process.env.PROSPECTOR_CONFIG || path.join(ROOT, 'config/posvendaia.local.json');
const STORE_PATH = process.env.PROSPECTOR_STORE || path.join(ROOT, 'data/posvendaia.paperclip.json');
const ENV_PATH = process.env.PROSPECTOR_ENV_FILE || path.join(ROOT, '.env');

async function readJson(file, fallback) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; } }
async function writeFile(file, content) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, content); }
async function readEnvFile(file) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return Object.fromEntries(raw.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => {
      const idx = line.indexOf('='); return [line.slice(0, idx).trim(), line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')];
    }));
  } catch { return {}; }
}
function todaySP() {
  const sp = new Date(Date.now() - 3 * 3600 * 1000);
  return sp.toISOString().slice(0, 10);
}
function countProspects(campaigns = [], predicate = () => true) {
  return campaigns.flatMap((c) => (c.prospects || []).map((p) => ({ campaign: c, prospect: p }))).filter(({ prospect, campaign }) => predicate(prospect, campaign)).length;
}
function linesForCampaigns(campaigns = []) {
  return campaigns.slice(0, 12).map((c) => {
    const s = c.summary || {};
    return `- ${c.city}/${c.region || ''} — ${c.query}: ${s.valid || 0} válidos, ${s.notWhatsapp || 0} sem WhatsApp, ${s.duplicates || 0} duplicados, ${s.scraped || 0} coletados`;
  }).join('\n') || '- Sem campanhas registradas.';
}
async function appendNotionBlockIfConfigured(markdown, config, envFile) {
  const notion = config.reporting?.notion || {};
  if (!notion.enabled) return { skipped: true, reason: 'notion_disabled' };
  const pageId = process.env[notion.pageIdEnv || 'NOTION_PROSPECTING_LOG_PAGE_ID'] || envFile[notion.pageIdEnv || 'NOTION_PROSPECTING_LOG_PAGE_ID'] || config.notionProspectingLogPageId;
  if (!pageId) return { skipped: true, reason: 'missing_notion_page_id' };
  const key = process.env.NOTION_API_KEY || envFile.NOTION_API_KEY || await fs.readFile('/root/.config/notion/api_key', 'utf8').then((v) => v.trim()).catch(() => '');
  if (!key) return { skipped: true, reason: 'missing_notion_key' };
  const children = markdown.split('\n').slice(0, 90).map((content) => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: content.slice(0, 1900) || ' ' } }] } }));
  const res = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${key}`, 'Notion-Version': '2025-09-03', 'Content-Type': 'application/json' },
    body: JSON.stringify({ children }),
    signal: AbortSignal.timeout(12000),
  }).catch((error) => ({ ok: false, status: 'network_error', text: async () => error.message }));
  if (!res.ok) return { skipped: false, ok: false, status: res.status, error: (await res.text()).slice(0, 300) };
  return { skipped: false, ok: true };
}

const config = await readJson(CONFIG_PATH, {});
const store = await readJson(STORE_PATH, { campaigns: [] });
const envFile = await readEnvFile(ENV_PATH);
const campaigns = store.campaigns || [];
const today = todaySP();
const sentToday = countProspects(campaigns, (p) => p.status === 'sent' && String(p.sentAt || '').startsWith(today));
const newAvailable = countProspects(campaigns, (p) => p.status === 'new');
const failed = countProspects(campaigns, (p) => p.status === 'send_failed');
const blocked = countProspects(campaigns, (p) => p.status === 'send_blocked');
const notWhatsapp = countProspects(campaigns, (p) => p.status === 'discarded_not_whatsapp');
const duplicates = countProspects(campaigns, (p) => p.status === 'duplicate');
const minTarget = Number(config.minDailySendTarget || 20);
const status = sentToday >= minTarget ? 'meta_batida' : newAvailable >= (minTarget - sentToday) ? 'fila_suficiente' : 'precisa_gerar_leads';
const markdown = `# Relatório Prospector PósVenda IA — ${today}\n\n` +
`Status: ${status}\n` +
`Meta diária mínima: ${minTarget}\n` +
`Enviadas hoje: ${sentToday}\n` +
`Gap da meta: ${Math.max(0, minTarget - sentToday)}\n` +
`Novas disponíveis na fila: ${newAvailable}\n` +
`Falhas acumuladas: ${failed}\n` +
`Bloqueadas/manual intervention: ${blocked}\n` +
`Descartadas sem WhatsApp: ${notWhatsapp}\n` +
`Duplicadas: ${duplicates}\n` +
`Campanhas armazenadas: ${campaigns.length}\n` +
`Telefones conhecidos: ${(store.knownPhones || []).length}\n\n` +
`## Últimas campanhas\n${linesForCampaigns(campaigns)}\n`;
const jsonOut = { ok: true, date: today, status, minTarget, sentToday, targetGap: Math.max(0, minTarget - sentToday), newAvailable, failed, blocked, notWhatsapp, duplicates, campaigns: campaigns.length, knownPhones: (store.knownPhones || []).length };
const mdPath = path.resolve(ROOT, config.reporting?.localMarkdownPath || './data/last-prospecting-report.md');
const jsonPath = path.resolve(ROOT, config.reporting?.localJsonPath || './data/last-prospecting-report.json');
await writeFile(mdPath, markdown);
await writeFile(jsonPath, JSON.stringify(jsonOut, null, 2));
const notionResult = await appendNotionBlockIfConfigured(markdown, config, envFile);
console.log(JSON.stringify({ ...jsonOut, markdownPath: mdPath, jsonPath, notion: notionResult }, null, 2));
