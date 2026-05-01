# Prospector

Automação de prospecção regional para WhatsApp com foco em assistência técnica de celulares.

Este repositório guarda a configuração/código **sanitizados** da automação usada no FastFix:

- coleta URLs de negócios via busca;
- entra nas páginas/perfis encontrados;
- extrai telefones do conteúdo real da página;
- filtra por cidade/DDD esperado;
- valida se o número existe no WhatsApp via Evolution API antes de virar lead válido;
- gera campanhas em `draft_pending_paperclip_approval`;
- mantém envio real separado e dependente de aprovação explícita.

> Não commitar `.env`, tokens, logs, telefones reais ou stores de campanha com dados pessoais.

## Setup rápido

```bash
cp .env.example .env
cp config/regions.example.json config/regions.json
cp data/campaigns.example.json data/campaigns.json
# edite .env com Evolution local/produção
npm run check
npm run draft:force
```

## Arquivos principais

- `src/regional_prospecting_draft.mjs` — gerador de drafts com validação DDD + WhatsApp.
- `config/regions.example.json` — regiões, DDDs permitidos e texto da oferta.
- `data/campaigns.example.json` — formato do store local sem dados reais.
- `docs/safety-gates.md` — travas obrigatórias antes de qualquer envio.
- `docs/send-batch-contract.md` — contrato do endpoint de envio usado no backend.

## Estado operacional atual

- Respostas automáticas do bot FastFix estão desativadas por decisão operacional.
- O prospector pode gerar drafts e validar números.
- Envio real deve ocorrer somente após aprovação humana explícita.
