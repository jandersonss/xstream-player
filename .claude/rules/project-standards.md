# Padrão de projeto — Xstream Player

Convenções a seguir em novas implementações. Derivadas do código existente — ao criar algo novo, espelhe o arquivo vizinho da mesma camada.

## Fluxo de dados (regra central)

O cliente **nunca** acessa o provedor Xtream, o SQLite ou o `fs` diretamente. Sempre passa por uma API route:

```
UI (app/dashboard, components)
  → facade client-side (ex.: app/lib/db.ts, fetch para /api/...)
    → API route (app/api/.../route.ts)
      → lib server-only (app/lib/*.ts com import 'server-only')
        → data/ (SQLite ou JSON)
```

Ao adicionar uma capacidade: crie/estenda a lib server-only, exponha via API route, e consuma no cliente por um facade/hook/context. Não pule camadas.

## API Routes (`app/api/**/route.ts`)

- Primeira linha do handler: guard de acesso — `const r = await enforceRemoteAccessForApi(request); if (r) return r;`
- Declare `export const runtime = 'nodejs'` (sempre que usar `fs`/ffmpeg/better-sqlite3) e `export const dynamic = 'force-dynamic'` quando a resposta não pode ser cacheada.
- Tipe o corpo com uma `interface ...RequestBody` (não use `any`).
- Envolva a lógica em `try/catch`. Erros: `console.error('[Tag] ...', error)` e `NextResponse.json({ error: 'mensagem' }, { status: 4xx|500 })`.
- Sucesso: `NextResponse.json({ success: true })` para escrita, `{ data }` para leitura.
- Rotas multi-operação usam `switch (body.action)` com um `type Action = 'a' | 'b' | ...` e `default` → status 400.
- Leitura de JSON em `data/`: trate `ENOENT` retornando vazio (`[]`/`{}`); antes de escrever, `fs.mkdir(dir, { recursive: true })`.
- Caminhos sempre via `path.join(process.cwd(), 'data', ...)`.

## Libs server-only (`app/lib/`)

- Comece com `import 'server-only';`.
- Só `sqliteCache.ts` abre o banco — o resto importa dele (`import * as sqlite from './sqliteCache'`).
- Tipos compartilhados ficam em `dbTypes.ts`; reexporte-os do facade quando útil.

## Contexts (`app/context/*Context.tsx`)

- `'use client'` no topo. `createContext<State | undefined>(undefined)`.
- Exporte o `Provider` e um hook `useX()` que faz `useContext` e **lança erro** se usado fora do provider.
- Estado do backend: carregue no `useEffect` de mount (fetch `/api/...`), com flag `isLoaded` e `useRef` para evitar POST redundante logo após o GET inicial. Fallback para `localStorage` quando o backend falhar.

## Hooks (`app/hooks/use*.ts`)

- `'use client'`, JSDoc em pt-BR explicando o quê/quando. Envolva funções retornadas em `useCallback` com deps corretas.
- Parsing defensivo (`parseInt(x ?? '0', 10)`, `Number.isFinite`, `try/catch` retornando fallback seguro).

## Componentes (`components/`, `app/dashboard/`)

- `'use client'` quando houver estado/efeitos/eventos. `export default function`.
- Estilização só com Tailwind (sem CSS-in-JS); ícones de `lucide-react`.
- Navegação por controle remoto de TV: elementos focáveis recebem `data-focusable="true"`.
- Textos visíveis ao usuário em **pt-BR**.

## Estilo geral

- Indentação de **4 espaços**; `strict: true` — evite `any` (prefira tipos/`unknown` + narrowing).
- Import de módulos internos via alias `@/...`.
- **Código e comentários sempre em inglês** (comentário explica o *porquê*, não o *o quê*).
- **Textos visíveis na interface passam por i18n**, nunca literais no JSX/TSX. Client: `const t = useT()` (de `@/app/context/I18nContext`) e `t('namespace.key', { var })`. API route: `translateForRequest(request, 'serverErrors.key')` (de `@/app/lib/i18n`). Adicione a chave em **`app/lib/i18n/translations/pt-BR.json` e `en.json`** (pt-BR é a fonte da verdade). Idiomas novos = 1 JSON + 1 linha em `LOCALES`. **pt-BR** é o `DEFAULT_LOCALE` (fallback de chave ausente e de escolha salva inválida). Primeira visita sem cookie: `layout.tsx` detecta pelo `Accept-Language`; sem match → **en** (`AUTODETECT_FALLBACK_LOCALE`).
- **Mensagens de commit em inglês**, no imperativo (ex.: `feat: add batch subtitle download`). **PRs e release notes em pt-BR.**
- Nada de credenciais/segredos no código — vivem em `data/config.json`.

## Antes de commitar

Rode `/build-check` (lint + `npm run build` completo).
