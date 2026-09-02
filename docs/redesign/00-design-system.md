# Redesign — Design System (spec 00)

Fundação visual e técnica do redesign. **Toda outra spec depende desta.** Nenhuma tela deve
inventar cor, espaçamento, raio ou anel de foco fora do que está aqui.

Escopo desta spec: `app/globals.css`, `tailwind.config.ts`, `components/ui/*`.

---

## 1. Diagnóstico do que existe hoje

O app atual não é feio — é **ruidoso**. Os problemas são estruturais, não de gosto:

1. **`#e50914` significa quatro coisas ao mesmo tempo:** marca, item de menu ativo, anel de
   foco (`globals.css:71-77`) e "ao vivo". Quando tudo é vermelho, nada é vermelho. Na TV, a
   3 m, o usuário não consegue distinguir "onde está o cursor" de "o que está ativo".
2. **Paleta de acentos dispersa:** `blue-600`, `purple-600`, `sky-400`, `yellow-500`,
   `green-500`, `emerald-500` convivem sem hierarquia (`app/dashboard/page.tsx:280,301`,
   `components/Sidebar.tsx:102-110`).
3. **Glow em tudo:** `shadow-[0_0_20px_rgba(229,9,20,0.8)]`, `shadow-[0_0_10px_#e50914]`
   repetidos. Em painel de TV mal calibrado o vermelho satura e o glow vira borrão.
4. **Tipografia pequena demais para 3 m:** `text-[10px]` e `text-[8px]` carregam informação
   real (percentual de sync, validade da conta, subtítulo do toggle).
5. **Home acumula função de painel administrativo:** "Detalhes da Conta", card promocional do
   TMDb e três cards gigantes com fotos do Unsplash ocupam a dobra abaixo dos carrosséis.
   Nenhum app de streaming faz isso — é conteúdo de *ajustes* na tela de *catálogo*.
6. **Dimensões fixas:** cards `w-[200px] h-[300px]` (`ContentCarousel.tsx:60`) não respondem
   a viewport nem ao tipo de conteúdo (canal ao vivo não é pôster 2:3).

## 2. Direção

**Uma superfície escura e silenciosa; o conteúdo é a única cor.**

A elegância vem de subtração, não de um vermelho novo. Três decisões carregam o redesign:

### 2.1 Separação semântica das cores (a mudança central)

| Papel | Cor | Onde aparece |
|---|---|---|
| **Foco / cursor** | **branco puro** | anel + escala do elemento focado. **Só isso.** |
| **No ar / marca** | vermelho `#E50914` | logotipo, ponto "AO VIVO", barra de progresso de reprodução, badge de transmissão ativa |
| **Estado do sistema** | verde / âmbar | conectado / atenção — apenas como ponto de 6 px, nunca como área |
| **Todo o resto** | escala neutra | menu, cards, bordas, tipografia |

Branco como cursor não é escolha estética: é a única cor que sobrevive a overscan, gama
errada e sobre-saturação de painel de TV. Vermelho sobre glow vermelho, não.

O vermelho da marca **permanece `#E50914`** — o ganho vem de usá-lo em ~5 lugares em vez de 50.

### 2.2 Assinatura: *spotlight*

Cards de conteúdo renderizam a `opacity: .78`. Em `:focus` (D-pad) ou `:hover` (mouse) vão a
`1`, escalam e ganham sombra profunda. Efeito: **a linha inteira recua e o item focado
avança** — o comportamento do Apple TV, obtido com um seletor `:focus` puro, sem JS e sem
`:focus-within` (que não existe no Chromium 53).

É o único efeito "caro" do sistema. Todo o resto é discreto.

### 2.3 Face utilitária monoespaçada

Duração, tempo decorrido, número de canal, contagem de conexões, percentual de sync e horário
de EPG usam a face mono do sistema com `tabular-nums`. Números que mudam não dançam, e a
interface ganha caráter de *equipamento de transmissão* — verdadeiro para o que o app é —
sem baixar nenhuma fonte (crítico: nenhuma webfont é carregada hoje, e não vamos adicionar
uma; TV com rede ruim não pode depender disso).

