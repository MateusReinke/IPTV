import Link from 'next/link';
import { getAuth } from '@/lib/server/auth';
import { TRIAL_DAYS } from '@/lib/entitlements';
import { APP_NAME, PRICING, formatBRL, monthlyEquivalent } from '@/lib/pricing';
import styles from './page.module.css';

// Public landing page. It reads the session only to decide between "comecar
// gratis" and "ir para o app" - everything else is static content.

export const metadata = {
  title: `${APP_NAME} - varias telas de TV ao mesmo tempo`,
  description:
    'Assista a varios jogos e canais ao mesmo tempo, escolhendo de qual tela sai o audio. Teste gratis por 7 dias.',
};

const FEATURES = [
  {
    title: 'Ate 9 telas ao mesmo tempo',
    body: 'Monte a grade do jeito que quiser: 2, 4, 6 ou 9 canais lado a lado, cada um com o seu jogo.',
  },
  {
    title: 'Voce escolhe de onde vem o audio',
    body: 'Um clique (ou as teclas 1 a 9) move o som para a tela que interessa. As outras continuam rodando em silencio.',
  },
  {
    title: 'Continua de onde parou',
    body: 'Filmes e series guardam o ponto exato em que voce parou, com episodios assistidos marcados.',
  },
  {
    title: 'Seus dados em qualquer aparelho',
    body: 'Playlists, favoritos e historico ficam na sua conta e aparecem no celular, no computador e na TV.',
  },
  {
    title: 'Funciona com seu provedor',
    body: 'Compativel com o padrao Xtream Codes: informe servidor, usuario e senha e pronto.',
  },
  {
    title: 'Sem instalar nada',
    body: 'Roda no navegador do computador, do celular e da smart TV. Da para instalar como aplicativo.',
  },
];

const FAQ = [
  {
    q: 'Voces fornecem os canais?',
    a: `Nao. O ${APP_NAME} e um player: voce usa as credenciais do seu proprio provedor IPTV (padrao Xtream Codes). Nao hospedamos, revendemos nem indicamos conteudo.`,
  },
  {
    q: 'Como funciona o teste gratuito?',
    a: `Ao criar a conta voce recebe ${TRIAL_DAYS} dias com todos os recursos liberados, incluindo a multitela. Nao pedimos cartao de credito para comecar.`,
  },
  {
    q: 'O que acontece quando o teste acaba?',
    a: 'Sua conta continua funcionando com uma tela por vez. Multitela, historico e sincronizacao voltam assim que voce assinar.',
  },
  {
    q: 'Quantos aparelhos posso usar?',
    a: 'Quantos quiser. O que o plano limita e o numero de telas tocando ao mesmo tempo, somando todos os aparelhos.',
  },
  {
    q: 'Posso cancelar quando quiser?',
    a: 'Sim. O acesso continua ate o fim do periodo ja pago e nao ha multa nem fidelidade.',
  },
];

