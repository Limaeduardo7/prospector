# Send batch contract

O envio real fica fora deste repositório e deve existir no backend operacional.

Endpoint usado em produção:

```http
POST /api/automation/whatsapp/fastfix-academy-prospecting/send-batch
Content-Type: application/json
```

Payload:

```json
{
  "campaign_id": "uuid-ou-slug",
  "city": "Porto Alegre",
  "region": "RS",
  "message_template": "Oi, {nome}! ... {cidade} ...",
  "delay_ms": 2500,
  "validate_only": true,
  "allowed_ddds": ["51"],
  "prospects": [
    {
      "id": "uuid",
      "name": "pessoal",
      "phone": "55DDNUMERO",
      "sourceUrl": "https://exemplo.com",
      "snippet": "trecho de auditoria"
    }
  ]
}
```

Comportamento obrigatório do backend:

- `validate_only=true`: validar DDD + WhatsApp e não enviar mensagem.
- `validate_only=false`: validar novamente antes de cada envio.
- Responder resumo com `summary.ok`, `summary.failed`, `summary.sendable`.
- Logar `batch_started`, `sent`, `failed`, `batch_finished` com `campaign_id`.

Variáveis do template:

- `{nome}` / `{name}`
- `{cidade}` / `{city}`
- `{regiao}` / `{region}`
