# IPTV Player

Cliente web para assistir playlists IPTV via protocolo **Xtream Codes**
(`player_api.php`) — o formato de login usado pela maioria dos
provedores/painéis IPTV (URL do servidor + usuário + senha).

## Funcionalidades

- Tela "Adicionar playlist" (título, URL do servidor, usuário, senha), com
  validação dos campos
- Múltiplas playlists salvas no navegador, sem precisar de conta/backend
- TV ao vivo, Filmes (VOD) e Séries, com categorias e busca
- Página de série com temporadas e episódios
- Player de vídeo com suporte a HLS (`.m3u8`) via `hls.js`
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
implantada em qualquer plataforma com suporte a Node.js (Vercel, Railway,
um VPS com `npm start`/PM2, etc.).

## Arquitetura

- `app/page.js` — playlists salvas e formulário de login
- `app/playlist/[id]/page.js` — navegação por TV ao vivo / Filmes / Séries
- `app/playlist/[id]/series/[seriesId]/page.js` — temporadas e episódios
- `app/playlist/[id]/player/page.js` — player de vídeo
- `app/api/xtream/route.js` — proxy server-side para `player_api.php`
- `app/api/stream/route.js` — proxy server-side dos streams (reescreve
  playlists `.m3u8` para que os segmentos também passem pelo proxy)
- `lib/xtream.js` — helpers para montar URLs e chamar a API Xtream
- `lib/playlists.js` — playlists salvas no `localStorage` do navegador

## Sobre as credenciais

As credenciais de cada playlist ficam salvas **apenas no `localStorage` do
seu navegador** — não há banco de dados nem conta de usuário. Isso é
adequado para uso pessoal. Se for hospedar o app publicamente, lembre-se de
que qualquer pessoa com acesso à URL poderá usar o proxy para consultar
qualquer servidor Xtream que ela mesma informar nos campos do formulário.

## Aviso

Este é um cliente genérico para o protocolo Xtream Codes: ele não fornece,
hospeda nem indica nenhum conteúdo. É necessário ter suas próprias
credenciais de um provedor IPTV.
