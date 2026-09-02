# Redesign — Catálogo (spec 04)

Depende de: `00-design-system.md`, `00b-api-primitivos.md`.

**Arquivos que esta spec possui:**
`app/dashboard/{live,movies,series}/page.tsx` ·
`app/dashboard/{live,movies,series}/[categoryId]/page.tsx` ·
`app/dashboard/search/page.tsx` · `app/dashboard/favorites/page.tsx` ·
`components/SortControls.tsx` · `components/catalog/*` (novo) · `components/Loader.tsx`

Não edite `components/HeroSection.tsx` (spec 03) — apenas importe.

---

## 1. Problema

Seis das oito telas são clones. As três de categorias diferem só em cor de acento
(vermelho/azul/roxo) e rótulo ("Abrir"/"Explorar"/"Episódios"). As três de listagem diferem
no formato do card e em divergências que são defeitos, não decisões:

- **D2** — `error` é setado nas seis telas e **nunca renderizado**. Falha de rede vira tela
  vazia sem explicação.
- **D3** — `series/[categoryId]` não usa `useInfiniteScroll`: uma categoria grande renderiza
  tudo de uma vez e trava a TV.
- **D4** — ordenar por "adicionados" compara string como número em `live` e `series`, e usa
  `Date` em `movies`. Duas das três telas ordenam errado.
- **D5** — o overlay de play é `opacity-0 group-hover:opacity-100`: **nunca aparece** na
  navegação por D-pad, onde não existe hover.
- **D8** — `favorites` não tem estado de carregamento e pisca "sem favoritos".
- **D9** — `getStreamUrl` em `live/[categoryId]/page.tsx:86-90` é código morto.

## 2. Componentes compartilhados (`components/catalog/`)

### 2.1 `CategoryBrowser.tsx`

```ts
export interface CategoryBrowserProps {
    type: ContentType;              // 'live' | 'movie' | 'series'
    title: string;                  // 'TV ao vivo' | 'Filmes' | 'Séries'
    /** Herói do topo. Ausente em 'live', como hoje. */
    hero?: 'movie' | 'series';
}
export default function CategoryBrowser(props: CategoryBrowserProps): JSX.Element;
```

- `useData().getCachedCategories(type)` no mount; estados `loading` / `error` / `categories`.
- Ordenação com `sortCategories` de `@/app/lib/catalogSort` e `useSortPreference('cat_' + type, 'name-asc')`.
  `SortControls` recebe só `name-asc`/`name-desc` (as categorias não têm data nem ano — hoje
  o botão "Adicionados" aparece e não faz nada).
- `SectionHeader` com `title` e `count`.
- Grade: `CardGrid base={2} md={3} lg={4} xl={5} gap={4}`. Cada categoria é um `Link`
  `data-focusable="true"` para `/dashboard/{live|movies|series}/{category_id}`:
  bloco `bg-surface-2 border border-line rounded-xl p-5 min-h-[104px]`, nome em
  `text-sm md:text-base font-medium` com `line-clamp-2`, e um `ChevronRight` `text-ink-3`.
  **Sem cor por seção** — nenhum vermelho/azul/roxo.
- `loading` → `CardGrid` de 12 `Skeleton` com a mesma altura.
- `error` → `EmptyState` com `AlertCircle`, a mensagem, e um `Button` **Tentar de novo**
  que refaz a busca (**corrige D2**).
- Lista vazia sem erro → `EmptyState` "Nenhuma categoria disponível. Atualize o catálogo em
  Ajustes."

### 2.2 `CatalogListing.tsx`

```ts
export interface CatalogListingProps {
    type: ContentType;
    categoryId: string;
    backHref: string;               // '/dashboard/live' etc.
    fallbackTitle: string;          // 'Canais' | 'Filmes' | 'Séries'
}
export default function CatalogListing(props: CatalogListingProps): JSX.Element;
```

- Resolve o nome da categoria em `getCachedCategories(type)` e os itens em
  `getCachedStreams(categoryId, type)`; converte com `toCatalogItems`
  (`@/app/lib/catalogItem`) — elimina os seis mapeamentos manuais de `CachedStream`.
- Ordenação com `sortCatalogItems` e `useSortPreference(type, 'added')`.
  `showYear` só para `movie` e `series` (**corrige D4** de uma vez, no módulo compartilhado).
- **`useInfiniteScroll` sempre**, inclusive para séries (**corrige D3**).
- Cabeçalho: `Button variant="ghost" icon={ArrowLeft}` **Voltar** (`backHref`) +
  `SectionHeader` com o nome da categoria e `count={items.length}` + `SortControls`.
- Grade:
  - `live` → `CardGrid base={2} sm={3} md={4} lg={5} xl={6} gap={4}` com
    `Poster ratio="square"` (o logotipo do canal é quadrado; a lista horizontal atual
    desperdiça a tela e força muitos passos de D-pad).
  - `movie` / `series` → `CardGrid base={2} sm={3} md={4} lg={5} xl={6} gap={6}` com
    `Poster ratio="poster"`, `subtitle` = ano (filmes) ou data de lançamento (séries), e
    `rating` quando existir.
