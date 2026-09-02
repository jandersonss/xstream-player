# Redesign — Contrato de API dos primitivos (spec 00b)

Assinaturas exatas de `components/ui/*` e das libs compartilhadas. **Imutável**: as specs
02–06 codificam contra isto. Quem implementa não pode alterar nomes nem tipos; quem consome
não pode reimplementar equivalentes locais.

Todos os arquivos: `'use client'` no topo (exceto as libs puras), indentação de 4 espaços,
sem `any`, comentários em inglês, texto de UI em pt-BR.

---

## `components/ui/Button.tsx`

```ts
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;   // default 'secondary'
    size?: ButtonSize;         // default 'md'
    icon?: LucideIcon;         // ícone à esquerda do rótulo
    loading?: boolean;         // troca o ícone por spinner e aplica disabled
    fullWidth?: boolean;
}
export default function Button(props: ButtonProps): JSX.Element;
```

- Emite `data-focusable="true"` e `tabIndex={0}` sempre; `disabled` remove ambos.
- `primary` = `bg-ink text-bg` (branco sólido — é a ação de reproduzir).
  `secondary` = `bg-surface-2 text-ink border border-line`.
  `ghost` = `text-ink-2 hover:text-ink`, sem fundo.
  `danger` = `bg-surface-2 text-brand border border-line`.
- Alturas: `sm` `h-9 px-3 text-sm`, `md` `h-11 px-4 text-sm md:text-base`,
  `lg` `h-14 px-6 text-base md:text-lg`.
- **Nunca** escrever `focus:ring-*` — o `globals.css` cuida.

## `components/ui/IconButton.tsx`

```ts
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    icon: LucideIcon;
    label: string;             // obrigatório → aria-label e title
    size?: ButtonSize;         // default 'md'
    variant?: ButtonVariant;   // default 'ghost'
    active?: boolean;          // estado ligado (ex.: legenda ativa)
}
export default function IconButton(props: IconButtonProps): JSX.Element;
```

Quadrado (`h-11 w-11` em `md`). Aplica `.focus-flat` quando dentro de barra densa —
o consumidor passa `className="focus-flat"`.

## `components/ui/Poster.tsx`

```ts
export type PosterRatio = 'poster' | 'wide' | 'square';

export interface PosterProps {
    href: string;
    title: string;
    image?: string;
    ratio?: PosterRatio;        // default 'poster'
    subtitle?: string;          // linha de metadado sob o título
    rating?: number | string;
    year?: number | string;
    badge?: { text: string; tone?: 'neutral' | 'live' | 'ok' | 'warn' };
    /** 0..1. Renderiza a barra de progresso vermelha no rodapé da imagem. */
    progress?: number;
    className?: string;
    onFocus?: React.FocusEventHandler<HTMLAnchorElement>;
}
export default function Poster(props: PosterProps): JSX.Element;
```

- Envolve um `next/link` com `data-focusable="true"`, `tabIndex={0}`,
  `className="spotlight-item focus-card"`, e a caixa `.ratio` interna leva
  `focus-card-target` (o anel/escala do foco vão para ela, não para o link — ver §4.1).
- Imagem em `.ratio`/`.ratio-fill` conforme `ratio`, `loading="lazy"`, `decoding="async"`,
  `object-cover`. `onError` troca por um bloco `bg-surface-2` com a inicial do título —
  **não** esconder a imagem deixando buraco.
- Título e metadados **fora** da imagem, abaixo dela (não sobrepostos): a 3 m, texto sobre
  pôster com gradiente é o que mais falha em painel mal calibrado.
- Sem overlay de play dependente de `:hover` (defeito D5 — não existe hover na TV).

## `components/ui/Row.tsx`

```ts
export interface RowProps {
    title: string;
    /** Rótulo do link à direita. Só renderiza se `onViewAll` existir. */
    viewAllLabel?: string;      // default 'Ver todos'
    onViewAll?: () => void;
    children: React.ReactNode;  // normalmente <Poster />
    /** Largura do item na linha. 'poster' 2:3 estreito, 'wide' 16:9 largo. */
    itemWidth?: 'poster' | 'wide';  // default 'poster'
}
export default function Row(props: RowProps): JSX.Element;
```

- **Não trata as setas e não usa `data-carousel`.** Os elementos focáveis são os filhos, não
  o contêiner: quem move o foco horizontalmente é o `useTvNavigation`. Interceptar as setas
  para rolar prenderia o foco no primeiro item para sempre — a lista deslizaria sob um cursor
  parado. (`data-carousel` é lido de `document.activeElement`, que aqui é um filho, então
  nunca casaria.)
- Scroller com classe `.row-scroller` (já tem a folga do anel de foco).
- Cada filho vai num wrapper `flex-shrink-0` com largura por breakpoint —
  `poster`: `w-[42%] sm:w-[30%] md:w-[22%] lg:w-[17%] xl:w-[14%]`;
  `wide`: `w-[72%] sm:w-[46%] md:w-[34%] lg:w-[26%] xl:w-[21%]`.
  Espaçamento com `mr-3 md:mr-4` no wrapper (**nunca** `gap`).
- No `onFocus` de qualquer filho chama `scrollIntoViewSafe(target)`.
- `ArrowLeft`/`ArrowRight` com foco no contêiner rolam a lista.

## `components/ui/SectionHeader.tsx`

```ts
export interface SectionHeaderProps {
    title: string;
    count?: number;             // renderiza " (12)" em .tnum
    action?: React.ReactNode;   // botão à direita
    description?: string;
}
export default function SectionHeader(props: SectionHeaderProps): JSX.Element;
```

