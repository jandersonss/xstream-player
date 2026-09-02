# Redesign — Inventário funcional e arquitetura de informação (spec 01)

Levantamento factual do app atual. **Contrato de não-regressão:** toda linha deste inventário
precisa existir depois do redesign. Onde a spec move uma função de lugar, a coluna "destino"
diz para onde.

---

## 1. Inventário por área

### 1.1 Reprodução — `components/VideoPlayer.tsx` (1513 linhas) + 3 telas de watch

Motor: `hls.js` quando aplicável, `<video>` nativo (HLS nativo ou progressive) caso contrário,
escolhido por heurística de dispositivo/URL (`VideoPlayer.tsx:690-903`). Perfil de playback
adaptativo por tier de aparelho (`getPlaybackProfile`, `:70-117`).

| # | Função | Origem | Destino |
|---|---|---|---|
| 1 | Play/pause (clique, botão, `Espaço`) | `:492-502` | player |
| 2 | Seek por barra (VOD) | `:537-547` | player |
| 3 | Seek absoluto em transmissão (Modo TV) | `:518-535` | player |
| 4 | Skip ±10 s por botão | `:549-557` | player |
| 5 | Skip ±5 s / ±10 s por seta (Ctrl = 10 s) | `:610-621` | player |
| 6 | Indicador visual de skip | `:466-477` | player |
| 7 | Ícone central de play/pause | `:480-490` | player |
| 8 | Pular para 0–90 % com teclas `0`–`9` | `:574-583` | player |
| 9 | Volume por slider vertical | `:1406-1445` | player |
| 10 | Volume por seta cima/baixo | `:559-572` | player |
| 11 | Mute (`M`) | `:504-509` | player |
| 12 | Fullscreen (padrão + webkit + iOS) | `:272-335` | player |
| 13 | Sincronização de estado de fullscreen | `:338-365` | player |
| 14 | Legenda embutida via `<track>` WebVTT | `:1125-1134` | player |
| 15 | Ligar/desligar legenda (`C`) | `:238-241` | player |
| 16 | Tamanho da fonte da legenda (`[` / `]`), salvo no perfil | `:229-236` | player |
| 17 | Buscar legenda no OpenSubtitles | `SubtitleSearchPanel.tsx` | painel do player |
| 18 | Baixar legenda encontrada | `SubtitleSearchPanel.tsx:105-114` | painel do player |
| 19 | Configurar chave do OpenSubtitles | `SubtitleSettingsModal.tsx` | **Ajustes** |
| 20 | Recarregar legenda salva ao reabrir | `movie:192-204`, `series:277-326` | player |
| 21 | Download automático de legenda do episódio | `series:277-326` | player |
| 22 | Busca/download de legendas em lote da série | `series:416-483` | tela de série |
| 23 | Cancelar operação em lote | `series:99,815-819` | tela de série |
| 24 | Retomar de onde parou (ignora se > 95 %) | `movie:108-120`, `series:146-160` | player |
| 25 | Salvar progresso de reprodução | `movie:241-252`, `series:385-400` | player |
| 26 | Autoplay via `?autoplay=true` | `movie:207-213`, `series:337-383` | player |
| 27 | Próximo episódio (botão) | `series:623-628` | player |
| 28 | Episódio anterior (botão) | `series:630-635` | player |
| 29 | Prompt de próximo episódio com contagem e auto-avanço | `:416-463` | player |
| 30 | Adiar prompt em 1 min | `:450-454` | player |
| 31 | D-pad entre os dois botões do prompt | `:457-463` | player |
| 32 | Auto-avanço no evento `ended` | `:990-992` | player |
| 33 | Seletor de temporada | `series:867-882` | tela de série |
| 34 | Lista de episódios com barra de progresso | `series:886-964` | tela de série |
| 35 | Favoritar filme/série | `movie:225-239`, `series:751-777` | tela de detalhe |
| 36 | Selo "AO VIVO" | `:1448-1457` | player |
| 37 | Spinner de buffering | `:1138-1152` | player |
| 38 | Ajuda após 15 s de buffering (link `/debug`) | `:243-249` | player |
| 39 | Overlay de erro com link de diagnóstico | `:1213-1224` | player |
| 40 | Barra de buffer carregado | `:907-918` | player |
| 41 | Auto-ocultar controles em 3 s | `:585-595` | player |
| 42 | Voltar (botão + tecla Back da TV) | `:1240-1249,252-255` | player |
| 43 | Título/subtítulo no topo | `:1250-1257` | player |
| 44 | Slot superior direito (`topRightSlot`) | `:1259` | player |
| 45 | Transmitir canal ao vivo | `live:27-79` | player |
| 46 | Entrar em transmissão (`?join=1`) | `live:22-50` | player |
| 47 | Transmitir filme/episódio via relay ffmpeg | `movie:346-369`, `series:586-609` | player |
| 48 | Escolher ponto de início da transmissão | `BroadcastStartModal.tsx` | player |
| 49 | Seek da transmissão (afeta todos) | `movie:325-339` | player |
| 50 | Heartbeat de consumo do relay VOD | `useVodRelayHeartbeat.ts` | hook |
| 51 | Recarregar viewer quando o transmissor busca | `useVodRelayHeartbeat.ts:96-104` | hook |
| 52 | Correção de drift entre transmissor e viewers | `useLiveShare.ts:294-487` | hook |
| 53 | Botão "Sincronizar" manual | `SyncButton.tsx` | player |
| 54 | Checagem de limite de conexões antes de tocar | `useConnectionLimit.ts` | hook |
| 55 | Seleção hls.js / HLS nativo / progressive | `:690-903` | player |
| 56 | Retry automático de erro HLS | `:867-884` | player |
| 57 | Perfil de playback por tier de aparelho | `:70-117` | player |

