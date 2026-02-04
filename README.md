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

Para rodar com Docker, você pode criar um container apontando para o binário do Next.js. Certifique-se de configurar a persistência de dados.

## 💾 Persistência de Dados e Docker

A aplicação utiliza a pasta `/data` na raiz do projeto para armazenar as configurações da conta logada (`config.json`). 

Se você estiver utilizando Docker ou qualquer outro sistema de containerização, é **essencial** realizar o bind deste volume para garantir que seus dados de login permaneçam persistentes após o reinício do container.

**Exemplo de uso no Docker:**
```bash
docker run -d \
  -p 3000:3000 \
  -v /caminho/local/data:/app/data \
  --name xstream-player \
  imagem-do-xstream-player
```

No `docker-compose.yml`:
```yaml
services:
  xstream-player:
    image: seu-usuario/xstream-player
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
```

## 🛠️ Tecnologias Utilizadas

*   [Next.js](https://nextjs.org/)
*   [React](https://reactjs.org/)
*   [Tailwind CSS](https://tailwindcss.com/)
*   [HLS.js](https://github.com/video-dev/hls.js/)
*   [Framer Motion](https://www.framer.com/motion/)
*   [Lucide React](https://lucide.dev/)