---

## 3. Tokens

Definidos em `:root` de `app/globals.css` **e** espelhados em `tailwind.config.ts`.
Valores literais, sem `color-mix`, sem `oklch` (nada disso existe no Chromium 53).

```css
:root {
  /* superfícies */
  --bg:          #0B0B0C;  /* canvas do app */
  --surface:     #141416;  /* card, painel, linha de lista */
  --surface-2:   #1C1C1F;  /* elevado: modal, input, item selecionado */
  --surface-3:   #26262A;  /* hover/pressed de superfície */

  /* traços */
  --line:        rgba(255, 255, 255, 0.08);
  --line-strong: rgba(255, 255, 255, 0.16);

  /* texto */
  --text:        #F4F4F5;  /* primário */
  --text-2:      #A8A8B0;  /* secundário — ainda legível a 3 m */
  --text-3:      #71717A;  /* terciário — NUNCA carrega informação necessária */

  /* semântica */
  --focus:       #FFFFFF;
  --brand:       #E50914;  /* marca + no ar. nada mais. */
  --brand-soft:  rgba(229, 9, 20, 0.14);
  --ok:          #34D399;
  --warn:        #FBBF24;

  /* fontes */
  --font-ui:   system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
}
```

Extensão do Tailwind (substitui `primary`/`secondary`/`accent`/`card-bg` atuais, que ficam
como alias deprecados durante a migração e são removidos na spec final):

```ts
colors: {
  bg:        'var(--bg)',
  surface:   { DEFAULT: 'var(--surface)', 2: 'var(--surface-2)', 3: 'var(--surface-3)' },
  line:      { DEFAULT: 'var(--line)', strong: 'var(--line-strong)' },
  ink:       { DEFAULT: 'var(--text)', 2: 'var(--text-2)', 3: 'var(--text-3)' },
  brand:     { DEFAULT: 'var(--brand)', soft: 'var(--brand-soft)' },
  ok: 'var(--ok)', warn: 'var(--warn)',
}
```

### 3.1 Escala tipográfica (mínimos por distância)

Sem `clamp()` (Chrome 79). A escala é por breakpoint.

| Papel | Mobile | Desktop / TV | Regra |
|---|---|---|---|
| Título de herói | `text-3xl` | `md:text-5xl lg:text-6xl` | `font-semibold tracking-tight` |
| Título de seção (linha) | `text-lg` | `md:text-xl` | `font-semibold` |
| Título de card | `text-sm` | `md:text-base` | `font-medium` |
| Corpo | `text-sm` | `md:text-base` | — |
| Metadado | `text-xs` | `md:text-sm` | `text-ink-2` |
| Dado numérico | `text-xs` | `md:text-sm` | `font-mono tabular-nums` |

**Piso absoluto: `text-xs` (12 px).** `text-[10px]` e `text-[8px]` estão banidos — se um texto
só cabe em 10 px, ele não cabe na tela e deve sair.

### 3.2 Espaçamento, raio, elevação

- Escala de espaço: `2 / 3 / 4 / 6 / 8 / 12 / 16` (Tailwind). Nada fora disso.
- Raio: `rounded-lg` (8 px) para controles, `rounded-xl` (12 px) para cards e painéis,
  `rounded-full` só para pílulas e avatares. **Sem `rounded-2xl`** — a 3 m ele lê como blob.
- Safe area de TV: todo container de página usa `px-6 md:px-10 lg:px-14` e a primeira linha
  de conteúdo começa a ≥ `pt-6`.
- Elevação: **uma** sombra, só no item focado. Superfícies se separam por `--line`, não por
  sombra.

---

## 4. Foco (contrato obrigatório)

Substitui o bloco `[data-focusable="true"]:focus` atual de `globals.css:70-77`.

