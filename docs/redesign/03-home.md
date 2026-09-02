# Redesign — Início (spec 03)

Depende de: `00-design-system.md`, `00b-api-primitivos.md`.

**Arquivos que esta spec possui:** `app/dashboard/page.tsx` · `components/HeroSection.tsx` ·
`components/ContentCarousel.tsx` (excluir) · `components/HomeShortcuts.tsx` (novo)

---

## 1. Problema

A home faz dois trabalhos. Acima da dobra ela é um app de streaming; abaixo ela é um painel
administrativo: card "Detalhes da Conta", card promocional do TMDb e três cards de 256 px de
altura com fotos do Unsplash. O cabeçalho carrega três pílulas de configuração em `text-[10px]`.
O herói é inteiramente clicável mas não tem nenhum botão — na TV não há como saber o que o
Enter faz.

## 2. Escopo

A home passa a mostrar **só catálogo**:

```
┌──────────────────────────────────────────┐
│  HERÓI  (imagem/trailer, metadados,      │
│          Assistir · Minha lista)         │
├──────────────────────────────────────────┤
│  [Ao vivo] [Filmes] [Séries]  ← atalhos  │
│  Continuar assistindo      → linha 16:9  │
│  <carrosséis dinâmicos>    → linhas 2:3  │
└──────────────────────────────────────────┘
```

Tudo que era administrativo migra para `/dashboard/settings` (spec 02). Esta spec **remove**
esses blocos e seus imports.

## 3. `components/HeroSection.tsx`

Preservar sem alteração de comportamento: busca em `/api/catalog/hero?type=`, rotação
automática a cada 30 s, `isTV` desligando o iframe do YouTube, atraso de 2 s antes do trailer,
animação de entrada do texto, swipe horizontal (touch), setas esquerda/direita movendo o slide,
indicadores clicáveis, `data-carousel="true"`.

Mudanças:

1. **Altura**: `h-[52vh] md:h-[64vh] lg:h-[76vh]`. Um pouco menor que o `85vh` atual — a
   primeira linha de conteúdo precisa insinuar-se na dobra, é o que convida a rolar.
2. **Botões explícitos** (o herói deixa de ser um alvo clicável mudo):
   - `Button variant="primary" size="lg" icon={Play}` **Assistir** → rota de watch do item.
   - `Button variant="secondary" size="lg" icon={Bookmark}` **Minha lista** →
     `useFavorites()`; alterna `addFavorite`/`removeFavorite`, rótulo vira **Na sua lista**
     e o ícone preenche quando `isFavorite(id, type)`.
   - Os dois com `data-focusable`. O contêiner do herói **deixa de ser focável** e
     `onClick` sai — a ação agora está nos botões, que é o que o D-pad alcança.
   - As setas esquerda/direita continuam trocando de slide: mova o `onKeyDown` e o
     `data-carousel="true"` para o wrapper dos botões, para que ele seja o elemento focado
     que recebe as setas.
3. **Metadados** (`Badge`): tipo (Filme/Série) em `neutral`, ano, nota. A nota perde o
   amarelo — `text-ink-2` com o valor em `.tnum`. Sem o badge vermelho de tipo.
4. **Gradiente**: `bg-gradient-to-t from-bg via-bg/60 to-transparent`, e um segundo
   gradiente lateral `bg-gradient-to-r from-bg/80 to-transparent` cobrindo 50 % da largura,
   para o texto assentar sobre imagens claras. Ambos com `absolute inset-0` (o plugin
   PostCSS expande `inset`).
5. **Título**: `text-3xl md:text-5xl lg:text-6xl font-semibold tracking-tight`.
   **Descrição**: `text-sm md:text-base text-ink-2 max-w-2xl line-clamp-2`.
6. **Indicadores**: barras de 2 px, `bg-ink` no ativo e `bg-line-strong` nos demais, cada um
   com `data-focusable`. Hoje eles não são focáveis — na TV não há como pular de slide.
7. `isLoading || heroItems.length === 0` continua retornando `null`.

## 4. `components/HomeShortcuts.tsx` (novo)