Sem ícone colorido à esquerda (a paleta de acentos dispersa é o defeito que estamos removendo).

## `components/ui/Modal.tsx`

```ts
export interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    /** 'sm' 28rem · 'md' 34rem · 'lg' 48rem. Default 'md'. */
    size?: 'sm' | 'md' | 'lg';
}
export default function Modal(props: ModalProps): JSX.Element | null;
```

- `fixed inset-0 z-[100]` — **um único z-index para todos os modais** (corrige D11).
- Fundo `bg-black/80`; card `bg-surface-2 border border-line rounded-xl`.
- Registra `onClose` via `useNavigationOverride` (`app/context/NavigationContext`) para a
  tecla Back da TV, e escuta `Escape`.
- Ao abrir, move o foco para o primeiro `[data-focusable="true"]` de dentro do card.
- Trava o scroll do body enquanto aberto e restaura no fechamento.
- Botão de fechar no canto é um `IconButton` com `data-focusable`.
- **Todo** controle interno precisa de `data-focusable` (corrige D1).

## `components/ui/Field.tsx`

```ts
export interface FieldProps {
    label: string;
    htmlFor?: string;
    error?: string;
    hint?: string;
    children: React.ReactNode;  // input/select já estilizado pelo consumidor
}
export default function Field(props: FieldProps): JSX.Element;

/** Classe única para inputs, para não repetir a string em 12 lugares. */
export const inputClassName: string;
```

`inputClassName` = `w-full h-11 px-3 rounded-lg bg-surface border border-line text-ink
placeholder:text-ink-3 text-sm md:text-base`.
O consumidor aplica `data-focusable="true"` no próprio input.

## `components/ui/Toggle.tsx`

```ts
export interface ToggleProps {
    checked: boolean;
    onChange: (next: boolean) => void;
    label: string;
    description?: string;
    disabled?: boolean;
}
export default function Toggle(props: ToggleProps): JSX.Element;
```

`role="switch"` + `aria-checked`. Estado indicado por posição **e** cor (a 3 m, só cor falha).

## `components/ui/Badge.tsx`

```ts
export type BadgeTone = 'neutral' | 'live' | 'ok' | 'warn';

export interface BadgeProps {
    children: React.ReactNode;
    tone?: BadgeTone;           // default 'neutral'
    /** Ponto pulsante à esquerda. Só faz sentido com tone 'live'. */
    dot?: boolean;
}
export default function Badge(props: BadgeProps): JSX.Element;
```

`live` é o **único** uso permitido do vermelho da marca fora do logotipo.

## `components/ui/EmptyState.tsx`

```ts
export interface EmptyStateProps {
    icon?: LucideIcon;
    title: string;
    description?: string;
    action?: React.ReactNode;
    /** Variante compacta para dentro de seções. */
    compact?: boolean;
}
export default function EmptyState(props: EmptyStateProps): JSX.Element;
```

## `components/ui/Skeleton.tsx`

```ts
export interface SkeletonProps {
    className?: string;
}
export default function Skeleton(props: SkeletonProps): JSX.Element;

/** Linha de pôsteres em carregamento — usa Row por baixo. */
export function SkeletonRow(props: { itemWidth?: 'poster' | 'wide' }): JSX.Element;
```

`animate-pulse bg-surface-2 rounded-lg`.

---

## `app/lib/platform/scroll.ts` (lib pura, sem `'use client'`)

```ts
/**
 * `scrollIntoView` só aceita um objeto de opções a partir do Chromium 61;
 * na webOS 4 (53) a chamada com objeto lança e o item focado nunca centraliza.
 */
export function scrollIntoViewSafe(
    el: Element,
    inline?: ScrollLogicalPosition,   // default 'center'
): void;
```

## `app/lib/catalogItem.ts` (lib pura)

Normaliza `CachedStream` (`app/lib/dbTypes.ts`) — hoje remapeado à mão em cada tela, com
nomes divergentes (`icon`→`stream_icon`, `cover||icon`→`cover`).

```ts
import type { CachedStream, ContentType } from './dbTypes';

export interface CatalogItem {
    id: string;
    type: ContentType;
    name: string;
    image?: string;             // cover ?? icon
    rating?: number;            // parseado; undefined se não numérico
    year?: number;              // de release_date, senão regex \d{4} no nome
    addedAt: number;            // epoch ms; 0 quando ausente. Corrige D4.
    containerExtension?: string;
    releaseDate?: string;
    href: string;               // rota de destino já montada
}

export function toCatalogItem(stream: CachedStream): CatalogItem;
export function toCatalogItems(streams: CachedStream[]): CatalogItem[];
```

`addedAt`: aceitar tanto epoch em segundos (string numérica) quanto data ISO —
`live`/`series` hoje comparam string como número e `movies` usa `Date` (defeito D4).
Usar `last_modified ?? added`.

## `app/lib/catalogSort.ts` (lib pura)

```ts
export type SortOption = 'name-asc' | 'name-desc' | 'added' | 'year';

export const SORT_LABELS: Record<SortOption, string>;   // pt-BR

export function sortCatalogItems(items: CatalogItem[], sort: SortOption): CatalogItem[];

/** Categorias só têm nome. */
export function sortCategories(
    categories: CachedCategory[],
    sort: 'name-asc' | 'name-desc',
): CachedCategory[];
```

Retorna array novo (não muta). Ordenação por nome usa
`localeCompare(b, 'pt-BR', { sensitivity: 'base' })`.
