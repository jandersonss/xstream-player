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
npm run tv:assets       # gera ícone e splash em tv/assets/ (precisa de python3 + Pillow)
npm run package:webos   # → tv/dist/*.ipk
npm run package:tizen   # → tv/dist/*.wgt
```

O empacotamento não depende do build do servidor: o pacote contém só `tv/bootstrap/` mais os
dois PNGs. A versão vem do `package.json`.

### Pré-requisitos

| Plataforma | Ferramenta |
|---|---|
| webOS | `npm install -g @webos-tools/cli` (fornece `ares-package`) |
| Tizen | Tizen Studio com `tools/ide/bin` no PATH, mais um perfil de assinatura (`tizen security-profiles add`) |

## Instalar numa TV LG (Developer Mode)

Este é o caminho que funciona hoje, sem depender de aprovação de loja.

1. Na TV, instale o app **Developer Mode** pela Content Store e faça login com sua conta de
   desenvolvedor LG.
2. Ligue o Dev Mode e o **Key Server**; anote o IP da TV e o passphrase.
3. No computador:

```bash
ares-setup-device --add tv -i host=<IP-DA-TV> -i port=9922 -i username=prisoner
ares-novacom --device tv --getkey        # pede o passphrase mostrado na TV
ares-install --device tv tv/dist/com.xstreamplayer.tv_<versão>_all.ipk
ares-launch --device tv com.xstreamplayer.tv
```

O Dev Mode da LG expira a cada 1000 horas e precisa ser renovado pelo app na TV — é uma
limitação da LG, não do projeto.

## Instalar numa TV Samsung

```bash
tizen install -n tv/dist/<arquivo>.wgt -t <device>
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
