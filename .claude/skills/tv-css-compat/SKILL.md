---
name: tv-css-compat
description: Checklist de compatibilidade CSS/JS com o piso de browser das TVs (webOS 4 / Chromium 53). Use ao escrever ou revisar qualquer CSS/Tailwind/JS moderno que vai rodar em app/dashboard ou components/.
---

Piso suportado pelo app moderno: **Chromium 53** (webOS 4 real, validado; webOS 5 ≈ 68, webOS 6 ≈ 79 — todos passam). `browserslist` (`chrome >= 53`) controla o downlevel do SWC; **não subir esse valor sem testar em TV real**. Referência completa: seção "Compatibilidade com TVs" do `CLAUDE.md` da raiz.

## Checklist rápido antes de commitar CSS/Tailwind novo

| Evite | Por quê | Alternativa |
|---|---|---|
| `gap-*` em `flex` | exige Chrome 84 | `space-x-*`/`space-y-*` ou margins. `gap` em **grid** é ok (Chrome 66+) |
| `position: sticky` | Chrome 56+, falha silenciosa (elemento rola junto) na webOS 4 | `fixed`/`absolute` com fallback |
| `aspect-ratio` | Chrome 88+ | padding-top trick ou altura fixa |
| `:focus-visible` | Chrome 86+ | use `:focus` (nesta app o foco só chega via D-pad, não há mouse "sujando" o estado) |
| `backdrop-filter` sem prefixo | Chrome 76+, sem fallback fica transparente | o plugin `postcss-tv-legacy.cjs` já prefixa `-webkit-`; ainda assim tenha um fallback de cor sólida |
| `overscroll-behavior` | Chrome 63+ | ok pular, é só um "nice to have" |
| `@supports` para detectar flex gap | dá falso positivo — o `gap` de grid valida a query mesmo sem suporte a flex gap | não confiar nessa feature detection |

Essas classes/propriedades **não geram erro de build** — falham silenciosamente só na TV (tela em branco ou elemento desalinhado, sem log). Rode `/build-check` para lint/types, mas a validação real desses itens é visual, numa TV ou emulador de Chromium antigo.

## Já resolvido automaticamente (não precisa reagir, só saber que existe)

`postcss/postcss-tv-legacy.cjs` (roda por último no `postcss.config.mjs`) faz downlevel de:
- `inset` shorthand → `top/right/bottom/left` (senão todo `absolute inset-0` colapsa pra 0×0 — bug clássico "hero/overlay sumiu").
- `rgb(255 255 255 / .1)` (CSS Color 4, Chrome 66+) → `rgba(255, 255, 255, .1)` (senão `border-white/10`, `bg-black/60` etc. viram `currentColor`/inválido — "app parece wireframe").
- `backdrop-filter` sem `-webkit-`.

Se introduzir uma nova sintaxe CSS moderna que o Tailwind/lightningcss não faz downlevel sozinho, é nesse plugin que a transformação entra — não em CSS manual espalhado pelos componentes.

## APIs de JS em runtime (não CSS)

Se usar uma API de JS nova (não sintaxe — SWC já cuida de sintaxe via browserslist), confira o [caniuse](https://caniuse.com) para Chrome 53. Se for posterior, adicione o polyfill em `app/polyfills.ts` (client component importado por `app/layout.tsx` — só assim chega ao browser, já que o layout é server component). Exemplos já cobertos lá: `Object.entries/values`, `padStart/padEnd`, `flat/flatMap`, `queueMicrotask`, `AbortController`, `structuredClone`, `replaceAll`, `Array.at`, `Object.fromEntries`, `crypto.randomUUID`.

## Onde validar de verdade

Emulador não pega tudo (fontes, timing, memória). Para validação em TV real (LG `tv-sala`), veja a memória `tv-live-inspection-cdp` (ares-inspect + CDP via Node 22).
