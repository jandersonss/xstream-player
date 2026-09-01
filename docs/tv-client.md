# Client de TV — instalar, distribuir e publicar

O client de TV é um app instalável (LG webOS, Samsung Tizen) que **não** contém o catálogo nem
as credenciais: ele encontra o servidor do XStream Player na rede, se faz autorizar por um
código e entrega a navegação ao servidor. A arquitetura e o porquê estão em
[`tv-client-spec.md`](./tv-client-spec.md).

## Como o usuário usa

1. Abre o app na TV.
2. Digita o IP ou host do servidor (ex.: `192.168.0.10:3000`). O app testa a conexão antes de
   seguir.
3. A TV mostra um código de 6 caracteres **e um QR code**.
4. O dono aprova de um dos dois jeitos:
   - **Celular:** aponta a câmera para o QR code → abre **Dispositivos** com o código já
     preenchido; confere nome/perfil e toca em **Aprovar**.
   - **Computador:** abre o XStream Player → **Dispositivos** e digita o código.
   Em ambos os casos ele escolhe um nome e o perfil padrão do aparelho.
5. A TV entra no app. Nas próximas vezes, entra direto.

O QR aponta para o mesmo servidor que a TV usou (`Host` da requisição); se o servidor não
souber determinar o host, o QR é omitido e o código digitado continua funcionando.

Para desautorizar uma TV, basta revogar o aparelho na mesma tela **Dispositivos**.

## Build

```bash
npm run tv:assets          # gera ícones e splash em tv/assets/ (precisa de python3 + Pillow)

npm run package:webos      # prod → tv/dist/com.xstreamplayer.tv_<versão>_all.ipk
npm run package:webos:dev  # dev  → tv/dist/com.xstreamplayer.tv.dev_<versão>_all.ipk

npm run package:tizen      # prod → tv/dist/<name>.wgt
npm run package:tizen:dev  # dev  → tv/dist/<name>.wgt
```

O empacotamento não depende do build do servidor: o pacote contém só `tv/bootstrap/` mais os
PNGs. A versão vem do `package.json`.

### Prod e Dev são dois apps

`:dev` gera um app **separado** — outro id (`com.xstreamplayer.tv.dev`), ícone âmbar em vez de
vermelho, "(Dev)" no nome. Os dois convivem na mesma TV sem se sobrescrever, e cada um lembra
o **seu** endereço de servidor. Assim dá para deixar a TV de teste apontando para o servidor
de dev sem mexer no app de prod (que roda no mesmo servidor de casa).

Para **trocar o servidor** de um app já pareado: no servidor, abra **Dispositivos** → o
aviso "Você está vendo esta tela pela TV" → **Desconectar e trocar servidor**. Feche e reabra
o app na TV; ele volta para a tela de conexão.

### Pré-requisitos

| Plataforma | Ferramenta |
|---|---|
| webOS | `npm install -g @webosose/ares-cli` (fornece `ares-package`, `ares-install`, …) |
| Tizen | Tizen Studio com `tools/ide/bin` no PATH, mais um perfil de assinatura (`tizen security-profiles add`) |

## Instalar numa TV LG (Developer Mode)

Este é o caminho que funciona hoje, sem depender de aprovação de loja.

1. Na TV, instale o app **Developer Mode** pela Content Store e faça login com sua conta de
   desenvolvedor LG.
2. Ligue o **Dev Mode** e o **Key Server**. Anote o **IP** e o **passphrase** (6 caracteres)
   mostrados na tela — o passphrase muda a cada renovação da sessão.
3. No computador, registre a TV. Com `@webosose/ares-cli` a chave privada é baixada
   automaticamente na primeira conexão, desde que o passphrase esteja no cadastro:

```bash
ares-setup-device --add tv-sala \
  -i "host=<IP-DA-TV>" -i "port=9922" -i "username=prisoner" \
  -i "privatekey=tv-sala_webos" -i "passphrase=<PASSPHRASE>"

ares-device --device tv-sala -i          # testa a conexão (baixa a chave)
```

4. Instale e abra. Prod e dev são ids diferentes, então instalar um **não** remove o outro:

```bash
# prod
ares-install --device tv-sala tv/dist/com.xstreamplayer.tv_<versão>_all.ipk
ares-launch  --device tv-sala com.xstreamplayer.tv

# dev
ares-install --device tv-sala tv/dist/com.xstreamplayer.tv.dev_<versão>_all.ipk
ares-launch  --device tv-sala com.xstreamplayer.tv.dev
```

Ou tudo de uma vez (empacota + instala + abre):

```bash
npm run install:tv          # prod
npm run install:tv:dev      # dev
ARES_DEVICE=<nome> npm run install:tv   # se o device não for "tv-sala"
```

Para inspecionar (DevTools remoto): `ares-inspect --device tv-sala --app com.xstreamplayer.tv`.

O Dev Mode da LG expira a cada 1000 horas e precisa ser renovado pelo app na TV — é uma
limitação da LG, não do projeto.

**Se o `ares-install` falhar com `rm: can't remove '/media/developer/temp': Permission denied`:**
é lixo de uma sessão anterior do Dev Mode. Na TV, no app **Developer Mode**, ligue
**"Clear Cache Data"** (limpa `/media/developer`), ou desligue e religue o Dev Mode, e instale
de novo.

## Instalar numa TV Samsung

```bash
# prod
tizen install -n tv/dist/<arquivo-prod>.wgt -t <device>
# dev (package id XstrmPlyrD — não conflita com o de prod XstrmPlyr0)
tizen install -n tv/dist/<arquivo-dev>.wgt -t <device>
```

O aparelho precisa estar em Developer Mode (Apps → `12345` no controle) e pareado por IP.

## Publicar na LG Content Store

Isto é uma submissão, não um comando — e é a parte mais incerta do caminho. O que é preciso
saber antes de investir tempo:

- Exige conta no **LG Seller Lounge** e passar pela QA da LG.
- O app é um client de um servidor que **o próprio usuário** hospeda. A QA costuma pedir uma
  conta de teste funcional; sem um servidor público de demonstração, a submissão trava. Na
  prática isso significa manter um servidor de demonstração no ar durante a avaliação.
- Apps de IPTV recebem escrutínio extra sobre direitos de conteúdo. Este app não distribui
  conteúdo nenhum — quem fornece é o provedor Xtream do usuário —, e vale deixar isso
  explícito na descrição da submissão.
- O projeto é **AGPL-3.0**: distribuir o binário obriga a oferecer o código correspondente.
  O ffmpeg fica no servidor, não no pacote, então ele não entra nessa conta.

Se a loja não for viável, a distribuição por Developer Mode acima entrega o mesmo app.

## Compatibilidade

O bootstrap é ES5 puro e usa `XMLHttpRequest`, então roda no webOS 5 (Chromium 68) e acima.
Depois do redirect quem manda é o app do servidor, que exige **webOS 6 (Chromium ~79)** — em
webOS 5 o `middleware.ts` do servidor redireciona para o app legacy automaticamente, e o
client de TV herda esse comportamento sem precisar saber dele.