```css
/* Anel via box-shadow, não outline: no Chromium < 94 o outline ignora border-radius
   e desenha um retângulo em volta de um card arredondado. box-shadow acompanha o raio
   em todos os engines-alvo. */
[data-focusable="true"] {
  outline: none;
  transition: transform 180ms ease, opacity 180ms ease, box-shadow 180ms ease;
}

[data-focusable="true"]:focus {
  box-shadow: 0 0 0 3px var(--focus), 0 18px 40px rgba(0, 0, 0, 0.7);
  transform: scale(1.04);
  opacity: 1;
  z-index: 30;
  position: relative;
}
```

Regras de uso:

1. **Todo elemento interativo leva `data-focusable="true"`.** Sem isso ele é invisível para
   `useTvNavigation` (`app/hooks/useTvNavigation.ts:84`).
2. Não escreva `focus:ring-*` nem `focus:outline-*` nos componentes — o estilo global já
   resolve. Classes de anel espalhadas foram a origem da inconsistência atual.
3. Escala `1.04` é o padrão. Cards de pôster grandes podem usar `1.06` via classe
   `.focus-lift-lg`; nada além disso (a 3 m, escala maior corta o vizinho).
4. Contêiner com `overflow-hidden` **corta o anel do filho focado**. Todo scroller horizontal
   precisa de `py-6 px-1` interno de folga (o anel + a escala pedem ~10 px de cada lado).

### 4.1 Spotlight

```css
.spotlight-item { opacity: .78; }
.spotlight-item:focus,
.spotlight-item:hover { opacity: 1; }
```

Aplicado em cards de conteúdo (carrossel e grade). **Não** aplicar em navegação, botões de
formulário ou controles do player — ali o item precisa estar sempre legível.

---

## 5. Limites técnicos (Chromium 53 — webOS 4)

Estes não são preferências. Violá-los produz **tela em branco ou layout colapsado só na TV**,
sem erro de build e sem log.

### Proibido

| Recurso | Chrome mín. | Substituto obrigatório |
|---|---|---|
| **CSS Grid** (`grid`, `grid-cols-*`) | 57 | `components/CardGrid.tsx` (flex + larguras %) |
| `gap` em flex | 84 | `space-x-*` / `space-y-*` / margens |
| `clamp()`, `min()`, `max()` | 79 | escala por breakpoint |
| `aspect-ratio` | 88 | utilitários `.ratio-*` (§5.1) |
| `position: sticky` | 56 | `fixed` / `absolute` |
| `:focus-within`, `:is()`, `:where()` | 60 / 88 / 88 | seletores explícitos |
| `:has()` | 105 | estado em React |
| `scroll-behavior: smooth` | 61 | helper `scrollIntoViewSafe` (§5.2) |
| `backdrop-filter` sem cor sólida atrás | 76 | sempre um `background` opaco de fallback |
| `text-[10px]` / `text-[8px]` | — | piso `text-xs` |

> **Nota de correção:** `.claude/skills/tv-css-compat` afirma que `gap` em **grid** é aceitável
> (Chrome 66+). Isso está incorreto para o piso real do app: **grid inteiro só existe a partir
> do Chrome 57**, e o piso é 53 — como já documentado no cabeçalho de `CardGrid.tsx:91-98`.
> Grid está fora, com ou sem gap. A skill deve ser corrigida.

### Já resolvido automaticamente

`postcss/postcss-tv-legacy.cjs` faz downlevel de `inset` shorthand, `rgb(r g b / a)` e prefixa
`backdrop-filter`. Logo `inset-0`, `bg-white/5`, `border-white/10` são seguros. Sintaxe CSS
moderna nova entra **nesse plugin**, não em CSS solto no componente.

### 5.1 Caixas de proporção

Substituem `w-[200px] h-[300px]` e todo tamanho fixo. Em `globals.css`:

```css
.ratio { position: relative; width: 100%; }
.ratio > .ratio-fill {
  position: absolute; top: 0; right: 0; bottom: 0; left: 0;
  width: 100%; height: 100%;
}
.ratio-poster { padding-top: 150%; }   /* 2:3  — filmes, séries */
.ratio-wide   { padding-top: 56.25%; } /* 16:9 — continuar assistindo, episódios, canais */
.ratio-square { padding-top: 100%; }   /* 1:1  — logo de canal, avatar */
```

