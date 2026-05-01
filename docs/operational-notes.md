# Operational Notes

Decisions and conventions for running Prospector in production.

## Prospect name fallback

When scraping does not return a reliable business name, use `pessoal` as the generic
name in the message template. This avoids sending wrong names and keeps the tone neutral.

## Conversational automation

Do not configure auto-replies to inbound WhatsApp messages. Outbound prospecting drafts
and inbound conversation handling are separate concerns — keep them decoupled.

## Instability handling

If the Evolution API or the backend is unstable, do not send fallback or retry messages
automatically. Prefer silence and log the failure for manual review.

## Cadence

Each region tracks its last run timestamp in `config/regions.json` under `lastRunAt`.
The global `cadenceHours` (default: 168 = 1 week) prevents re-scraping too frequently.
Use `npm run draft:force` to bypass cadence during testing or when a fresh batch is needed.

## Known phones store

`data/campaigns.json` keeps a rolling set of up to 10,000 known phone numbers.
Phones already in this set are marked `duplicate` and excluded from new campaigns.
The store also keeps the last 100 campaigns for audit purposes.

## Multi-client setup

To run Prospector for multiple clients from the same machine, use separate config and
store files per client and point to them via environment variables:

```bash
PROSPECTOR_CONFIG=./config/client-a.json PROSPECTOR_STORE=./data/client-a.json npm run draft
PROSPECTOR_CONFIG=./config/client-b.json PROSPECTOR_STORE=./data/client-b.json npm run draft
```
