# Redesign — Modo TV, aparelhos, perfis e entrada (spec 06)

Depende de: `00-design-system.md`, `00b-api-primitivos.md`.

**Arquivos que esta spec possui:**
`app/dashboard/tv/page.tsx` · `app/dashboard/devices/page.tsx` · `app/page.tsx` ·
`components/BroadcastStartModal.tsx` · `components/LimitReachedModal.tsx` ·
`components/ProfileModal.tsx` · `components/ProfileSelector.tsx` ·
`components/RemoteAccessGate.tsx` · `components/SyncButton.tsx` ·
`components/SubtitleSearchPanel.tsx`

Não edite `components/settings/*` nem `app/dashboard/settings/page.tsx` (spec 02) — mas note
que a spec 02 cria uma seção de Perfis que reusa a mesma lógica de `useProfile()`.

---

## 1. Defeitos a corrigir

- **D1** — `LimitReachedModal.tsx` **não tem nenhum `data-focusable`**. Na TV o modal abre e
  o usuário fica preso: não há como alcançar nenhum botão nem fechar. É a falha mais grave do
  levantamento.
- **D11** — z-index divergente entre modais (`z-50` × `z-[100]`). Resolvido ao migrar todos
  para `components/ui/Modal.tsx`.

## 2. Regra geral

**Todo modal desta spec passa a usar `components/ui/Modal.tsx`.** O primitivo já entrega
overlay, z-index único, foco inicial no primeiro focável, `Escape`, tecla Back via
`useNavigationOverride` e trava de scroll. Remova de cada arquivo o overlay manual
(`fixed inset-0 z-[100] bg-black/80 …`), o card, o `stopPropagation` do backdrop e o botão
de fechar — tudo isso vem do primitivo.

Formulários usam `Field` + `inputClassName`; ações usam `Button`/`IconButton`; estados vazios
usam `EmptyState`; selos usam `Badge`.

## 3. `app/dashboard/tv/page.tsx` — Modo TV

Preservar: `useLiveSessions` com poll de 8 s, `excludeSelf` por `getDeviceId()`,
`DeviceNameEditor` gravando com `setDeviceName`, `joinHref`, o `DELETE /api/relay/vod` para
encerrar transmissão de outro aparelho, e o `useNavigationOverride` do diálogo.

Preservar em especial a **confirmação em dois passos dentro do mesmo diálogo**
(`:102-188`): o comentário no código explica que abrir um segundo modal complicaria a pilha
de handlers de Back. Mantenha um único `Modal` alternando entre os estados "ações" e
"confirmar encerramento".

Mudanças:
- Cabeçalho: `SectionHeader` "Modo TV" com descrição curta, e o editor de nome do aparelho
  como um `Field` inline à direita.
- Grade de sessões: `CardGrid base={1} sm={2} lg={3} gap={4}`. Cada card
  `bg-surface-2 border border-line rounded-xl overflow-hidden`, `data-focusable="true"`:
  miniatura em `.ratio .ratio-wide` (substitui o `pt-[56.25%]` manual — o comentário em
  `:70-74` sobre `aspect-video` dentro de flex continua válido, e `.ratio` é exatamente a
  solução que ele descreve), `Badge tone="live" dot` **AO VIVO** sobreposto no canto,
  título, nome do aparelho e há quanto tempo começou (em `.tnum`).
- Vazio: `EmptyState` com `Radio`, "Nenhuma transmissão ativa", e um `Button variant="ghost"`
  explicando que ligar "Transmitir" em qualquer aparelho faz a sessão aparecer aqui.
- Diálogo de ações: `Modal` com `Button primary` **Assistir**, `Button danger`
  **Encerrar transmissão** e `Button ghost` **Cancelar**, empilhados em coluna
  (`space-y-3`) — a navegação por D-pad só precisa de cima/baixo, como o código atual já
  decidiu.

## 4. `app/dashboard/devices/page.tsx` — Aparelhos

Preservar toda a lógica: leitura de `?code=` do QR com normalização e o aviso "Código
preenchido pela TV", `POST /api/devices/pair/approve` com nome e perfil, `GET /api/devices`,
`PATCH` para renomear, `DELETE` para revogar, `DELETE /api/devices/session` para desconectar
a própria TV, e `attemptCloseTvApp` com as chamadas a `webOS.platformBack`/
`tizen.application.exit`/`window.close`.

Mudanças:
- Três seções com `SectionHeader`, separadas por `border-t border-line`:
  1. **Esta TV** (só quando `currentDeviceId` existe): card `bg-surface-2` com
     `Badge tone="warn"` e `Button danger` **Desconectar e trocar servidor**.
  2. **Parear aparelho**: `Field` código (`uppercase tracking-[0.3em] text-center .tnum`),
     `Field` nome, `Field` perfil (`select`), `Button primary` **Aprovar**. Empilhados no
     mobile, em linha a partir de `md:` com `space-x-3`.
  3. **Aparelhos pareados**: `<ul>` de linhas `bg-surface border border-line rounded-xl p-4`.
     Cada linha: ícone da plataforma, nome (ou `Field` inline em edição), metadados em
     `text-sm text-ink-2` (plataforma, perfil, último acesso em `.tnum`), e à direita dois
     `IconButton` — `Pencil` `label="Renomear aparelho"` e `Trash2`
     `label="Revogar aparelho"`. Ambos `data-focusable`.
