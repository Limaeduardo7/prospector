# Prospector

Automated regional WhatsApp lead prospecting with Evolution API validation.

Prospector searches for local businesses in configured cities, extracts phone numbers from their websites, validates them against WhatsApp via the Evolution API, and generates campaign drafts ready for human review. No messages are ever sent automatically.

## How it works

1. **Search** — Queries DuckDuckGo for businesses matching your `query` + `city`
2. **Scrape** — Visits each found URL and extracts phone numbers from real page content
3. **Filter** — Validates area code (DDD) against `allowedDdds`
4. **Validate** — Checks each number against WhatsApp via Evolution API
5. **Deduplicate** — Skips phones already in the known-phones store
6. **Draft** — Saves a campaign with status `draft_pending_approval`

Sending is always a separate, human-approved step via the backend endpoint described in [`docs/send-batch-contract.md`](docs/send-batch-contract.md).

## PósVenda IA preset

This repository can be used to prospect qualified businesses for the **PósVenda IA** offer: WhatsApp automations and agents for post-purchase revenue, reactivation, upsell, and attributed revenue.

Use the ready-made preset:

```bash
cp config/posvendaia.example.json config/posvendaia.json
cp data/campaigns.example.json data/posvendaia-campaigns.json
PROSPECTOR_CONFIG=./config/posvendaia.json PROSPECTOR_STORE=./data/posvendaia-campaigns.json npm run draft
```

See [`docs/posvendaia-prospecting.md`](docs/posvendaia-prospecting.md) for operating notes.

## Quickstart

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env with your Evolution API credentials and instance name
```

### 2. Set up your client config

```bash
cp config/regions.example.json config/regions.json
# Edit config/regions.json for your client and target cities
```

### 3. Set up the data store

```bash
cp data/campaigns.example.json data/campaigns.json
```

### 4. Run

```bash
npm run draft         # Respects cadence — skips regions run recently
npm run draft:force   # Always runs regardless of cadence
npm run check         # Syntax check only
```

## Configuration

Edit `config/regions.json`:

```json
{
  "enabled": true,
  "client": "my-client",
  "cadenceHours": 168,
  "messageTemplate": "Oi, {nome}! Vi que vocês atuam em {cidade}...",
  "regions": [
    {
      "city": "São Paulo",
      "region": "SP",
      "query": "clínica odontológica",
      "keywords": ["odonto", "dentista", "clínica"],
      "allowedDdds": ["11"],
      "limit": 30,
      "enabled": true
    }
  ]
}
```

### Top-level fields

| Field | Description |
|-------|-------------|
| `enabled` | Set to `false` to disable all runs (overridden by `--force`) |
| `client` | Client identifier — included in campaign output |
| `cadenceHours` | Hours between runs per region (default: `168` = 1 week) |
| `messageTemplate` | Message template with variable placeholders |

### Region fields

| Field | Required | Description |
|-------|----------|-------------|
| `city` | Yes | City name used in searches |
| `region` | No | State code (e.g. `SP`, `RJ`) |
| `query` | Yes | Business search query (e.g. `"clínica odontológica"`) |
| `keywords` | No | Keywords to confirm page relevance — any match passes |
| `queries` | No | Extra search queries to supplement the main `query` |
| `allowedDdds` | No | Accepted area codes — if omitted, all DDDs pass |
| `limit` | No | Max prospects per run (default: `30`) |
| `enabled` | No | Set to `false` to skip this region |
| `cadenceHours` | No | Per-region cadence override |

### Message template variables

| Variable | Description |
|----------|-------------|
| `{nome}` / `{name}` | Prospect name (falls back to `pessoal`) |
| `{cidade}` / `{city}` | City name |
| `{regiao}` / `{region}` | State/region code |
| `{query}` | Search query used for this region |
| `{produto}` / `{product}` | Product name, e.g. `PósVenda IA` |
| `{oferta}` / `{offer}` | Commercial offer, e.g. diagnostic call |
| `{publico}` / `{audience}` | Target audience for the region/niche |
| `{dor}` / `{pain}` | Main pain used for that niche |
| `{landing}` / `{landingUrl}` | Landing page URL |

Rendered messages are saved per prospect as `draftMessage` for human review.

## Environment variables

| Variable | Description |
|----------|-------------|
| `EVOLUTION_BASE_URL` | Evolution API base URL |
| `EVOLUTION_API_KEY` | Evolution API key |
| `EVOLUTION_INSTANCE` | WhatsApp instance name |
| `EVOLUTION_WHATSAPP_NUMBERS_PATH` | Path override (default: `/chat/whatsappNumbers/{instance}`) |
| `PROSPECTOR_CONFIG` | Config file path override |
| `PROSPECTOR_STORE` | Store file path override |
| `PROSPECTOR_ENV_FILE` | `.env` file path override |
| `PROSPECTOR_ROOT` | Root directory override |

## Campaign prospect statuses

| Status | Meaning |
|--------|---------|
| `new` | WhatsApp-validated, ready for review |
| `duplicate` | Already in known-phones store |
| `invalid_phone` | Could not normalize phone number |
| `discarded_ddd_mismatch` | Area code doesn't match `allowedDdds` |
| `discarded_not_whatsapp` | Number not on WhatsApp |
| `candidate_unverified` | Evolution API unavailable — validation skipped |

Each campaign has status `draft_pending_approval`. Sending requires explicit operator action.

## Multi-client usage

Run separate configs per client using environment variable overrides:

```bash
PROSPECTOR_CONFIG=./config/client-a.json PROSPECTOR_STORE=./data/client-a.json npm run draft
PROSPECTOR_CONFIG=./config/client-b.json PROSPECTOR_STORE=./data/client-b.json npm run draft
```

## Project structure

```
config/
  regions.example.json    # Config template — copy to regions.json
data/
  campaigns.example.json  # Store template — copy to campaigns.json
docs/
  safety-gates.md         # Mandatory gates before any send
  send-batch-contract.md  # Backend API contract for batch sending
  operational-notes.md    # Conventions and operational decisions
src/
  regional_prospecting_draft.mjs  # Main script
.env.example              # Environment template — copy to .env
```

## What is NOT in this repo

- Real phone numbers or campaign data (`data/campaigns.json`)
- API credentials (`.env`)
- Message sending logic (lives in the operational backend)

## Safety rules

See [`docs/safety-gates.md`](docs/safety-gates.md) for mandatory rules around DDD filtering, WhatsApp validation, source policy, and data handling.
