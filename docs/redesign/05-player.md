# Redesign — Player (spec 05)

Depende de: `00-design-system.md`, `00b-api-primitivos.md`.

**Arquivos que esta spec possui:** `components/VideoPlayer.tsx` · `components/player/*` (novo)

**Não** edite as três telas de watch (`app/dashboard/watch/**`) além do necessário para
acompanhar mudanças de assinatura — e não há mudança de assinatura: **as props públicas de
`VideoPlayer` ficam idênticas.**

---

## 1. Escopo — decidido com o autor do projeto

Extrair **apenas a camada de apresentação**. Toda a lógica de HLS, autoplay, sincronismo,
timeline de transmissão, teclado e progresso **permanece em `VideoPlayer.tsx`**, com o mesmo
comportamento. Não crie hooks para `hls.js`, não mova o `useEffect` principal
(`:671-1064`), não altere `getPlaybackProfile` nem a heurística de escolha de motor.

Motivo: é o caminho crítico de reprodução, não há suíte de testes, e a validação real é
manual numa TV. O ganho visual não justifica o risco de tocar a lógica.

## 2. Defeitos a corrigir

- **D6** — os botões de skip ±10 s, anterior, próximo e o slider de volume **não têm
  `data-focusable`**: são inalcançáveis por controle remoto.
- **D7** — `aspect-video` no container (`:1104`) exige Chrome 88; o piso é 53.
- **D10** — `(hasNext || true)` e `(hasPrevious || true)` (`:1315,1375`) são sempre
  verdadeiros: as props não têm efeito.

## 3. Regra de teclado (a decisão que destrava o D6)

Hoje o `keydown` do player (`:598-668`) intercepta **todas** as setas e chama
`preventDefault()`. Por isso os botões da barra nunca poderiam ser alcançados mesmo com
`data-focusable`: a navegação global (`useTvNavigation.ts`) nunca recebe o evento.

Regra nova, mínima:

```
Se document.activeElement estiver dentro da barra de controles
  (ancestral com [data-player-controls]):
      NÃO tratar as setas. Deixar propagar → useTvNavigation move o foco entre os botões.
      Enter/Espaço acionam o botão focado (comportamento nativo).
Caso contrário (foco no container/vídeo, que é o estado normal ao assistir):
      comportamento atual — setas fazem seek/volume, 0-9 pulam, M/F/C/[/] agem.
```

O prompt de próximo episódio já tem seu próprio tratamento (`moveNextEpisodePromptFocus`,
`:457-463`) — preservar como está, ele roda antes desta regra.

A tecla Back continua registrada via `useNavigationOverride` (`:252-255`).

## 4. Subcomponentes (`components/player/`)

Puramente de apresentação: recebem valores e callbacks, **não** têm estado de mídia, não
tocam em `videoRef`, não importam `hls.js`.

### `PlayerTopBar.tsx`
```ts
interface PlayerTopBarProps {
    title?: string;
    subtitle?: string;
    onBack?: () => void;
    rightSlot?: React.ReactNode;   // o topRightSlot atual
    visible: boolean;
}
```
Gradiente `bg-gradient-to-b from-black/85 to-transparent`, `IconButton` `ArrowLeft`
`label="Voltar"`, título `text-base md:text-xl font-semibold`, subtítulo
`text-sm text-ink-2`.

### `SeekBar.tsx`
```ts
interface SeekBarProps {
    currentTime: number;
    duration: number;
    bufferedPercent: number;
    disabled: boolean;             // true quando isLive sem timeline de transmissão
    onSeek: (seconds: number) => void;
    onSeekStart: () => void;
    onSeekEnd: () => void;
}
```
Trilho `h-1` que cresce para `h-1.5` no foco. Buffer em `bg-line-strong`, progresso em
`bg-brand` (**terceiro e último uso legítimo do vermelho**). Thumb de 14 px em `bg-ink`,
visível sempre (hoje só aparece no hover — invisível na TV).
`data-focusable="true"` e `focus-flat` no `<input type="range">`.
Manter os seletores `[&::-webkit-slider-thumb]` e `[&::-moz-range-thumb]` — são a única
forma de estilizar o thumb e funcionam no piso alvo.

### `VolumeControl.tsx`
```ts
interface VolumeControlProps {
    volume: number;                // 0..1
    muted: boolean;
    onToggleMute: () => void;
    onVolumeChange: (next: number) => void;
}
```
`IconButton` (`Volume2`/`VolumeX`) `data-focusable`, e o slider vertical **também**
`data-focusable`. O slider deixa de depender de hover para aparecer: fica visível enquanto o
botão ou o próprio slider tiver foco (estado local no componente, via `onFocus`/`onBlur` com
checagem de `relatedTarget`) — ou no hover, no desktop.
A lógica de mute/volume que hoje está inline no `onChange` (`:1411-1430`) passa a chamar
`onVolumeChange`; a decisão de desmutar ao subir o volume fica no `VideoPlayer`, junto de
`adjustVolume`, para não existir em dois lugares.

