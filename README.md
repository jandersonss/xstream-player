# Xstream Player

Uma aplicação web moderna para reprodução de conteúdo IPTV via API Xstream Codes, desenvolvida com Next.js e React.

## ⚠️ AVISO DE SEGURANÇA IMPORTANTE

**ESTA APLICAÇÃO É DESTINADA APENAS PARA USO EM REDE PRIVADA.**

*   **Não exponha esta aplicação diretamente à internet.**
*   A aplicação **não possui verificações de segurança robustas** implementadas.
*   As informações da conta IPTV (URL do host, usuário e senha) são **salvas localmente sem criptografia** no servidor (no arquivo `data/config.json`).
*   Recomenda-se o uso apenas em ambientes controlados e seguros.

---

## 📺 Funcionalidades

*   Suporte a API Xstream Codes.
*   Interface moderna e responsiva.
*   Persistência de dados local para facilitar o acesso.
*   Reprodução de canais ao vivo, filmes e séries (VOD).

## 🚀 Como Instalar e Rodar

### Pré-requisitos

*   Node.js (v18 ou superior)
*   npm ou yarn

### Instalação Local

1.  Clone o repositório ou baixe os arquivos.
2.  No terminal, acesse a pasta do projeto.
3.  Instale as dependências:
    ```bash
    npm install
    ```
4.  Inicie o servidor de desenvolvimento:
    ```bash
    npm run dev
    ```
5.  Acesse `http://localhost:3000` no seu navegador.

### Docker

1.  Construa a imagem:
    ```bash
    docker build -t xstream-player .
    ```

2.  Rode o container com persistência de dados (essencial para salvar login):
    ```bash
    docker run -d \
      -p 3000:3000 \
      -v $(pwd)/data:/app/data \
      --name xstream-player \
      xstream-player
    ```

    Ou se preferir usar a imagem do Docker Hub (se disponível):
    ```bash
    docker run -d \
      -p 3000:3000 \
      -v $(pwd)/data:/app/data \
      --name xstream-player \
      jandersonss/xstream-player:latest
    ```

## 💾 Persistência de Dados

A aplicação utiliza a pasta `/data` na raiz do projeto para armazenar as configurações da conta logada (`config.json`).

É **essencial** realizar o bind deste volume (`-v $(pwd)/data:/app/data`) para garantir que seus dados de login permaneçam persistentes após o reinício do container.

### Docker Compose

Exemplo de `docker-compose.yml`:
```yaml
services:
  xstream-player:
    image: xstream-player
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
```

### ⚠️ Importante (Usuários Linux)

Se você estiver rodando no Linux, pode enfrentar problemas de permissão (`EACCES: permission denied`), pois o usuário do container (`uid 1001`) é diferente do seu usuário local.

Para corrigir isso, você precisa ajustar as permissões da pasta `data` na sua máquina local:

```bash
# Opção 1: Dar permissão de escrita para "outros" (mais fácil)
chmod -R 777 data/

# Opção 2: Atribuir dono ao uid do container (mais seguro)
sudo chown -R 1001:1001 data/
```

## 🛠️ Tecnologias Utilizadas

*   [Next.js](https://nextjs.org/)
*   [React](https://reactjs.org/)
*   [Tailwind CSS](https://tailwindcss.com/)
*   [HLS.js](https://github.com/video-dev/hls.js/)
*   [Framer Motion](https://www.framer.com/motion/)
*   [Lucide React](https://lucide.dev/)
