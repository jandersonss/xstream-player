# Redesign — Telas de detalhe e reprodução (spec 07)

Depende de: `00-design-system.md`, `00b-api-primitivos.md`. As specs 02–06 já estão aplicadas.

**Arquivos que esta spec possui:**
`app/dashboard/watch/live/[streamId]/page.tsx` (106 linhas) ·
`app/dashboard/watch/movie/[streamId]/page.tsx` (525) ·
`app/dashboard/watch/series/[seriesId]/page.tsx` (996) ·
`components/BroadcastToggle.tsx` (novo)

---

## 1. Por que esta spec existe

Estas três telas ficaram de fora da primeira rodada. A spec 05 tratou do `VideoPlayer` e foi
instruída a **não** tocá-las; a spec 06 tratou dos modais e idem. Resultado: são as únicas
telas que ainda carregam o desenho antigo, e destoam de tudo à volta:

- `focus:ring-red-500`, `focus:ring-red-600`, `focus:ring-emerald-600`, `focus:ring-white`,
  `focus:scale-110`, `focus:text-red-500` — anéis locais que contrariam o contrato de foco
  global (`globals.css` já estiliza `[data-focusable="true"]:focus`).
- Hex literais: `bg-[#141414]`, `bg-[#1a1a1a]`, `bg-[#1f1f1f]`, `bg-[#0f0f0f]`,
  `border-[#333]`, `hover:bg-[#2a2a2a]`.
- Botões, badges e estados vazios construídos à mão em vez dos primitivos.
- O botão "Transmitir" reimplementado **três vezes**, quase idêntico
  (`live:63-74`, `movie:363`, `series:603`) — a duplicação registrada em
  `01-inventario.md` §3.3.

## 2. Escopo — só apresentação

**Não altere lógica.** Preserve integralmente, sem reescrever nem "melhorar":

- Todo o fluxo de dados: `POST /api/proxy` (`get_vod_info`, `get_series_info`),
  `getCachedDetail`/`saveCachedDetail`, enriquecimento por TMDb.
- Retomar de onde parou (`resumeTime`, incluindo a regra de não retomar acima de 95 %),
  `handleProgress`, `updateProgress`.
- Autoplay por `?autoplay=true` e `&episode=`; entrada em transmissão por `?join=1`.
- Modo TV: `useShareBroadcast`, `useSyncPlayback`, `useLiveSessions`, `useVodRelayHeartbeat`,
  `broadcastStart`, `handleBroadcastSeek`, `reloadNonce`, `useConnectionLimit`.
- Legendas: `getSavedSubtitle`, `autoDownloadEpisodeSubtitle`, busca/download em lote
  (`handleBatchSearch`, `handleBatchDownload`, `batchCancelRef`), cota diária, e o mecanismo
  `window.__subtitleEpisode` que passa o contexto de episódio ao `SubtitleSearchPanel`
  — **não refatore esse mecanismo**.
- Seletor de temporada, lista de episódios com progresso, `playNext`/`playPrevious`.
- Favoritar.

Itens 17, 20–35, 45–54 de `01-inventario.md` precisam continuar funcionando.

## 3. `components/BroadcastToggle.tsx` (novo)

Consolida as três cópias do botão "Transmitir".

```ts
export interface BroadcastToggleProps {
    active: boolean;
    onToggle: () => void;
    /** Desabilita enquanto o relay ainda não está pronto. */
    disabled?: boolean;
}
export default function BroadcastToggle(props: BroadcastToggleProps): JSX.Element;
```

Pílula `rounded-full h-10 px-4`, `data-focusable="true"`, ícone `Radio`.
Ligado: `bg-brand text-ink` com `Badge`-style de "no ar" (é um dos usos legítimos do
vermelho — a transmissão está no ar). Desligado: `bg-surface-2 text-ink-2 border border-line`.
Rótulo: "Transmitir" / "Transmitindo".

As três telas passam a usá-lo no `topRightSlot` do `VideoPlayer`.

## 4. `live/[streamId]/page.tsx`

Menor das três. Trocar o botão de transmissão por `BroadcastToggle`, tokens no lugar dos hex,
e remover os `focus:ring-*` locais. Nada mais muda.

## 5. `movie/[streamId]/page.tsx`

Tela de detalhe do filme antes de tocar. Estrutura nova:

- Fundo `bg-bg` (substitui `bg-[#141414]`), backdrop no topo com os dois gradientes do
  padrão do herói (`from-bg via-bg/60 to-transparent` + lateral).
- Voltar: `Button variant="ghost" icon={ArrowLeft}`.
- Título `text-3xl md:text-5xl font-semibold tracking-tight`; sinopse
  `text-sm md:text-base text-ink-2 max-w-3xl`.
- Metadados em `Badge` (ano, duração, gênero) e nota em `.tnum text-ink-2` —
  **sem amarelo, sem vermelho**.
- Ações, nesta ordem: `Button primary size="lg" icon={Play}` **Assistir** (ou **Retomar** com
  o tempo em `.tnum` quando há progresso), `Button secondary icon={Subtitles}` **Legendas**,
  `IconButton` de favorito (`Bookmark`, preenchido quando favoritado, `label` descritivo).
- Estados de carregamento com `Skeleton`; erro com `EmptyState`.

## 6. `series/[seriesId]/page.tsx`

A maior. Mesma moldura de detalhe do filme, mais:

- **Seletor de temporada**: linha rolável horizontal de pílulas
  (`rounded-full h-10 px-4`), ativa `bg-ink text-bg`, inativa
  `bg-surface-2 text-ink-2 border border-line`, todas `data-focusable`. Use a classe
  `.row-scroller` para a folga do anel de foco. Espaçamento com `mr-2` nos itens
  (**nunca** `gap`).
- **Lista de episódios**: linhas `bg-surface border border-line rounded-xl p-4`,
  `data-focusable="true"`, com miniatura em `.ratio .ratio-wide` (largura fixa por
  breakpoint), número e título do episódio, duração em `.tnum`, sinopse em
  `line-clamp-2 text-ink-2`, e barra de progresso `bg-brand` no rodapé quando houver.
  O `IconButton` de legenda do episódio fica à direita, focável por si.
- **Barra de legendas em lote**: agrupar num painel `bg-surface-2 border border-line
  rounded-xl p-4` com `SectionHeader`, `select` de idioma via `Field`, `Button` **Buscar
  legendas** / **Baixar N legendas**, `Button variant="ghost"` **Cancelar** durante a
  operação, e o progresso/cota em `.tnum`. Preserve `batchCancelRef` e toda a lógica.
- O `flex flex-wrap` com `m-1.5` nos filhos (`:790`) está correto para o piso alvo —
  mantenha o padrão de margem, não troque por `gap`.

## 7. Aceite

1. `npx tsc --noEmit` e `npm run lint` limpos.
2. `grep -rn "focus:ring\|focus:outline\|focus:scale\|#141414\|#1a1a1a\|#1f1f1f\|#0f0f0f\|#333\|grid-cols\|gap-\|aspect-ratio\|aspect-video\|clamp(\|focus-within\|sticky\|rounded-2xl\|text-\[10px\]" app/dashboard/watch components/BroadcastToggle.tsx` → vazio.
3. Todo `<button>`, `<a>`, `<input>`, `<select>` dessas telas tem `data-focusable="true"`.
4. Itens 17, 20–35 e 45–54 do inventário continuam funcionando.
5. As três cópias do botão "Transmitir" viraram um único `BroadcastToggle`.
