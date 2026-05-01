# Safety gates

Regras obrigatórias antes de qualquer envio:

1. **Sem automação conversacional automática**
   - Não responder automaticamente inbox com link/oferta sem aprovação explícita.
   - Em erro de IA/API, preferir silêncio/log, nunca fallback genérico.

2. **DDD por região**
   - Caxias do Sul/RS: `54`
   - Porto Alegre/RS: `51`
   - Canoas/RS: `51`
   - Novo Hamburgo/RS: `51`

3. **Validação WhatsApp pré-envio**
   - Usar Evolution `POST /chat/whatsappNumbers/{instance}` com `{ "numbers": [...] }`.
   - Só enviar para `exists: true`.

4. **Fonte limpa**
   - DuckDuckGo só serve para descobrir URLs.
   - Não extrair telefone diretamente do snippet da busca.
   - Entrar na página/perfil do negócio e extrair do conteúdo real.
   - Descartar redes/plataformas genéricas quando não houver página útil.

5. **Sem dados sensíveis no Git**
   - Não commitar `.env`.
   - Não commitar `data/campaigns.json` real.
   - Não commitar telefones reais, logs ou payloads de envio.

6. **Aprovação humana**
   - Drafts ficam como `draft_pending_paperclip_approval`.
   - Envio real só depois de aprovação explícita do operador.
