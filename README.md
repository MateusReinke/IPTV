# Multitela

Player IPTV (padrão **Xtream Codes**) vendido como assinatura, cujo diferencial
é a **multitela**: várias transmissões ao vivo ao mesmo tempo, com o áudio
saindo da tela que você escolher — feito para quem acompanha vários jogos na
mesma rodada.

O repositório contém o produto inteiro: site de divulgação, cadastro com teste
grátis, player, multitela, cobrança e painel de controle de assinantes.

## Como o produto se divide

| Área | Rota | O que é |
| --- | --- | --- |
| Divulgação | `/` | Landing page pública com recursos, planos e FAQ |
| Cadastro/login | `/criar-conta`, `/entrar` | Conta com teste de 7 dias automático |
| App | `/app` | Playlists salvas |
| Navegação | `/app/playlist/[id]` | TV ao vivo, filmes, séries, favoritos, histórico |
| Player | `/app/playlist/[id]/player` | Player com retomada de onde parou |
| **Multitela** | `/app/multiview` | Grade de 1 a 9 canais, áudio selecionável |
| Conta | `/app/conta` | Plano, assinatura, backup e sincronização |
| Painel | `/admin` | Métricas e gestão de assinantes |

## Planos e o que cada um libera

| | Grátis (após o teste) | Teste (7 dias) | Premium |
| --- | --- | --- | --- |
| Telas simultâneas | 1 | 9 | 9 |
| Áudio selecionável | — | ✓ | ✓ |
| Histórico / continuar assistindo | — | ✓ | ✓ |
| Sincronização entre aparelhos | — | ✓ | ✓ |
| Favoritos e backup em arquivo | ✓ | ✓ | ✓ |

Os limites são definidos em `lib/entitlements.js` e **aplicados no servidor** —
mudar o plano é uma linha, e nenhum limite depende do que o navegador diz.

### Como o limite de telas é realmente imposto

Bloquear só na interface não sustenta uma assinatura: bastaria abrir outra aba.
O caminho é:

1. Cada imagem em tela pede um **lease** em `POST /api/play/lease`, informando
   o seu identificador de tela.
2. O servidor conta os leases vivos da conta (heartbeat a cada 30s, expiram em
   90s). Passou do limite do plano → `402` com o motivo, e a interface mostra o
   convite para assinar no lugar do vídeo.
3. Dentro do limite, o servidor devolve um **token assinado (HMAC)**.
4. `/api/stream` só entrega bytes com um token válido. Como a verificação é
   apenas uma assinatura, o caminho quente (uma requisição por segmento HLS)
   não toca o banco.

Efeito colateral bem-vindo: o proxy de streaming deixa de ser aberto ao mundo.
Ao fechar a aba, os leases são liberados na hora (`sendBeacon`) e, na pior das
hipóteses, expiram sozinhos.

## Rodando localmente

Requer Node.js 20+ e um Postgres.

```bash
cp .env.example .env.local     # preencha DATABASE_URL e as chaves
npm install
npm run dev
```

As migrações (`db/migrations/*.sql`) rodam sozinhas na primeira requisição,
protegidas por um advisory lock — subir várias instâncias ao mesmo tempo é
seguro.

Gere as chaves obrigatórias com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # APP_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"     # STREAM_TOKEN_SECRET
```

Coloque seu e-mail em `ADMIN_EMAILS` para que a conta vire admin ao se
cadastrar e o painel `/admin` apareça.

## Cobrança

`lib/server/billing.js` isola o provedor atrás de três funções
(`startCheckout`, `openPortal`, `applyProviderEvent`). O que vem pronto:

- **Stripe** (Checkout + portal do cliente + webhook assinado). Configure
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY` e
  `STRIPE_PRICE_YEARLY`, e aponte o webhook para `POST /api/billing/webhook`
  (eventos `checkout.session.completed` e `customer.subscription.*`).
- **Liberação manual** pelo painel: `+30d Premium`, `+7d teste`, `Revogar`.
  Funciona sem nenhuma configuração e é o caminho para vender por PIX ou
  transferência antes de ligar o pagamento online.

Para trocar por Mercado Pago (PIX/boleto), implemente as mesmas três funções e
a verificação de assinatura do webhook; nada mais no app precisa mudar.

> A integração com o Stripe está escrita e revisada, mas **não foi exercitada
> contra a API real** — não havia chaves neste ambiente. Rode um pagamento de
> teste no modo sandbox antes de abrir para o público. Todo o resto (teste
> grátis, limites, painel, liberação manual) foi testado ponta a ponta.

## Painel de controle (`/admin`)

- Contas, contas em teste, assinantes, expirados e ativos nas últimas 24h
- Receita recorrente estimada e cadastros dos últimos 30 dias
- Tabela de assinantes com busca e filtros, e as ações: liberar Premium,
  estender teste, revogar, suspender/reativar e gerar link de redefinição de
  senha (não há envio de e-mail ainda — veja *Limitações*)