**Não existe hoje** (não inventar): faixa de áudio, seleção manual de qualidade, EPG, PiP,
miniaturas na barra de seek.

### 1.2 Catálogo — 8 telas

| # | Função | Origem | Destino |
|---|---|---|---|
| 58 | Listar categorias de canais / filmes / séries | `live,movies,series/page.tsx` | tela unificada de categorias |
| 59 | Ordenar categorias A-Z / Z-A | mesmos arquivos | idem |
| 60 | Listar itens da categoria | `*/[categoryId]/page.tsx` | tela unificada de listagem |
| 61 | Ordenar itens (A-Z, Z-A, adicionados, ano) | idem | idem |
| 62 | Scroll infinito | `useInfiniteScroll.ts` | idem (**passa a valer em séries também**) |
| 63 | Voltar para categorias | idem | idem |
| 64 | Contador de itens no cabeçalho | idem | idem |
| 65 | Estado vazio por tela | idem | `EmptyState` |
| 66 | Busca com debounce por tier de aparelho | `search:31-93` | tela de busca |
| 67 | Filtro por tipo (Tudo / Ao vivo / Filmes / Séries) | `search:38-43` | tela de busca |
| 68 | Guarda de corrida entre buscas | `search:179-231` | tela de busca |
| 69 | Favoritos segmentados por tipo | `favorites:11-63` | tela de favoritos |
| 70 | Remover favorito no card | `favorites:46-56` | tela de favoritos |
| 71 | Herói rotativo com trailer do YouTube | `HeroSection.tsx` | home + categorias |
| 72 | Carrosséis dinâmicos do catálogo | `/api/catalog/carousels` | home |
| 73 | Continuar assistindo | `dashboard/page.tsx:86-100` | home |
| 74 | Revelação progressiva de carrosséis | `dashboard/page.tsx:60-84` | home |

### 1.3 Modo TV, aparelhos, perfis, conta