### 5.2 Rolagem ao focar

`scrollIntoView({behavior, block, inline})` só aceita objeto a partir do Chrome 61. Helper
único em `app/lib/platform/scroll.ts`:

```ts
export function scrollIntoViewSafe(el: Element, inline: ScrollLogicalPosition = 'center') {
    try {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline });
    } catch {
        el.scrollIntoView(false); // Chromium 53: assinatura booleana
    }
}
```

Chamado no `onFocus` de itens de carrossel. Sem ele, o item focado encosta na borda em vez de
centralizar.

### 5.3 JS

APIs posteriores ao Chrome 53 exigem polyfill em `app/polyfills.ts` (client component lido por
`app/layout.tsx`, inlinado a partir de `public/polyfills-legacy.js`). Antes de usar API nova:
checar caniuse, e se > 53, adicionar lá. **Sintaxe** é tratada pelo SWC via
`browserslist: chrome >= 53` — não elevar esse valor.

---

## 6. Primitivos (`components/ui/`)

Novos. Cada tela do redesign consome estes; nenhuma reimplementa botão, card ou modal.

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| `Button` | `components/ui/Button.tsx` | `variant`: `primary` (branco sólido, texto escuro — é a ação de play), `secondary` (superfície + borda), `ghost` (só texto), `danger`. `size`: `sm`/`md`/`lg`. Já emite `data-focusable`. |
| `IconButton` | `components/ui/IconButton.tsx` | Botão quadrado só com ícone + `aria-label` obrigatório. |
| `Poster` | `components/ui/Poster.tsx` | Imagem em `.ratio-poster`/`.ratio-wide`/`.ratio-square`, `loading="lazy"`, fallback quando a URL falha, barra de progresso opcional, badge opcional. Aplica `.spotlight-item`. |
| `Row` | `components/ui/Row.tsx` | Linha horizontal rolável. `data-carousel="true"`, folga para o anel, título + "Ver todos", `scrollIntoViewSafe` no foco. Substitui `ContentCarousel`. |
| `SectionHeader` | `components/ui/SectionHeader.tsx` | Título + ação opcional à direita. Sem ícone colorido. |
| `Modal` | `components/ui/Modal.tsx` | Overlay, foco inicial no primeiro focável, `Esc`/Back fecha via `NavigationContext`, trava scroll do body. Substitui os 5 modais que hoje repetem essa estrutura. |
| `Field` | `components/ui/Field.tsx` | Label + input/select + mensagem de erro. |
| `Toggle` | `components/ui/Toggle.tsx` | Switch acessível com `aria-pressed`. |
| `Badge` | `components/ui/Badge.tsx` | Pílula pequena. `tone`: `neutral` \| `live` \| `ok` \| `warn`. |
| `EmptyState` | `components/ui/EmptyState.tsx` | Ícone discreto + título + texto + ação. Todo estado vazio passa a usar. |
| `Skeleton` | `components/ui/Skeleton.tsx` | Bloco de carregamento (pulse). Substitui spinner em listas. |

Regras: `'use client'` no topo, 4 espaços de indentação, props tipadas (sem `any`), comentário
em inglês explicando *porquê*, texto de UI em pt-BR.

---

## 7. Critério de aceite

1. `npm run lint` e `npm run build` (com `build:legacy`) passam.
2. `grep -rn "grid-cols\|gap-\|aspect-ratio\|position: *sticky\|clamp(\|focus-within\|text-\[10px\]\|text-\[8px\]" app components` → nenhum resultado em código novo.
3. `grep -rn "focus:ring\|outline:" app components` → só `globals.css`.
4. Nenhuma cor hex literal fora de `globals.css`/`tailwind.config.ts` (exceto o vermelho da
   marca em SVG de logotipo).
5. Navegação de D-pad alcança todo controle nas 4 direções, em toda tela.
6. Nenhuma funcionalidade do inventário (specs 01-05) some — só muda de lugar, e a spec diz
   para onde.