### `PlayerControls.tsx`
Barra inferior. **Raiz com `data-player-controls`** (o marcador da regra §3).
```ts
interface PlayerControlsProps {
    isPlaying: boolean; onTogglePlay: () => void;
    onSkip: (seconds: number) => void;
    onPrevious?: () => void; onNext?: () => void;
    hasPrevious: boolean; hasNext: boolean;
    isLive: boolean;
    currentTime: number; duration: number;
    subtitlesAvailable: boolean; subtitlesEnabled: boolean; onToggleSubtitles: () => void;
    subtitleFontSize: number; onChangeFontSize: (delta: number) => void;
    isFullscreen: boolean; onToggleFullscreen: () => void;
    seek: SeekBarProps;
    volume: VolumeControlProps;
}
```
- Ordem à esquerda: anterior · −10 s · play/pause · +10 s · próximo · tempo · volume · selo
  AO VIVO. À direita: A− / A+ · legendas · tela cheia.
- **Todos** os botões com `data-focusable="true"` e `focus-flat` (**corrige D6**).
- Anterior/próximo renderizam **apenas** quando `onPrevious`/`onNext` existem **e**
  `hasPrevious`/`hasNext` são `true` (**corrige D10**; passe os valores reais das props do
  `VideoPlayer`).
- Play/pause é o alvo maior: `h-14 w-14`, os demais `h-11 w-11`.
- Tempo em `.tnum text-sm md:text-base` no formato atual.
- Selo AO VIVO: `Badge tone="live" dot`.
- Espaçamento com `space-x-2` (**nunca** `gap`).
- Fundo `bg-gradient-to-t from-black/95 via-black/70 to-transparent`.

### `PlayerOverlays.tsx`
Reúne os quatro overlays hoje soltos no JSX: buffering (`:1138-1152`, incluindo a ajuda de
15 s com link para `/debug`), ícone central de play/pause (`:1154-1165`), indicador de skip
(`:1167-1174`) e erro (`:1213-1224`). Props booleanas e de texto; sem estado próprio.
Erro usa `EmptyState` sobre fundo `bg-black/90` com `Button` para `/debug`.

### `NextEpisodePrompt.tsx`
Move `:1176-1211`. Props: `visible`, `autoSkipProgress` (0..1), `onNext`, `onPostpone`, e
as refs de foco encaminhadas (`nextEpisodeButtonRef`, `postponeButtonRef`,
`nextEpisodePromptRef`) — a navegação por setas dentro do prompt continua em
`VideoPlayer.tsx`. Card `bg-black/90 border border-line rounded-xl` (mantenha o fundo opaco:
`backdrop-filter` não existe no piso alvo; **remova a classe `backdrop-blur-sm`**, que hoje é
inerte). Barra de contagem em `bg-ink`.

## 5. Container do player

Trocar `aspect-video` (**D7**) por dimensionamento explícito, já que o player ocupa a tela:
`relative w-full h-[100vh] max-h-[100vh] bg-black overflow-hidden`, com o `<video>` em
`absolute inset-0 w-full h-full object-contain`. Sem `rounded-xl` em tela cheia.
Manter `containerStyle` com a custom property `--subtitle-font-size` (`:1097-1099`) — o
`globals.css` a consome em `video::cue`.

## 6. O que não muda

Props públicas, `<track>` WebVTT, escolha de motor, retry de HLS, `xhrSetup` com
`Authorization`/token de aparelho, autoplay com espera de buffer, seek tardio pós-metadata,
`onProgress`/`onMetadata`, `timeOffset`/`totalDuration`/`onSeekBeyondWindow`,
auto-ocultar controles em 3 s, todos os atalhos de teclado listados em `01-inventario.md`
(itens 1–57).

## 7. Aceite

1. `npx tsc --noEmit` e `npm run lint` limpos nestes arquivos.
2. `grep -rn "aspect-video\|backdrop-blur\|gap-\|grid-cols\|clamp(\|focus:ring\|focus:outline\|focus-within" components/VideoPlayer.tsx components/player` → vazio.
3. `grep -n "|| true" components/VideoPlayer.tsx components/player/*` → vazio.
4. Todo `<button>` e `<input>` dentro de `components/player/` tem `data-focusable="true"`.
5. As props de `VideoPlayer` são idênticas às de antes — `git diff` da interface
   `VideoPlayerProps` deve ser vazio.
6. Itens 1–57 do inventário continuam funcionando.
