# Campanha PósVenda IA

Este preset adapta o Prospector para gerar listas de prospecção do produto da landing page **PósVenda IA**.

Objetivo: encontrar negócios com compradores anteriores e potencial de recompra/upsell para oferecer um diagnóstico gratuito de automação e agentes de pós-venda no WhatsApp.

## Como configurar

```bash
cp config/posvendaia.example.json config/posvendaia.json
cp data/campaigns.example.json data/posvendaia-campaigns.json
cp .env.example .env
```

Edite `.env` com as credenciais da Evolution API:

```bash
EVOLUTION_BASE_URL=http://127.0.0.1:8088
EVOLUTION_API_KEY=...
EVOLUTION_INSTANCE=...
```

## Como rodar

```bash
PROSPECTOR_CONFIG=./config/posvendaia.json \
PROSPECTOR_STORE=./data/posvendaia-campaigns.json \
npm run draft
```

Para ignorar cadência durante teste:

```bash
PROSPECTOR_CONFIG=./config/posvendaia.json \
PROSPECTOR_STORE=./data/posvendaia-campaigns.json \
npm run draft:force
```

## Público inicial sugerido

O preset começa com quatro frentes:

- Infoprodutores e negócios de educação online.
- E-commerces com recompra possível.
- Clínicas de estética.
- Clínicas odontológicas.

A lógica é procurar negócios que já tenham clientes/compradores e onde pós-venda, retorno, recompra, upsell ou continuidade façam sentido.

## Variáveis do template

Além das variáveis antigas, o preset suporta:

- `{produto}` / `{product}` — nome do produto, padrão `PósVenda IA`.
- `{oferta}` / `{offer}` — oferta comercial, ex: diagnóstico gratuito.
- `{publico}` / `{audience}` — público da região/nicho.
- `{dor}` / `{pain}` — dor principal do nicho.
- `{landing}` / `{landingUrl}` — URL da landing.

Cada prospect salvo recebe também um campo `draftMessage` já renderizado para revisão humana.

## Segurança operacional

- O script gera apenas rascunhos.
- Nenhuma mensagem é enviada automaticamente.
- Se a Evolution API estiver ausente ou indisponível, os números ficam como `candidate_unverified` e não como `new`.
- Envio real continua dependendo de aprovação humana e do backend operacional.

## Ajustes recomendados antes de rodar em volume

1. Revisar nichos e cidades em `config/posvendaia.json`.
2. Ajustar DDDs por região.
3. Validar se a mensagem está alinhada com o tom comercial atual.
4. Revisar prospects manualmente antes de qualquer envio.
5. Registrar leads aprovados no Notion/pipeline comercial antes do contato.