- Toda ação administrativa grava uma linha de auditoria

## Dados do usuário

Playlists, favoritos e histórico vivem em um único documento local
(`lib/library.js`), com carimbo de tempo por item e *tombstones* nas remoções.
É isso que permite mesclar duas cópias sem ressuscitar o que foi apagado em
outro aparelho — a mesma regra vale para o backup em arquivo e para a
sincronização.

Quem tem plano pago sincroniza esse documento com a conta
(`/api/library`), criptografado em repouso com `APP_ENCRYPTION_KEY`. Quem não
tem continua com tudo no navegador e pode exportar/importar um arquivo JSON.

## Deploy (Coolify, Docker ou qualquer host Node)

O `Dockerfile` é multi-stage e usa o output `standalone` do Next.js.

1. **+ New → Application**, selecione o repositório; o build pack `Dockerfile` é
   detectado sozinho.
2. Crie um **Postgres** no Coolify e ligue os dois, ou aponte `DATABASE_URL`
   para um banco gerenciado (`DATABASE_SSL=true` costuma ser necessário).
3. Configure as variáveis de `.env.example`. As `NEXT_PUBLIC_*` precisam
   existir **no build** (aba *Build → Build Arguments*), porque são embutidas
   no bundle.
4. **Port** `3000`; defina o domínio e deixe o Coolify emitir o HTTPS.
5. Nenhum volume é necessário: tudo persistente está no Postgres.

## Aplicativos para Android e iOS

O app já é instalável (manifest em `/manifest.webmanifest`, ícones em
`public/`), o que cobre o "instalar na tela inicial". Para as lojas:

- **Play Store**: empacote com [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)
  como TWA. Exige `assetlinks.json` no domínio e um HTTPS válido.
- **App Store**: a Apple rejeita webview pura sem valor adicional; o caminho
  usual é um shell nativo (Capacitor) com push e player nativo. Reserve tempo
  para isso.
- **Regra das lojas**: assinaturas vendidas dentro do app precisam usar a
  cobrança da própria loja (comissão de 15–30%). Vender no site e apenas
  *entregar* o acesso no aplicativo é o arranjo que a maioria adota — mais um
  motivo para a landing page e o checkout ficarem na web.

A API já aceita `Authorization: Bearer <token>` além do cookie, então um app
nativo usa exatamente os mesmos endpoints.

## Arquitetura

```
app/
  page.js                     landing page pública
  entrar|criar-conta|redefinir-senha
  app/                        área logada (layout exige sessão)
    playlist/[id]/...         navegação, série e player
    multiview/                a multitela
    conta/                    plano, assinatura, backup
  admin/                      painel do operador
  api/
    auth/*                    cadastro, login, sessão, redefinição
    play/lease                leases + emissão do token de reprodução
    stream                    proxy de bytes (exige token)
    xtream                    proxy do player_api.php (exige sessão)
    library                   sincronização da biblioteca (exige plano)
    billing/*                 checkout, portal e webhook
    admin/*                   métricas, listagem e ações
lib/
  entitlements.js             planos e o que cada um libera (cliente+servidor)
  library.js                  documento local + regra de merge
  favorites.js history.js     seções da biblioteca
  sync.js backup.js           sincronização e backup em arquivo
  multiview.js                estado da grade
  server/
    db.js                     pool + migrações automáticas
    auth.js                   senhas (scrypt) e sessões
    leases.js playToken.js    limite de telas e tokens de reprodução
    libraryStore.js           biblioteca criptografada em repouso
    billing.js                adaptador de pagamento (Stripe)
    admin.js                  métricas e ações administrativas
db/migrations/                SQL aplicado automaticamente
```

## Limitações conhecidas

- **Sem e-mail transacional.** Não há "esqueci minha senha" self-service: o
  admin gera um link de redefinição (válido por 2h) e entrega ao usuário. Ligar
  um SMTP e disparar esse mesmo link fecha a lacuna.
- **Stripe não exercitado ao vivo** (veja acima).
- **Rate limit em memória**, por instância (`lib/server/rateLimit.js`). Serve
  para conter força bruta; com várias réplicas, mova para o Postgres ou Redis.
- **Token de reprodução com validade de 6h**, para que um filme longo continue
  tocando. Quem extrair o token pode reusá-lo nesse intervalo — aceitável
  porque obtê-lo já exige uma conta ativa.
- **Nove telas exigem uma máquina razoável.** São nove decodificadores de vídeo
  simultâneos; em celulares antigos, quatro já é bastante.

## Aviso

Este é um cliente genérico para o protocolo Xtream Codes: ele não fornece,
hospeda nem indica nenhum conteúdo. Cada usuário precisa das credenciais do seu
próprio provedor IPTV.
