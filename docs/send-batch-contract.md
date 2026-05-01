# Send Batch Contract

Real message sending lives outside this repository in the operational backend.

## Endpoint pattern

```http
POST /api/automation/whatsapp/{client-slug}/send-batch
Content-Type: application/json
```

## Payload

```json
{
  "campaign_id": "uuid-or-slug",
  "client": "my-client",
  "city": "São Paulo",
  "region": "SP",
  "message_template": "Oi, {nome}! ... {cidade} ...",
  "delay_ms": 2500,
  "validate_only": true,
  "allowed_ddds": ["11"],
  "prospects": [
    {
      "id": "uuid",
      "name": "pessoal",
      "phone": "5511987654321",
      "sourceUrl": "https://example.com",
      "snippet": "audit excerpt around phone"
    }
  ]
}
```

## Required backend behavior

- `validate_only: true` — re-validate DDD + WhatsApp, do not send any messages.
- `validate_only: false` — re-validate before each send, then send.
- Respond with a summary containing `summary.ok`, `summary.failed`, `summary.sendable`.
- Log `batch_started`, `sent`, `failed`, `batch_finished` with `campaign_id` and `client`.

## Template variables

| Variable | Description |
|----------|-------------|
| `{nome}` / `{name}` | Prospect name (use `pessoal` as generic fallback) |
| `{cidade}` / `{city}` | City name |
| `{regiao}` / `{region}` | State/region code |
| `{cliente}` / `{client}` | Client slug |
| `{query}` | Search query used for this region |