export default async function LandingPage() {
  const auth = await getAuth();
  const signedIn = !!auth;

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <span className={styles.brand}>
          <span className={styles.mark} aria-hidden="true" />
          {APP_NAME}
        </span>
        <nav className={styles.navLinks}>
          <a href="#recursos">Recursos</a>
          <a href="#planos">Planos</a>
          <a href="#faq">Duvidas</a>
        </nav>
        <div className={styles.navActions}>
          {signedIn ? (
            <Link className={styles.btnPrimary} href="/app">
              Ir para o app
            </Link>
          ) : (
            <>
              <Link className={styles.btnGhost} href="/entrar">
                Entrar
              </Link>
              <Link className={styles.btnPrimary} href="/criar-conta">
                Comecar gratis
              </Link>
            </>
          )}
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.kicker}>{TRIAL_DAYS} dias gratis - sem cartao</span>
          <h1 className={styles.title}>
            Varios jogos na tela.
            <br />
            <span className={styles.titleAccent}>O audio no que importa.</span>
          </h1>
          <p className={styles.lead}>
            O {APP_NAME} abre ate nove canais ao mesmo tempo e deixa voce escolher, com um clique,
            de qual tela sai o som. Feito para quem acompanha a rodada inteira, nao um jogo so.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.btnPrimaryLarge} href={signedIn ? '/app' : '/criar-conta'}>
              {signedIn ? 'Abrir o app' : 'Comecar teste gratuito'}
            </Link>
            <Link className={styles.btnGhostLarge} href="#planos">
              Ver planos
            </Link>
          </div>
          <p className={styles.heroNote}>
            Use as credenciais do seu provedor IPTV. Nao fornecemos conteudo.
          </p>
        </div>

        <MultiviewMock />
      </section>

      <section className={styles.section} id="recursos">
        <h2 className={styles.sectionTitle}>Tudo o que voce precisa para assistir</h2>
        <div className={styles.features}>
          {FEATURES.map((feature) => (
            <article key={feature.title} className={styles.feature}>
              <h3 className={styles.featureTitle}>{feature.title}</h3>
              <p className={styles.featureBody}>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} id="planos">
        <h2 className={styles.sectionTitle}>Planos</h2>
        <p className={styles.sectionLead}>
          Comece testando tudo. Depois escolha o ciclo que preferir - o recurso e o mesmo.
        </p>

        <div className={styles.plans}>
          <article className={styles.plan}>
            <h3 className={styles.planName}>Teste gratuito</h3>
            <p className={styles.planPrice}>
              R$ 0<span className={styles.planPeriod}>/{TRIAL_DAYS} dias</span>
            </p>
            <ul className={styles.planList}>
              <li>Todos os recursos liberados</li>
              <li>Ate 9 telas simultaneas</li>
              <li>Historico e sincronizacao</li>
              <li>Sem cartao de credito</li>
            </ul>
            <Link className={styles.btnGhostLarge} href={signedIn ? '/app' : '/criar-conta'}>
              {signedIn ? 'Abrir o app' : 'Comecar agora'}
            </Link>
          </article>

          {Object.values(PRICING).map((plan) => (
            <article
              key={plan.id}
              className={`${styles.plan} ${plan.id === 'yearly' ? styles.planFeatured : ''}`}
            >
              {plan.id === 'yearly' && <span className={styles.planTag}>Melhor valor</span>}
              <h3 className={styles.planName}>Premium {plan.label.toLowerCase()}</h3>
              <p className={styles.planPrice}>
                {formatBRL(plan.amount)}
                <span className={styles.planPeriod}>/{plan.period}</span>
              </p>
              {plan.period === 'ano' && (
                <p className={styles.planEquivalent}>
                  equivale a {formatBRL(monthlyEquivalent(plan))} por mes
                </p>
              )}
              <ul className={styles.planList}>
                <li>Ate 9 telas simultaneas</li>
                <li>Audio selecionavel por tela</li>
                <li>Historico e continuar assistindo</li>
                <li>Sincronizacao entre aparelhos</li>
                <li>{plan.note}</li>
              </ul>
              <Link className={styles.btnPrimaryLarge} href={signedIn ? '/app/conta' : '/criar-conta'}>
                {signedIn ? 'Assinar' : 'Testar antes de assinar'}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} id="faq">
        <h2 className={styles.sectionTitle}>Duvidas frequentes</h2>
        <div className={styles.faq}>
          {FAQ.map((item) => (
            <details key={item.q} className={styles.faqItem}>
              <summary className={styles.faqQuestion}>{item.q}</summary>
              <p className={styles.faqAnswer}>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <p>
          {APP_NAME} e um player para playlists no padrao Xtream Codes. Nao fornecemos, hospedamos
          nem indicamos conteudo: e necessario ter credenciais do seu proprio provedor.
        </p>
        <p className={styles.footerLinks}>
          <Link href="/entrar">Entrar</Link>
          <Link href="/criar-conta">Criar conta</Link>
        </p>
      </footer>
    </div>
  );
}

// Pure-CSS illustration of the product: four pictures, one of them carrying
// the audio. No screenshots to keep in sync, no image payload.
function MultiviewMock() {
  const tiles = [
    { label: 'Canal 1', active: true },
    { label: 'Canal 2' },
    { label: 'Canal 3' },
    { label: 'Canal 4' },
  ];
  return (
    <div className={styles.mock} aria-hidden="true">
      <div className={styles.mockBar}>
        <span className={styles.mockDot} />
        <span className={styles.mockDot} />
        <span className={styles.mockDot} />
        <span className={styles.mockBarLabel}>Multitela - 4 telas</span>
      </div>
      <div className={styles.mockGrid}>
        {tiles.map((tile, index) => (
          <div
            key={tile.label}
            className={`${styles.mockTile} ${tile.active ? styles.mockTileActive : ''}`}
            style={{ animationDelay: `${index * 0.45}s` }}
          >
            <span className={styles.mockTileLabel}>
              <span className={styles.mockNumber}>{index + 1}</span>
              {tile.label}
            </span>
            {tile.active && (
              <span className={styles.mockAudio}>
                <span />
                <span />
                <span />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