- Mensagens de sucesso/erro em `Badge`/texto `text-ok`/`text-brand`, não em cores soltas.
- Estado "Aparelho desconectado" com a instrução manual: `EmptyState`.
- Lista vazia: `EmptyState` explicando que a TV mostra um código ao abrir o app.

## 5. Modais

### `LimitReachedModal.tsx` — **corrige D1**
`Modal size="md"`, título "Limite de conexões atingido". Lista de sessões ativas em
`max-h-72 overflow-y-auto`, **cada item um `<button>` com `data-focusable="true"`** que
navega para o `joinHref`. Rodapé: `Button ghost` **Fechar** e `Button primary`
**Abrir Modo TV**. Verifique com `grep -c 'data-focusable' components/LimitReachedModal.tsx`
que o resultado é maior que zero.

### `BroadcastStartModal.tsx`
`Modal size="sm"`, título "De onde começar a transmitir". Preservar: as opções "Do início" e
"De onde parei" (esta só quando há progresso), o ajuste fino em passos de ±1 e ±5 min, o
display em `.tnum`, e o texto explicando que o ponto de início é fixado na criação e que quem
entra depois pega o ponto atual. Preservar também a semântica de **montar/desmontar** o
componente para descartar a escolha anterior — não o transforme num modal controlado que
permanece montado.
Opções como `Button` de largura total; a opção escolhida ganha `border-line-strong`.

### `ProfileModal.tsx`
`Modal size="sm"`, título "Quem está assistindo?". Lista de perfis: avatar
`bg-surface-3 rounded-lg` com a inicial (sem gradiente vermelho), nome, `Badge` "Ativo" no
atual, `IconButton` `Pencil` e — **só quando `profiles.length > 1`** — `IconButton` `Trash2`.
Rodapé: `Field` "Novo perfil" + `Button` **Criar**. Trocar de perfil **não fecha o modal**
(comportamento atual). Erros em `text-brand text-sm`.
Substituir o `window.confirm` da exclusão por um estado de confirmação inline no próprio
modal (`window.confirm` não é focável por D-pad em webOS e trava a TV do mesmo jeito que D1).

### `ProfileSelector.tsx`
Tela cheia `fixed inset-0 z-[100] bg-bg` — **não** usa `Modal` (é um gate, não um diálogo).
Título "Quem está assistindo?" em `text-2xl md:text-4xl`. Avatares grandes
(`w-24 h-24 md:w-32 md:h-32`, `rounded-xl bg-surface-2`) com a inicial, nome abaixo em
`text-sm md:text-base`, todos `data-focusable`, com `.focus-card` no botão e `.focus-card-target` na caixa do avatar. Layout `flex flex-wrap`
com margens nos filhos (**nunca** `gap`) — o hack de margem negativa atual está correto,
mantenha o padrão. Criação de perfil: `Field` + `Button`, preservando que o perfil novo
**não** é selecionado automaticamente.

### `RemoteAccessGate.tsx`
Tela cheia `bg-bg`, card central `max-w-sm bg-surface-2 border border-line rounded-xl p-8`.
Remover o gradiente radial de fundo. `Field` de PIN (`type="password"`,
`inputMode="numeric"`, `.tnum text-center tracking-[0.4em]`), mais o campo de confirmação no
modo `setup`. `Button primary fullWidth`. Erros em `text-brand text-sm`.

### `SyncButton.tsx`
Pílula `rounded-full h-10 px-4 bg-surface-2 border border-line-strong text-ink`,
`data-focusable`, ícone `RefreshCw`. Perde o âmbar — não é estado de sistema, é uma ação.

### `SubtitleSearchPanel.tsx`
`Modal size="lg"`, título "Legendas". Preservar busca, seleção de idioma, download
(`handleDownload`), a exibição de cota e o contexto de episódio que hoje trafega por
`window` (`series/page.tsx:940,976-990`) — **não** refatore esse mecanismo nesta spec, ele
pertence à tela de série. Lista de resultados: linhas `bg-surface border border-line`,
cada uma um `<button data-focusable="true">` com nome do arquivo, idioma e downloads em
`.tnum`.

## 6. `app/page.tsx` — Entrada

Tela de login. Preservar `handleSubmit` → `login()` do `AuthContext` e o tratamento de erro.
Layout: coluna centrada `max-w-sm`, marca "Xstream" acima (o "X" em `text-brand`),
três `Field` (URL do servidor, usuário, senha) com `inputClassName` e `data-focusable`,
`Button primary size="lg" fullWidth` **Entrar** com `loading` durante a requisição.
Fundo `bg-bg` sólido, sem gradiente. Erro em `text-brand text-sm` acima do botão.

## 7. Aceite

1. `npx tsc --noEmit` e `npm run lint` limpos nestes arquivos.
2. `grep -rn "grid-cols\|gap-\|aspect-ratio\|clamp(\|focus:ring\|focus:outline\|focus-within\|sticky\|window.confirm\|z-50\|text-\[10px\]" app/dashboard/tv app/dashboard/devices app/page.tsx components/BroadcastStartModal.tsx components/LimitReachedModal.tsx components/ProfileModal.tsx components/ProfileSelector.tsx components/RemoteAccessGate.tsx components/SyncButton.tsx components/SubtitleSearchPanel.tsx` → vazio.
3. `grep -rn "pt-\[56.25%\]" app/dashboard/tv` → vazio (substituído por `.ratio-wide`).
4. Todo `<button>`, `<a>`, `<input>` e `<select>` desses arquivos tem `data-focusable="true"`.
5. Funções 75, 78–96, 99–103 do inventário preservadas.
6. D1 e D11 corrigidos.
