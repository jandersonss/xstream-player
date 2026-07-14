# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projeto

Xstream Player — web app (Next.js 16 App Router, React 19, TypeScript) para reproduzir IPTV via API Xtream Codes. Uso em rede privada apenas: não há autenticação robusta e as credenciais IPTV ficam salvas em texto puro em `data/config.json`.

Idioma: **código e comentários sempre em inglês**; **textos de UI em pt-BR**; **mensagens de commit em inglês** (imperativo); **PRs e release notes em pt-BR**.

**Padrão de projeto para novas implementações:** siga `.claude/rules/project-standards.md` (carregado automaticamente).

## Comandos

- `npm run dev` — servidor de desenvolvimento (http://localhost:3000).
- `npm run build` — roda `build:legacy` **e depois** `next build`. Sempre use este, não `next build` direto.
- `npm run build:legacy` — bundla `legacy/src/` com esbuild → babel (target IE11) para `public/legacy/app.js`, via artefato temporário `.legacy-tmp/`.
- `npm run lint` — ESLint (`eslint-config-next` + typescript).

Não há suíte de testes configurada.

## Arquitetura

- **`app/`** — App Router. `app/dashboard/` = UI (rotas de live/movies/series/watch/search/favorites/tv). `app/api/` = backend (todas as chamadas ao provedor Xtream, SQLite, TMDB e OpenSubtitles passam por API routes — o cliente nunca acessa o provedor direto).
- **`app/lib/`** — lógica server-side. `sqliteCache.ts` e `userStore.ts` (better-sqlite3 — cada um é o **único dono do seu banco**; ninguém mais abre DB), `xtreamSync.ts` (sincroniza catálogo do provedor), `db.ts` (client-side; chama `/api/library`), `liveShare.ts`/`vodBroadcast.ts` (Modo TV), `tmdb.ts`, `remoteAccess.ts`. Módulos server usam `import 'server-only'`.
- **`components/`** — componentes React compartilhados (VideoPlayer, carousels, modais, navegação TV).
- **`legacy/`** — app IE11/WebOS antigo, buildado separadamente. `middleware.ts` redireciona WebOS com Chrome < 72 para `/legacy/index.html`. Excluído do tsconfig e do ESLint.

## Persistência (`data/`)

Tudo em `data/` é **gitignored** (só `data/.keep` versionado) e persiste entre execuções. São **dois bancos com ciclos de vida opostos** — não misture:
- `xstream-player.sqlite` — **cache descartável** de catálogo/streams. Apagar para forçar re-sync é operação normal. Aberto só por `app/lib/sqliteCache.ts`.
- `user-data.sqlite` — **dado do usuário, insubstituível**: perfis, favoritos e progresso (`profiles`, `favorites`, `watch_progress`). Aberto só por `app/lib/userStore.ts`. É o arquivo que importa no backup.
- Ambos em modo WAL (+ `-shm`/`-wal`), sob `process.cwd()/data`.
- JSONs de estado restantes: `config.json` (credenciais Xtream), `live-sessions.json`/`live-sync.json` (Modo TV, funciona multi-instância se a pasta for compartilhada), configs de TMDB/OpenSubtitles.
- Legendas em `subtitles/<idioma>/subtitle-<streamId>.json` — cache compartilhado por todos os perfis, chaveado por idioma (o perfil só decide **qual** idioma pedir).

**Perfis:** o perfil ativo viaja no cookie `xstream_profile`; as rotas resolvem por ele (`resolveProfileId(request)`), então o cliente nunca passa `profileId` à mão. Favoritos e progresso são sempre escopados por perfil.

## Gotchas

- **Modo TV** (compartilhamento de conexão): relaya um único stream upstream para vários dispositivos. VOD (filmes/séries) é convertido em stream ao vivo com **ffmpeg** — dependência opcional só para esse recurso; já incluída na imagem Docker.
- **Licença**: o projeto é AGPL-3.0 (ver `LICENSE`); contribuições exigem o CLA (`CLA.md`), que preserva o direito do autor de relicenciar. Ponto de atenção para uma eventual versão comercial fechada: o **ffmpeg embutido na imagem Docker é GPL/LGPL** — ele roda como binário externo (não linkado), então não contamina este código, mas redistribuir a imagem redistribui o ffmpeg junto e obriga a cumprir a GPL sobre ele. Sem impacto enquanto a distribuição for AGPL. Detalhes na seção de licença do README.
- `next.config.ts` usa `output: "standalone"` (Docker) e permite imagens remotas de qualquer host.
- TypeScript `strict: true`; alias `@/*` → raiz do projeto. Indentação de **4 espaços** nos módulos de `app/lib` e API routes.
- Rotas de API que usam APIs de Node (ffmpeg, `fs`) precisam de `export const runtime = 'nodejs'`.
- Ao editar `legacy/`, lembre que roda em IE11 — sem sintaxe/APIs modernas não polyfilladas.
- Docker roda como uid 1001; em Linux o volume `data/` pode dar `EACCES` (corrija com `chmod -R 777 data/` ou `chown -R 1001:1001 data/`).
- `better-sqlite3` é módulo nativo (precisa de `python3/make/g++` para buildar).
