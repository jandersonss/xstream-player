# Redesign — Shell de navegação e Ajustes (spec 02)

Depende de: `00-design-system.md`, `00b-api-primitivos.md`.

**Arquivos que esta spec possui** (nenhuma outra spec os edita):
`app/dashboard/layout.tsx` · `components/NavRail.tsx` (novo) · `components/BottomNav.tsx` ·
`app/dashboard/settings/page.tsx` (novo) · `components/settings/*` (novo) ·
`components/Sidebar.tsx` (excluir) · `components/TMDbSettingsModal.tsx` (excluir) ·
`components/SubtitleSettingsModal.tsx` (excluir)

---

## 1. Problema

A sidebar atual (`components/Sidebar.tsx`) é uma coluna de 288 px que mistura navegação de
conteúdo com quatro controles administrativos: chip de perfil, toggle "Transmitir sempre" com
subtítulo em `text-[10px]`, botão de sync com data do último catálogo e "Sair". Some a
isso as três pílulas do cabeçalho da home (TMDb, Legendas, dados da conta) e não existe
nenhum lugar coerente para "configurar o app" — a configuração está espalhada por dois
componentes e dois modais.

## 2. `components/NavRail.tsx` (substitui `Sidebar.tsx`)

Trilho vertical, visível em `md:` para cima. **Só navegação.**

- Largura `w-[76px]`; expande para `w-[248px]` quando qualquer item interno recebe foco.
  `:focus-within` não existe no Chromium 53 → usar estado React: `onFocus`/`onBlur` no
  `<aside>` (em React esses handlers propagam, equivalendo a `focusin`/`focusout`). No
  `onBlur`, checar `e.relatedTarget` e só recolher se o novo alvo estiver fora do `<aside>`
  (`!e.currentTarget.contains(e.relatedTarget as Node)`) — sem isso ele pisca a cada passo
  do D-pad. Transição de largura em 200 ms.
- Sem `position: sticky`. O `<aside>` é filho de um flex de altura total, como hoje.
- Estrutura, de cima para baixo:

  1. **Marca** — "X" em `text-brand` + "stream" em `text-ink`. Não é focável.
  2. **Perfil** — botão com avatar (inicial em bloco `bg-surface-2`, sem gradiente vermelho)
     e o nome do perfil quando expandido. Abre `ProfileModal`.
  3. **Conteúdo** — Início (`/dashboard`), Buscar (`/dashboard/search`),
     Minha lista (`/dashboard/favorites`), Ao vivo (`/dashboard/live`),
     Filmes (`/dashboard/movies`), Séries (`/dashboard/series`).
  4. Divisória `border-t border-line`.
  5. **Sistema** — Modo TV (`/dashboard/tv`), Aparelhos (`/dashboard/devices`),
     Ajustes (`/dashboard/settings`).

- Item ativo: fundo `bg-surface-2`, texto `text-ink`, e uma barra de 3 px `bg-ink` na borda
  esquerda. **Não usar vermelho** — vermelho agora é só marca e "no ar".
  `/dashboard` casa apenas por igualdade exata; os demais por `startsWith`.
- Cada item: `data-focusable="true"`, `tabIndex={0}`, ícone `size={22}`, rótulo `text-sm`
  visível só quando expandido. Espaçamento vertical com `space-y-1` (**nunca** `gap`).
- **Indicador de sync**: enquanto `isSyncing` (de `useData()`), uma barra fina de 2 px no
  rodapé do trilho com largura `${syncProgress}%` em `bg-ink-2`. É indicador, não botão —
  a ação de sincronizar vive em Ajustes.

O toggle "Transmitir sempre", o botão de sync e "Sair" **saem daqui** e vão para Ajustes.

## 3. `components/BottomNav.tsx`

Mobile (`md:hidden`), `fixed bottom-0`, altura `h-16`, 5 abas:

Início · Buscar · Minha lista · Modo TV · Ajustes

- Rótulos em `text-xs` (o `text-[10px]` atual está banido — defeito D12).
- Ativo: ícone e rótulo em `text-ink`, com uma barra de 2 px `bg-ink` no topo da aba.
  Inativo: `text-ink-3`.
- O botão de sync **sai** (vai para Ajustes). O percentual em `text-[8px]` desaparece com ele.
- Categorias (Ao vivo / Filmes / Séries) continuam alcançáveis no mobile pela faixa de
  atalhos no topo da Início (spec 03) — nenhuma navegação se perde.

## 4. `app/dashboard/layout.tsx`

Mantém o guard de autenticação como está (`useAuth`, redirect para `/`, `Loader` enquanto
carrega). Muda só a moldura:

```tsx
<div className="flex flex-col md:flex-row h-screen bg-bg overflow-hidden">
    <NavRail />
    <main className="flex-1 overflow-y-auto h-full pb-16 md:pb-0">
        <div className="max-w-[1800px] mx-auto min-h-full">{children}</div>
    </main>
    <BottomNav />
</div>
```

`max-w` sobe de 1600 para 1800: com o trilho recolhido sobra largura, e a 3 m linhas mais
largas mostram mais itens por tela sem aumentar a densidade percebida.

## 5. `app/dashboard/settings/page.tsx` — Ajustes

