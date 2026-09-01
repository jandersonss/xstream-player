# TV Client — contrato de implementação

Documento de referência para a versão "client de TV" (webOS empacotado, replicável para Tizen).
Define as fronteiras entre as partes para que possam ser implementadas em paralelo.
**Este arquivo é o contrato: quem implementa um lado não muda o outro lado sem atualizar aqui.**

## Visão geral

```
Servidor (Docker, já existe)             Client empacotado (.ipk / .wgt)
  Next standalone + /api/*        <───   bootstrap em JS puro (tv/bootstrap/)
  SQLite: catálogo / user / tv-mode        1. Setup: IP/host do servidor
  ffmpeg / relay / Modo TV                 2. Pareamento: código na tela
  UI "Dispositivos" (aprovar código)       3. redireciona para o servidor
  /api/devices/session (token → sessão)  ──> app real roda same-origin
```

### Por que o pacote não contém a UI

A primeira versão deste contrato empacotava o próprio app como export estático do Next.
**Isso não funciona no webOS**: o app empacotado carrega de `file://`, onde (a) os caminhos
absolutos que o Next gera para `_next/*` resolvem contra a raiz do sistema de arquivos da TV,
e (b) `history.pushState` entre diretórios é recusado pelo Chromium, quebrando o App Router.

Então o `.ipk`/`.wgt` contém só um bootstrap de ~500 linhas em JS puro (ES5, roda até no
webOS 5): ele descobre o servidor, pareia o aparelho e **entrega a navegação ao servidor**.
A partir daí o app roda na origem do servidor, exatamente como roda num navegador — o que
significa que o client de TV tem **todas as features do app web por construção**, não por
porte. É também o que torna o client replicável para Tizen/Android TV: só o manifesto muda.

Consequências:

- O bootstrap fala com o servidor **cross-origin** (só `/api/remote-access` e
  `/api/devices/pair/*`), então essas rotas precisam de CORS. O resto do app, depois do
  redirect, é same-origin e não precisa.
- O token de dispositivo é trocado por uma **sessão de cookie** em `/api/devices/session`,
  no momento do redirect. O Bearer continua sendo o mecanismo de autenticação de aparelho.
- `app/lib/apiClient.ts` continua valendo: mantém o app agnóstico de host e carrega
  `Authorization`/`X-Xstream-Profile` quando existirem. No app web, base URL vazia = igual a hoje.

## 1. Autenticação de dispositivo (server-side)

### Armazenamento

Banco novo `data/devices.sqlite`, dono único `app/lib/deviceStore.ts` (mesma regra dos outros
três bancos: ninguém mais abre esse arquivo). Modo WAL, sob `process.cwd()/data`.

```sql
CREATE TABLE devices (
    id            TEXT PRIMARY KEY,   -- uuid
    name          TEXT NOT NULL,      -- nome amigável, editável no servidor
    platform      TEXT NOT NULL,      -- 'webos' | 'tizen' | 'androidtv' | 'browser' | 'unknown'
    token_hash    TEXT NOT NULL,      -- scrypt do token (nunca o token em claro)
    profile_id    TEXT,               -- perfil padrão do aparelho (NULL = primeiro perfil)
    created_at    INTEGER NOT NULL,
    last_seen_at  INTEGER NOT NULL,
    revoked_at    INTEGER             -- NULL = ativo
);

CREATE TABLE pairing_codes (
    code          TEXT PRIMARY KEY,   -- 6 chars, alfabeto sem ambíguos: ABCDEFGHJKLMNPQRSTUVWXYZ23456789
    pairing_id    TEXT NOT NULL UNIQUE,
    device_name   TEXT NOT NULL,      -- sugerido pela TV
    platform      TEXT NOT NULL,
    expires_at    INTEGER NOT NULL,   -- criação + 5 min
    approved_device_id TEXT,          -- preenchido na aprovação
    approved_token TEXT               -- token em claro, entregue UMA vez no poll e apagado
);
```

`pairing_codes` é estado efêmero: linhas expiradas são varridas na leitura.

### Rotas

Todas em `app/api/devices/`, `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`.