| # | Função | Origem | Destino |
|---|---|---|---|
| 75 | Login com credenciais Xtream | `app/page.tsx:24-42` | tela de entrada |
| 76 | Sessão persistida + fallback `/api/config` | `AuthContext:96-145` | contexto |
| 77 | Sair | `AuthContext:190-209` | **Ajustes** |
| 78 | Gate de PIN de acesso remoto | `RemoteAccessGate.tsx` | gate |
| 79 | Iniciar pareamento de TV (código + QR) | `api/devices/pair/start` | tela de aparelhos |
| 80 | Poll de pareamento | `api/devices/pair/poll` | cliente TV |
| 81 | Aprovar pareamento (código ou `?code=`) | `devices:230-268` | tela de aparelhos |
| 82 | Pré-preencher código vindo do QR | `devices:154-164` | tela de aparelhos |
| 83 | Nome e perfil na aprovação | `devices:141-143,369-393` | tela de aparelhos |
| 84 | Listar aparelhos pareados | `devices:166-175` | tela de aparelhos |
| 85 | Renomear aparelho | `devices:270-281` | tela de aparelhos |
| 86 | Revogar aparelho | `devices:283-294` | tela de aparelhos |
| 87 | Desconectar esta TV / trocar servidor | `devices:193-212` | tela de aparelhos |
| 88 | Handshake token → cookies de sessão | `api/devices/session` | backend |
| 89 | Transmitir canal ao vivo | `live:63-74` | player |
| 90 | Ponto de início antes de transmitir VOD | `BroadcastStartModal.tsx` | player |
| 91 | "Transmitir sempre" por aparelho | `Sidebar:93-113` | **Ajustes** |
| 92 | Grade de transmissões ativas (poll 8 s) | `tv/page.tsx:190-258` | tela Modo TV |
| 93 | Editar nome deste aparelho | `tv/page.tsx:15-59` | tela Modo TV |
| 94 | Entrar numa transmissão | `tv/page.tsx:247-254` | tela Modo TV |
| 95 | Encerrar transmissão de outro aparelho (2 passos) | `tv/page.tsx:102-214` | tela Modo TV |
| 96 | Modal de limite atingido com atalho para transmissões | `LimitReachedModal.tsx` | modal |
| 97 | Sincronizar reprodução entre aparelhos | `useLiveShare.ts:243-421` | player |
| 98 | Sincronizar catálogo com progresso | `Sidebar:116-134` | **Ajustes** + indicador global |
| 99 | Trocar perfil ativo | `ProfileContext:84-88` | seletor de perfil |
| 100 | Criar perfil | `ProfileContext:90-99` | seletor / Ajustes |
| 101 | Renomear perfil | `ProfileContext:101-110` | seletor / Ajustes |
| 102 | Excluir perfil (bloqueado no último) | `ProfileContext:112-129` | seletor / Ajustes |
| 103 | Tela "Quem está assistindo?" | `ProfileSelector.tsx` | gate de entrada |
| 104 | Configurar chave do TMDb | `TMDbSettingsModal.tsx` | **Ajustes** |
| 105 | Idioma de legenda por perfil | `SubtitleContext:111` | **Ajustes** |
| 106 | Tamanho de fonte de legenda por perfil | `ProfileContext:6-9` | player + Ajustes |
| 107 | Dados da conta (validade, conexões, servidor, fuso) | `dashboard/page.tsx:314-338` | **Ajustes** |
| 108 | Contagem de conexões ativas | `useAccountStatus.ts` | **Ajustes** + player |
| 109 | Tela de diagnóstico | `app/debug/page.tsx` | mantida |

---

## 2. Defeitos encontrados no levantamento

Não são opiniões de estilo — são falhas verificáveis. O redesign as corrige porque toca
exatamente esses arquivos; corrigi-las separadamente custaria o mesmo trabalho duas vezes.

| # | Defeito | Evidência | Efeito |
|---|---|---|---|
| D1 | `LimitReachedModal` e `TMDbSettingsModal` **não têm nenhum `data-focusable`** | ambos os arquivos | Os dois modais são **inalcançáveis por controle remoto**. Na TV o usuário fica preso. |
| D2 | `error` é setado mas nunca renderizado em 6 telas de catálogo | `live/movies/series` × (categorias + listagem) | Falha de rede mostra tela vazia sem explicação. |
| D3 | `series/[categoryId]` não usa `useInfiniteScroll` | ausência do import | Categoria grande de séries renderiza tudo de uma vez — trava a TV. |
| D4 | Ordenação "adicionados" compara string como número em `live` e `series`; `movies` usa `Date` | `live:71-82`, `series:86-88`, `movies:74-76` | Ordem errada em duas das três telas. |
| D5 | Overlay de play é `opacity-0 group-hover:opacity-100` | movies, series, search | **Nunca aparece na navegação por D-pad** (não há hover na TV). |
| D6 | Botões de skip, anterior, próximo e volume do player não têm `data-focusable` | `VideoPlayer.tsx` | Inalcançáveis por D-pad. |
| D7 | `aspect-video` no container do player | `VideoPlayer.tsx:1104` | `aspect-ratio` exige Chrome 88; piso é 53. |
| D8 | `favorites` não tem estado de carregamento | `favorites/page.tsx` | Pisca "sem favoritos" antes do fetch. |
| D9 | `getStreamUrl` é código morto | `live/[categoryId]:86-90` | — |
| D10 | `(hasNext \|\| true)` sempre verdadeiro | `VideoPlayer.tsx:1315,1375` | Props `hasNext`/`hasPrevious` não têm efeito. |
| D11 | `TMDbSettingsModal` usa `z-50`; os demais modais usam `z-[100]` | comparação entre modais | Empilhamento incorreto sobre outros modais. |
| D12 | `text-[10px]` / `text-[8px]` carregam informação | `Sidebar:107,127`, `BottomNav:36,55` | Ilegível a 3 m. |

