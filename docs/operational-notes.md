# Operational notes

## Texto de oferta configurado

```text
Oi, {nome}! Tudo bem? 👊

Vi que vocês trabalham com assistência técnica e reparo de celulares em {cidade}.

Como hoje é Dia do Trabalhador, estamos liberando uma condição especial para técnicos que querem subir de nível na bancada.

O CPU PRO é um treinamento avançado para quem quer dominar diagnóstico e reparo de CPU, pegar serviços de maior valor e aumentar o ticket da assistência.

Quer que eu te envie o link com as condições especiais de hoje?
```

## Decisões operacionais

- Usar `pessoal` como nome genérico quando o scraping não traz nome confiável.
- Não mandar mensagens automáticas de resposta a inbound por enquanto.
- Nunca enviar fallback de instabilidade.
- Não enviar automaticamente link do FastFix Academy em resposta a palavras como “quero”, “link” etc.

## Resultado de validação da abordagem melhorada

Em produção, a versão melhorada gerou um lote de 41 leads WhatsApp-existentes em quatro cidades, após filtros de DDD e fonte. Os telefones reais não são versionados neste repositório.