- `loading` → grade de `Skeleton` na mesma proporção. `error` → `EmptyState` +
  **Tentar de novo**. Vazio → `EmptyState` "Nenhum item nesta categoria."
- Sentinela de scroll infinito só quando `hasMore`, com `Loader size="small"`.
- **Excluir** `getStreamUrl` (**D9**) — não portar.

### 2.3 Páginas
As seis páginas viram invólucros de 5–10 linhas:

```tsx
// app/dashboard/movies/page.tsx
export default function MovieCategories() {
    return <CategoryBrowser type="movie" title="Filmes" hero="movie" />;
}

// app/dashboard/movies/[categoryId]/page.tsx
export default function MovieList() {
    const { categoryId } = useParams<{ categoryId: string }>();
    return <CatalogListing type="movie" categoryId={categoryId} backHref="/dashboard/movies" fallbackTitle="Filmes" />;
}
```

`live` passa `hero` ausente. O `-mt-20` de `series/page.tsx:56` some — era compensação de
um cabeçalho sobreposto que não existe mais.

## 3. `components/SortControls.tsx`

Reescrever sobre `catalogSort`:

```ts
export interface SortControlsProps {
    value: SortOption;
    onChange: (next: SortOption) => void;
    options: SortOption[];          // o consumidor decide quais existem
}
```

Botões com `SORT_LABELS`. Selecionado: `bg-surface-3 text-ink`; demais:
`text-ink-2 border border-line`. Todos `data-focusable="true"`, `h-9 px-3 rounded-lg text-sm`,
dispostos com `flex flex-wrap` e `mr-2 mb-2` nos itens (**nunca** `gap`). Some o `showYear`
booleano — quem chama passa a lista de opções válidas.

## 4. `app/dashboard/search/page.tsx`

**Preservar integralmente** a mecânica: `SearchInput` memoizado, debounce e limites por
`getDeviceProfile().tier` (`SEARCH_TUNING`), `MIN_QUERY_LENGTH = 2`, guarda de corrida com
`latestRequestRef` + flag `cancelled`, `SearchResultsGrid`/`SearchResultCard` memoizados,
`useInfiniteScroll` com `initialBatchSize`/`loadBatchSize` do tier.

Mudanças visuais:
- Campo de busca: `inputClassName` (spec 00b) em `h-14`, ícone `Search` à esquerda, spinner
  à direita durante a busca, `data-focusable="true"`.
- Abas Tudo/TV ao vivo/Filmes/Séries: pílulas `rounded-full h-10 px-4`, ativa
  `bg-ink text-bg`, inativa `bg-surface-2 text-ink-2 border border-line`. `mr-2` nos itens.
- Resultados: `toCatalogItems` + `Poster` (`square` para live, `poster` para o resto), com
  `badge={{ text: 'Ao vivo'|'Filme'|'Série' }}`.
- Os quatro estados exclusivos passam a usar `EmptyState`: dica inicial (`Search`), erro
  (`AlertCircle`, mantendo a mensagem atual), buscando (`Skeleton` em grade), sem resultados
  (`AlertCircle` com o termo buscado).

## 5. `app/dashboard/favorites/page.tsx`

- Consumir `isLoaded` de `useFavorites()`; enquanto `false`, renderizar `Skeleton` em grade
  (**corrige D8**). Se o contexto ainda não expõe `isLoaded`, adicione-o —
  `app/context/FavoritesContext.tsx` já tem a informação internamente.
- Três seções (Ao vivo / Filmes / Séries) com `SectionHeader` + `count`, cada uma em
  `CardGrid` de `Poster`. Seção vazia → `EmptyState compact`.
- Remover favorito: `IconButton` com `Trash2` e `label="Remover dos favoritos"`, posicionado
  **abaixo do pôster, ao lado do título** — não sobreposto à imagem. Hoje é um botão dentro
  do card que só aparece no hover; na TV precisa ser um alvo de foco próprio.
- Vazio global: `EmptyState` com `Bookmark`, texto atual e `Button` → `/dashboard/search`.

## 6. `components/Loader.tsx`

Manter o comportamento (props `size`, `helpDelayMs`, link para `/debug` após 15 s — é o
mecanismo de diagnóstico de travamento silencioso em TV). Trocar as cores por tokens:
borda `border-line`, arco `border-t-ink`, texto `text-ink-2`.

## 7. Aceite

1. `npx tsc --noEmit` e `npm run lint` limpos nestes arquivos.
2. `grep -rn "grid-cols\|gap-\|aspect-ratio\|clamp(\|focus:ring\|focus:outline\|focus-within\|sticky\|group-hover:opacity\|text-\[10px\]" app/dashboard/live app/dashboard/movies app/dashboard/series app/dashboard/search app/dashboard/favorites components/catalog components/SortControls.tsx` → vazio.
3. Nenhum hex literal; nenhuma cor por seção (vermelho/azul/roxo).
4. D2, D3, D4, D5, D8 e D9 corrigidos — cada um verificável no diff.
5. Funções 58–70 do inventário preservadas.
6. `grep -rn "pt-\[150%\]\|pt-\[56.25%\]" app/dashboard components/catalog` → vazio
   (substituído por `.ratio-*`).
