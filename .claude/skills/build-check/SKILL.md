---
name: build-check
description: Valida mudanças rodando lint e o build completo (legacy + next). Use antes de commitar ou quando o usuário pedir para verificar se o projeto compila.
---

Valide o estado do projeto antes de commit:

1. `npm run lint` — corrija erros de ESLint reportados.
2. `npm run build` — roda `build:legacy` (esbuild+babel para `public/legacy/app.js`) e depois `next build`. Este passo pega erros de tipo (TS `strict`) e de build do Next.

Se qualquer passo falhar, reporte a saída exata e não considere a mudança pronta. Nunca use `next build` isolado — o `build:legacy` é obrigatório.
