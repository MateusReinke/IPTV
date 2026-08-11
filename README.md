# IPTV Player

Cliente web para assistir playlists IPTV via protocolo **Xtream Codes**
(`player_api.php`) — o formato de login usado pela maioria dos
provedores/painéis IPTV (URL do servidor + usuário + senha).

## Funcionalidades

- Tela "Adicionar playlist" (título, URL do servidor, usuário, senha), com
  validação dos campos
- Múltiplas playlists salvas no navegador, sem precisar de conta/backend
- TV ao vivo, Filmes (VOD) e Séries, com categorias e busca
- Favoritos por playlist e **histórico do que já foi assistido**
- "Continuar assistindo": o player retoma de onde você parou, marca
  episódios já vistos e some com o que já terminou
- Página de série com temporadas e episódios
- Player de vídeo com suporte a HLS (`.m3u8`) via `hls.js`
- **Backup em arquivo** e **sincronização opcional entre aparelhos**, com os
  dados criptografados no navegador antes de subir (veja
  [Não perder favoritos e histórico](#não-perder-favoritos-e-histórico))
- Proxy de API e de stream no servidor, para evitar bloqueios de
  CORS/"mixed content" quando o painel IPTV usa `http://` e o app roda em
  `https://`

## Como rodar localmente

Requer Node.js 20+.

```bash
npm install
npm run dev
```

Abra http://localhost:3000, clique em "Adicionar playlist" e informe os
dados fornecidos pelo seu provedor IPTV (URL do servidor, usuário e senha).

## Build de produção

```bash
npm run build
npm start
```

A aplicação é um único app Next.js (frontend + rotas de API), então pode ser
implantada em qualquer plataforma com suporte a Node.js ou Docker (Coolify,
Vercel, Railway, um VPS com `npm start`/PM2, etc.). Veja a seção
[Deploy com Coolify](#deploy-com-coolify) abaixo.

Também é possível buildar e rodar via Docker diretamente:

```bash
docker build -t iptv-player .
docker run -p 3000:3000 iptv-player
```

## Não perder favoritos e histórico

Favoritos e histórico ficam gravados no `localStorage` do navegador. Isso é
rápido, funciona offline e não exige login — mas some se você limpar os dados
do navegador, e não acompanha você para o celular ou para a TV. O app oferece
três níveis; use o que fizer sentido para o seu caso.

### 1. Local (padrão, nada a configurar)

Playlists, favoritos e histórico são gravados em um único documento
(`iptv.library.v1`). Cada item tem uma marca de tempo, e remoções deixam um
"tombstone" em vez de sumir — é isso que permite juntar duas cópias sem
ressuscitar o que você apagou em outro aparelho.

### 2. Backup em arquivo (recomendado para todo mundo)

Na tela inicial: **Exportar backup** baixa um `.json` com tudo, e **Importar
backup** junta o arquivo com o que já existe no aparelho (nunca sobrescreve
cegamente: vale sempre a alteração mais recente de cada item). É o jeito mais
simples de dormir tranquilo e não depende de nenhuma infraestrutura.

### 3. Conta de sincronização (para usar em vários aparelhos)

Em vez de e-mail e senha, você gera um **código de sincronização** de 20
caracteres. A partir dele o navegador deriva duas coisas:

- o identificador que o servidor usa para guardar o arquivo
  (`SHA-256` do código);
- a chave de criptografia (`PBKDF2` → `AES-GCM`).

O navegador criptografa a biblioteca inteira **antes** de enviar, então o
servidor guarda apenas um blob opaco: quem tiver acesso ao disco da sua
instância não consegue ler suas credenciais nem o que você assistiu. Digite o
mesmo código em outro aparelho para que os dois se juntem (a fusão é
bidirecional e roda sozinha ao abrir o app, ao voltar para a aba e alguns
segundos depois de qualquer mudança).

Pontos importantes:

- **O código é a única chave.** Se você perdê-lo, não há recuperação —
  anote-o. Qualquer pessoa que tenha o código consegue ler seus dados.
- Sincronizar as credenciais das playlists é opcional (caixinha no painel).
  Ligado, trocar de aparelho não exige redigitar usuário e senha do provedor.
- Requer **https://** (ou `localhost`), porque a API de criptografia do
  navegador só existe em contexto seguro.
- Requer um diretório gravável no servidor, definido em `IPTV_DATA_DIR`.
  Sem ele o app avisa e continua funcionando — só o backup em arquivo fica
  disponível.

### Qual escolher?

Se você usa um aparelho só, o **backup em arquivo** já resolve. Se assiste no
celular e na TV, ative a **sincronização** — ela cobre o backup também. Um
banco de dados com contas de verdade (e-mail + senha) seria excesso aqui: mais
peças para manter e credenciais de IPTV em texto puro no servidor, em troca de
pouca coisa para uso pessoal.

## Deploy com Coolify

O repositório já inclui um `Dockerfile` (multi-stage, usando o output
`standalone` do Next.js), então o Coolify detecta e builda automaticamente:

1. No Coolify: **+ New** → **Application** → escolha a fonte (GitHub App ou
   repositório público) e selecione este repositório e a branch desejada
   (`main`, após o merge da PR).
2. **Build Pack**: `Dockerfile` (auto-detectado). Não é necessário configurar
   comandos de build/start manualmente.
3. **Port**: `3000` (já exposto no `Dockerfile`).
4. **Variáveis de ambiente**: nenhuma é obrigatória. O `Dockerfile` já define
   `IPTV_DATA_DIR=/app/data`, usado apenas pela sincronização opcional.
5. Defina um domínio na aba **Domains**; o Coolify emite HTTPS
   automaticamente (Let's Encrypt) assim que o DNS apontar para o servidor.
6. **Deploy**. Para redeploy automático a cada push, ative o webhook em
   **Automations**/**Webhooks** da aplicação.

### Volume persistente (só para a sincronização)

Sem volume a aplicação funciona normalmente: playlists, favoritos e histórico
ficam no navegador, e o backup em arquivo continua disponível. Se você quiser
usar a **conta de sincronização**, adicione em **Storages** um volume
persistente montado em `/app/data` — é onde ficam os blobs criptografados de
cada código de sincronização. Sem ele, o app avisa que a sincronização não
está habilitada neste servidor.

## Arquitetura

- `app/page.js` — playlists salvas e formulário de login
- `app/playlist/[id]/page.js` — navegação por TV ao vivo / Filmes / Séries
- `app/playlist/[id]/series/[seriesId]/page.js` — temporadas e episódios
- `app/playlist/[id]/player/page.js` — player de vídeo
- `app/api/xtream/route.js` — proxy server-side para `player_api.php`
- `app/api/stream/route.js` — proxy server-side dos streams (reescreve
  playlists `.m3u8` para que os segmentos também passem pelo proxy)
- `app/api/library/route.js` — armazenamento dos blobs criptografados da
  sincronização (GET/PUT/DELETE por código)
- `lib/xtream.js` — helpers para montar URLs e chamar a API Xtream
- `lib/library.js` — documento local (playlists + favoritos + histórico),
  com tombstones e a regra de fusão usada por backup e sincronização
- `lib/playlists.js`, `lib/favorites.js`, `lib/history.js` — leituras e
  escritas de cada seção da biblioteca
- `lib/sync.js` — código de sincronização, criptografia no navegador e
  fusão automática entre aparelhos
- `lib/backup.js` — exportar/importar a biblioteca em arquivo
- `Dockerfile` — build multi-stage com output `standalone` do Next.js, usado
  pelo Coolify (ou qualquer plataforma baseada em Docker)

## Sobre as credenciais

As credenciais de cada playlist ficam salvas **no `localStorage` do seu
navegador** — não há banco de dados nem conta de usuário. Isso é adequado
para uso pessoal. Se for hospedar o app publicamente, lembre-se de que
qualquer pessoa com acesso à URL poderá usar o proxy para consultar qualquer
servidor Xtream que ela mesma informar nos campos do formulário.

As credenciais só saem do navegador se você ativar a sincronização **e**
deixar marcada a opção de incluir as playlists. Mesmo nesse caso elas são
criptografadas no navegador antes do upload, e o servidor guarda apenas o
resultado — mas quem tiver o seu código de sincronização consegue abri-las,
então trate o código como uma senha.

## Aviso

Este é um cliente genérico para o protocolo Xtream Codes: ele não fornece,
hospeda nem indica nenhum conteúdo. É necessário ter suas próprias
credenciais de um provedor IPTV.