| Rota | Método | Auth | Corpo / Resposta |
|---|---|---|---|
| `/api/devices/pair/start` | POST | pública¹ | req `{ deviceName, platform }` → `{ code, pairingId, expiresAt }` |
| `/api/devices/pair/poll` | POST | pública¹ | req `{ pairingId }` → `{ status: 'pending' \| 'approved' \| 'expired', token?, deviceId?, profileId? }` |
| `/api/devices/pair/approve` | POST | servidor² | req `{ code, name?, profileId? }` → `{ success: true, device }` |
| `/api/devices` | GET | servidor² | `{ data: Device[] }` (sem `token_hash`) |
| `/api/devices` | PATCH | servidor² | req `{ id, name?, profileId? }` → `{ success: true }` |
| `/api/devices` | DELETE | servidor² | req `{ id }` → revoga (`revoked_at`), `{ success: true }` |
| `/api/devices/session` | GET | token na query³ | `?token=` → 302 para `/dashboard` com cookies de sessão; token inválido → 302 para `/?deviceAuth=invalid` |

¹ "pública" = passa pelo guard de acesso remoto existente, mas não exige token de device
(é justamente o fluxo para obter um). Protegida por: código de 6 chars, expiração de 5 min,
uso único, e rate limit por IP (máx. 10 `start` por minuto).

² "servidor" = requisição autenticada como o dono (cookie de acesso remoto / LAN), **nunca**
por Bearer de device. Um aparelho pareado não pode aprovar outro.

³ Quem chama `/api/devices/session` é a TV **navegando** (o bootstrap do `.ipk` redireciona
para lá depois do pareamento), não um `fetch` — por isso o token vai na query e as respostas
são redirects. Token válido → seta o cookie de acesso remoto (assinado com o hash do PIN, só
quando há PIN configurado; validade `REMOTE_ACCESS_SESSION_SECONDS`, renovada reentrando por
essa rota após um 401) e o cookie `xstream_profile` do aparelho (**não** `httpOnly`: o
`ProfileContext` lê e reescreve esse cookie no cliente). A rota nunca loga a URL (carrega o
token) e responde `Cache-Control: no-store`.

O token em claro (`approved_token`) é entregue **uma única vez** no poll que retorna
`approved`, e apagado da tabela na mesma transação.

**Formato do token (ajuste na implementação):** `<deviceId>.<32 bytes aleatórios em base64url>`.
O id do aparelho viaja em claro de propósito — não é segredo, e transforma a validação em
*uma* busca indexada + *um* scrypt, em vez de um scrypt por aparelho cadastrado. Pelo mesmo
motivo (scrypt custa ~60ms e a TV bate na API o tempo todo), `deviceStore` mantém um cache
em memória de tokens já verificados, chaveado por SHA-256 do token (nunca o token em claro)
e com TTL de 5 min; revogar um aparelho limpa as entradas dele na hora.

### Guard unificado

`app/lib/remoteAccess.ts` ganha um irmão em `app/lib/apiAuth.ts`:

```ts
export async function enforceApiAccess(request: Request): Promise<NextResponse | null>
```

Ordem de avaliação:
1. `Authorization: Bearer <token>` presente e válido em `devices` (não revogado)
   → autoriza, atualiza `last_seen_at`, e o perfil vem do device.
2. Senão, cai no comportamento atual de `enforceRemoteAccessForApi`.

`enforceRemoteAccessForApi` continua existindo e não muda de assinatura; as rotas migram para
`enforceApiAccess`.

`resolveProfileId(request)` em `app/lib/userStore.ts` passa a resolver nesta ordem:
1. header `X-Xstream-Profile` (se apontar para um perfil existente),
2. **perfil padrão do device autenticado por Bearer** (só quando não veio header — assim a TV
   pareada cai no perfil certo sem mandar nada; requisição do app web não tem Bearer, então
   nada muda),
3. cookie `xstream_profile` (comportamento atual),
4. primeiro perfil.

As rotas "servidor" (`approve`, `/api/devices` GET/PATCH/DELETE) continuam no
`enforceRemoteAccessForApi` e **recusam com 403** se a requisição trouxer Bearer de device.