Fora de escopo (registrar, não corrigir agora): a skill `tv-css-compat` afirma que `gap` em
CSS Grid é aceitável; **Grid inteiro exige Chrome 57 e o piso é 53** — ver `CardGrid.tsx:91-98`.
A skill precisa ser corrigida.

---

## 3. Duplicação a consolidar

1. **Três telas de categorias** (`live`, `movies`, `series`) são clones parametrizados por
   tipo, cor de acento e rótulo. → uma tela.
2. **Três telas de listagem por categoria** idem, exceto o card de canal ao vivo (lista
   horizontal) versus pôster 2:3. → uma tela, dois formatos de card.
3. **Botão "Transmitir"** reimplementado três vezes (`live`, `movie`, `series`). → um
   componente.
4. **Cinco modais** repetem overlay, card, foco e fechamento, com divergências de cor e
   z-index. → `components/ui/Modal.tsx`.
5. **Mapeamento `CachedStream` → tipo local** refeito campo a campo em cada tela, com nomes
   divergentes (`icon`→`stream_icon`, `cover||icon`→`cover`). → um normalizador em
   `app/lib/catalogItem.ts`.
6. **Comparadores de ordenação** escritos à mão em seis arquivos. → um módulo de ordenação.

---

## 4. Arquitetura de informação alvo

O problema estrutural da home atual: ela acumula catálogo **e** painel administrativo. Cartão
"Detalhes da Conta", cartão promocional do TMDb, três cards de categoria com fotos do Unsplash
e três pílulas de configuração no cabeçalho ocupam a tela cujo trabalho é *mostrar o que
assistir*.

```
/dashboard                 Início      herói + Continuar assistindo + carrosséis. Só catálogo.
/dashboard/live            Ao vivo     categorias → canais
/dashboard/movies          Filmes      categorias → filmes
/dashboard/series          Séries      categorias → séries
/dashboard/search          Buscar
/dashboard/favorites       Minha lista
/dashboard/tv              Modo TV     transmissões ativas
/dashboard/devices         Aparelhos   pareamento e sessões
/dashboard/settings        Ajustes     ← NOVO destino do que sai da home e da sidebar
/dashboard/watch/*         Reprodução
```

**`/dashboard/settings` (Ajustes)** recebe, sem perder nada:

- Conta: usuário, validade, conexões ativas/máximas, URL do servidor, fuso, **Sair** (77, 107, 108)
- Catálogo: **Atualizar catálogo** com progresso e data do último sync (98)
- Perfis: criar, renomear, excluir, trocar (99–102)
- Legendas: chave do OpenSubtitles, idioma padrão, tamanho da fonte (19, 105, 106)
- TMDb: chave de API e estado (104)
- Modo TV: **Transmitir sempre** (91)
- Diagnóstico: link para `/debug` (109)

A sidebar fica só com navegação de conteúdo + uma entrada "Ajustes". O cabeçalho da home perde
as três pílulas.

---

## 5. Ordem de execução

Cada fase é uma spec própria e um agente. A fase 2 depende da 1; as fases 3-6 são
independentes entre si depois que 1 e 2 existirem.

| Fase | Spec | Entrega |
|---|---|---|
| 1 | `00-design-system.md` | tokens, foco, `.ratio-*`, `components/ui/*` |
| 2 | `02-shell.md` | layout, rail de navegação, nav inferior, **tela de Ajustes** |
| 3 | `03-home.md` | herói + linhas |
| 4 | `04-catalogo.md` | categorias, listagem, busca, favoritos unificados + D2-D5, D8, D9 |
| 5 | `05-player.md` | overlay do player + D6, D7, D10 |
| 6 | `06-tv-mode.md` | Modo TV, aparelhos, perfis, modais + D1, D11 |
