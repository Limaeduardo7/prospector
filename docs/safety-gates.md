# Safety Gates

Mandatory rules before any campaign send.

## 1. No automatic conversational automation

- Do not auto-reply to inbound messages with links or offers without explicit operator approval.
- On AI/API errors, prefer silence and logging — never send a generic fallback message.

## 2. DDD / area code validation

- Each region must declare `allowedDdds` in `config/regions.json`.
- Prospects with a DDD not matching the region are automatically discarded with status `discarded_ddd_mismatch`.
- If `allowedDdds` is omitted, all DDDs are accepted.

## 3. WhatsApp pre-send validation

- Use Evolution API `POST /chat/whatsappNumbers/{instance}` with `{ "numbers": [...] }`.
- Only send to numbers where `exists: true`.
- If the Evolution API is unavailable, prospects remain as `candidate_unverified` with `validationReason` — never assume existence.
- Only prospects with status `new` should be considered sendable after human review.

## 4. Clean source policy

- DuckDuckGo is used only to discover business URLs — never to extract phone numbers directly from search snippets.
- Always visit the actual business page and extract phone numbers from real page content.
- Discard social networks, directories, and generic platforms when no useful business page is available.

## 5. No sensitive data in Git

- Never commit `.env`.
- Never commit `data/campaigns.json` with real data.
- Never commit real phone numbers, logs, or send payloads.

## 6. Human approval required

- All drafts are created with status `draft_pending_approval`.
- Real sends only happen after explicit operator approval via the backend endpoint described in [`send-batch-contract.md`](send-batch-contract.md).