### CORS

Helper `app/lib/cors.ts`: `withCors(response, request)` + `corsPreflight(request)`.
Ecoa o `Origin` da requisição (incluindo a string `null`), `Access-Control-Allow-Headers:
Content-Type, Authorization, X-Xstream-Profile`, `Access-Control-Allow-Methods: GET, POST,
PATCH, DELETE, OPTIONS`, `Vary: Origin`. **Sem** `Allow-Credentials` (não usamos cookie
cross-origin).

**Ajuste na implementação:** em vez de cada rota exportar `OPTIONS` e embrulhar cada resposta,
quem aplica os helpers é o `middleware.ts`, que passou a casar `/api` (antes era excluído do
matcher): preflight respondido ali, e `withCors` nas demais respostas. Motivo: header
`Access-Control-Allow-Origin` duplicado (middleware + rota) quebra o CORS no browser, então
o dono tem que ser um só; e centralizado vale também para as respostas em streaming do relay
(`<video>` cross-origin) e não pode ser esquecido por uma rota nova.

## 2. Client — camada de acesso (`app/lib/apiClient.ts`)

Único ponto que sabe onde o servidor está e como se autenticar.

```ts
/** Base URL do servidor. '' no app web (same-origin), 'http://192.168.0.10:3000' na TV. */
export function getServerBaseUrl(): string;
export function setServerBaseUrl(url: string): void;

/** Token do dispositivo, obtido no pareamento. */
export function getDeviceToken(): string | null;
export function setDeviceToken(token: string | null): void;

/** Substitui todo `fetch('/api/...')`. Injeta base URL, Bearer e X-Xstream-Profile. */
export function apiFetch(path: string, init?: RequestInit): Promise<Response>;

/** Para src de <video>/<img> que não passa por fetch. */
export function apiUrl(path: string): string;
```

- Persistência em `localStorage`: `xstream_server_url`, `xstream_device_token`.
- No app web (build normal), `getServerBaseUrl()` retorna `''` → tudo segue same-origin e o
  comportamento atual não muda. **A migração dos 44 call sites não pode alterar o app web.**
- `apiFetch` trata `401` limpando o token e emitindo um evento
  (`window.dispatchEvent(new Event('xstream:unauthorized'))`) para a UI voltar ao pareamento.

### Notas de implementação (Fase 1)

- **Origem do `X-Xstream-Profile`:** `apiFetch` lê o perfil ativo do cookie `xstream_profile`
  e, quando o cookie não existe (origem `file://`), de um espelho em `localStorage` com a
  mesma chave — `ProfileContext.writeProfileCookie` grava nos dois. O header só é enviado
  quando há perfil conhecido, então no app web o resultado é idêntico ao de hoje.
- **`401`:** a limpeza do token + evento só acontece quando havia token de dispositivo na
  requisição. No app web o `401` continua vindo do gate de acesso remoto e mantém o
  tratamento atual (`RemoteAccessGate`).
- **Cookies cross-origin:** com base URL configurada, `apiFetch` usa `credentials: 'omit'`
  (o servidor responde CORS sem `Allow-Credentials`). Com base URL vazia nada é definido,
  então vale o default `same-origin` do `fetch`.
- **hls.js:** `components/VideoPlayer.tsx` injeta o Bearer via `xhrSetup` quando a URL do
  segmento aponta para a base URL configurada. O caminho de reprodução nativo
  (`video.src = ...`, usado em VOD sem hls.js) **não** consegue mandar header — o relay
  precisará aceitar token por query param para esses casos (pendência do lado servidor).

## 3. Rotas por query param

`output: 'export'` não gera dynamic segments sem params conhecidos. As rotas abaixo passam a
aceitar **também** query param, mantendo as atuais funcionando no app web:

| Hoje | Client de TV |
|---|---|
| `/dashboard/live/[categoryId]` | `/dashboard/live/category?id=` |
| `/dashboard/movies/[categoryId]` | `/dashboard/movies/category?id=` |
| `/dashboard/series/[categoryId]` | `/dashboard/series/category?id=` |
| `/dashboard/watch/live/[streamId]` | `/dashboard/watch/live?id=` |
| `/dashboard/watch/movie/[streamId]` | `/dashboard/watch/movie?id=` |
| `/dashboard/watch/series/[seriesId]` | `/dashboard/watch/series?id=` |

Implementação: a lógica da página vai para um componente compartilhado que recebe o id por
prop; a rota dynamic e a rota query param são dois wrappers finos. Toda navegação interna
(`Link`, `router.push`) passa a usar a forma query param, que funciona nos dois builds.

> **Status: cancelado.** O `.ipk` deixou de embarcar a UI (export estático em `file://`
> quebra os caminhos de `_next/` e o `history.pushState` entre diretórios): o pacote virou
> um bootstrap que pareia o aparelho e redireciona a TV para o servidor, onde o app roda
> same-origin. Sem export estático as dynamic routes seguem funcionando, então a conversão
> não é mais necessária e as rotas continuam como estão.

## 4. O bootstrap (`tv/bootstrap/`)

O conteúdo do pacote. Três arquivos, sem dependências, **ES5 puro** (roda no Chromium 68 do
webOS 5, não só no 79 do webOS 6), usando `XMLHttpRequest` em vez de `fetch` pelo mesmo motivo.

| Arquivo | Papel |
|---|---|
| `index.html` | as quatro telas (loading, setup, pareamento, erro), todas no mesmo documento |
| `style.css` | estilo de 10-foot UI; flexbox com margens, sem `gap`, nada menor que 22px |
| `app.js` | o fluxo inteiro |

Fluxo em `app.js`:

1. Sem `xstream_server_url` no `localStorage` → tela de **setup**. O campo aceita a forma
   mais curta possível (`192.168.0.10`) e `normalizeServerUrl` completa esquema e a porta
   padrão 3000. "Continuar" só avança depois de um GET bem-sucedido em `/api/remote-access`,
   que é a única rota que responde sem credencial nenhuma.
2. Sem `xstream_device_token` → **pareamento**: `POST /api/devices/pair/start` com o nome do
   aparelho (Luna no webOS, `tizen.systeminfo` no Tizen, rótulo genérico como fallback com
   timeout de 2s), exibe o código, e faz poll de 2 em 2 segundos com contagem regressiva.
3. Com os dois → `window.location.replace(servidor + '/api/devices/session?token=...')`.
   Daí em diante quem manda é o servidor.

Tecla Back (keyCode 461 no webOS/Tizen, 4 no Android TV): na tela de setup sai do app
(`webOS.platformBack()` / `tizen.application.exit()`); nas demais, volta um passo do fluxo.

Dentro do app (já no servidor) o mesmo botão é tratado por `app/lib/platform/keys.ts`
(`isBackKey`), consumido por `app/hooks/useTvNavigation.ts` — antes o app só reconhecia
`Backspace`/`Escape`, que **nenhum controle de TV emite**.

## 5. Empacotamento

- Assets gerados por `npm run tv:assets` (`scripts/gen-tv-assets.py`, Pillow) em `tv/assets/`:
  ícone 400×400 e splash 1920×1080. Gerador versionado para os binários não serem opacos.
- `npm run package:webos` → `scripts/package-tv.mjs webos` → `tv/dist/*.ipk` (precisa de
  `ares-package`, do `@webos-tools/cli`).
- `npm run package:tizen` → `.wgt` (precisa do Tizen Studio e de um perfil de assinatura).
- A versão do pacote vem do `package.json`, injetada em `appinfo.json`/`config.xml` na hora
  do empacotamento, para o client e o servidor nunca divergirem de versão.
- Android TV: o mesmo `tv/bootstrap/` dentro de um WebView; nada no código precisa mudar.

## 6. Compatibilidade

Alvo do client: **webOS 6 / Chromium 79**. Valem as regras já documentadas no `CLAUDE.md`:
nunca `gap-*` em flexbox, evitar `aspect-ratio`, `:focus-visible`, `backdrop-filter` sem
fallback. Elementos focáveis levam `data-focusable="true"`.