Página nova. Recebe tudo que sai da home e do trilho. **Nada é perdido.** Layout: coluna
única, `px-6 md:px-10 lg:px-14 py-8`, `max-w-3xl`, seções separadas por
`border-t border-line`, cada uma com `SectionHeader`.

Quebre em `components/settings/<Nome>Section.tsx` — uma seção por arquivo, todas
`'use client'`.

### 5.1 Conta — `AccountSection.tsx`
Origem: `app/dashboard/page.tsx:314-338` + `useAccountStatus` + `AuthContext`.
Lista de pares rótulo/valor (`text-ink-2` / `text-ink`, valores numéricos com `.tnum`):
usuário, validade (`exp_date`, formatada; "Ilimitado" quando vazio), status da conta
(`Badge` `ok` quando `user?.status === 'Active'`), conexões ativas/máximas
(`${activeConnections}/${maxConnections}`), URL do servidor (`truncate`), fuso horário.
Ao final, `Button variant="danger"` **Sair** → `logout()` do `AuthContext`.

### 5.2 Catálogo — `CatalogSection.tsx`
Origem: `Sidebar.tsx:116-134`.
Texto com a data do último sync (`lastSync`), `Button` **Atualizar catálogo** → `syncData()`,
`loading={isSyncing}`. Durante o sync, barra de progresso com `syncProgress` e o percentual
em `.tnum`. Botão desabilitado enquanto sincroniza.

### 5.3 Perfis — `ProfilesSection.tsx`
Origem: `ProfileModal.tsx` (a lógica; o modal continua existindo para o trilho).
Lista de perfis com avatar, nome, `Badge` "Ativo" no atual. Ações por linha: renomear
(inline, `Field` + Enter/blur) e excluir (`IconButton`, **só quando `profiles.length > 1`**).
Rodapé: `Field` "Novo perfil" + `Button` **Criar**. Usa `useProfile()` —
`selectProfile`, `createProfile`, `renameProfile`, `deleteProfile`. Erros exibidos em
`text-brand text-sm` abaixo da lista.

### 5.4 Legendas — `SubtitlesSection.tsx`
Origem: `components/SubtitleSettingsModal.tsx` (**excluir o modal**; virar seção inline).
- Chave de API do OpenSubtitles: `Field` + `Button` Salvar; `Button variant="ghost"`
  Remover quando já configurada. `Badge` `ok` "Configurado" quando `isConfigured`.
- Idioma padrão das legendas: `select` gravado em `activeProfile.prefs.subtitleLanguage`
  via `updatePrefs` do `ProfileContext`.
- Tamanho da fonte: controle `-`/valor/`+` gravando `prefs.subtitleFontSize` (mesmo
  intervalo e passo que o player usa hoje).
- Chamar `ensureConfigLoaded()` no mount da seção.

### 5.5 TMDb — `TmdbSection.tsx`
Origem: `components/TMDbSettingsModal.tsx` (**excluir o modal**; virar seção inline).
`Field` com a chave de API + `Button` Salvar + `Button variant="ghost"` Remover.
`Badge` `ok` "Configurado" quando `isConfigured`. Texto curto explicando o efeito
(carrosséis personalizados filtrados pelo catálogo) — mesma informação do card promocional
que sai da home, sem o card.

### 5.6 Modo TV — `TvModeSection.tsx`
Origem: `Sidebar.tsx:93-113`.
`Toggle` **Transmitir sempre** com descrição "Tudo que este aparelho abrir entra no Modo TV",
lendo/gravando `getAutoBroadcast()`/`setAutoBroadcast()` de `@/app/lib/device`. Inicialização
preguiçosa no `useState` (sem `setState` dentro de efeito), como hoje.
Abaixo, dois `Button variant="ghost"` que navegam para `/dashboard/tv` e `/dashboard/devices`.

### 5.7 Diagnóstico — `DiagnosticsSection.tsx`
`Button variant="ghost"` com link para `/debug` e a versão do app lida de `package.json`
via constante (não importe o JSON em client component; declare a string).

## 6. Migração obrigatória

- Excluir `components/Sidebar.tsx`, `components/TMDbSettingsModal.tsx` e
  `components/SubtitleSettingsModal.tsx`. Verificar com
  `grep -rn "Sidebar\|TMDbSettingsModal\|SubtitleSettingsModal" app components` que não
  sobrou import. **`app/dashboard/page.tsx` é da spec 03** — se ele ainda importar os
  modais quando você terminar, deixe registrado no relatório; não edite esse arquivo.
- `ProfileModal.tsx` **não** é desta spec (é da 06). Apenas importe e use.

## 7. Aceite

1. `npx tsc --noEmit` e `npm run lint` limpos para os arquivos desta spec.
2. `grep -rn "grid-cols\|gap-\|aspect-ratio\|clamp(\|focus:ring\|focus:outline\|focus-within\|sticky\|text-\[10px\]\|text-\[8px\]" app/dashboard/layout.tsx app/dashboard/settings components/NavRail.tsx components/BottomNav.tsx components/settings` → vazio.
3. Nenhum hex literal fora dos tokens.
4. Toda função das linhas 77, 91, 98, 99-102, 104-108 do inventário (`01-inventario.md`)
   existe em Ajustes.
5. D-pad alcança todo item do trilho e toda seção de Ajustes nas 4 direções.