Faixa horizontal de três `Link` — Ao vivo, Filmes, Séries — substituindo os três cards de
256 px com fotos do Unsplash. Preserva exatamente a mesma navegação em muito menos espaço, e
é o caminho de categorias no mobile (onde o trilho não existe).

Cada atalho: `h-12 px-5 rounded-full bg-surface-2 border border-line`, ícone `size={18}` +
rótulo `text-sm md:text-base`, `data-focusable="true"`. Dispostos com
`flex flex-wrap` e `mr-3 mb-3` nos itens (**nunca** `gap`). Sem imagem de fundo, sem cor por
categoria — a paleta por seção (vermelho/azul/roxo) é justamente o ruído que estamos removendo.

## 5. `app/dashboard/page.tsx`

### 5.1 Remover
- O cabeçalho sobreposto inteiro (`:146-184`): pílulas de TMDb, Legendas e dados da conta.
  A marca migra para o `NavRail` (spec 02). No mobile a marca vai num cabeçalho simples
  acima do herói, `text-lg font-semibold`, sem as pílulas.
- `TMDbSettingsModal` e `SubtitleSettingsModal` (imports, estados `showSettings`/
  `showSubtitleSettings` e a renderização). Esses componentes são excluídos pela spec 02.
- O `CardGrid` com os três cards do Unsplash (`:246-311`) → vira `HomeShortcuts`.
- O `CardGrid` de "Detalhes da Conta" e do card promocional do TMDb (`:314-365`) → Ajustes.
- `useAccountStatus`, `useAuth` (se sobrar sem uso), `useTMDb`, `useSubtitle` e os ícones
  agora órfãos. Remova só o que **suas** mudanças deixaram sem uso.

### 5.2 Preservar
- Carregamento de carrosséis via `/api/catalog/carousels`, com as mesmas dependências de
  efeito (`isConfigured`, `lastSync`).
- "Continuar assistindo" derivado de `progressMap` (`:86-100`), ordenado por `timestamp`,
  10 itens, com os mesmos `href` (incluindo `?autoplay=true` e `&episode=`).
- Revelação progressiva: 3 carrosséis iniciais, sentinela com `IntersectionObserver` e o
  **botão de fallback** "Carregar mais categorias" (obrigatório: em TVs antigas o
  `IntersectionObserver` é um polyfill inerte — ver `app/polyfills.ts`).
- `onViewAll` navegando para `/dashboard/{movies|series}/{categoryId}`.

### 5.3 Substituir
- `ContentCarousel` → `Row` + `Poster` (spec 00b). **Excluir `ContentCarousel.tsx`** depois
  de confirmar com `grep -rn "ContentCarousel" app components` que ninguém mais o importa.
- "Continuar assistindo": `Row itemWidth="wide"` com `Poster ratio="wide"` e
  `progress={item.progress / item.duration}`. A barra de progresso é o segundo uso legítimo
  do vermelho da marca.
- Carrosséis dinâmicos: `Row itemWidth="poster"` com `Poster ratio="poster"`.
- `getCarouselIcon` some — `SectionHeader` não tem ícone colorido.
- Estado de carregamento: enquanto `isLoadingCarousels` e não há dados, renderizar duas
  `SkeletonRow`. Hoje não há nenhum retorno visual nessa janela.

### 5.4 Espaçamento
Corpo da página: `px-6 md:px-10 lg:px-14 pb-12`, linhas separadas por `space-y-10 md:space-y-12`.
O herói é full-bleed (fora desse padding).

## 6. Aceite

1. `npx tsc --noEmit` e `npm run lint` limpos nestes arquivos.
2. `grep -rn "grid-cols\|gap-\|aspect-ratio\|clamp(\|focus:ring\|focus:outline\|focus-within\|sticky\|text-\[10px\]\|unsplash" app/dashboard/page.tsx components/HeroSection.tsx components/HomeShortcuts.tsx` → vazio.
3. `grep -rn "ContentCarousel\|TMDbSettingsModal\|SubtitleSettingsModal" app components` → vazio.
4. Funções 71–74 do inventário preservadas; 104, 105, 107, 108 não aparecem mais aqui
   (estão em Ajustes).
5. No herói, o D-pad alcança Assistir, Minha lista e os indicadores; as setas trocam de slide
   quando o foco está no grupo de botões.
