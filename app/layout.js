import './globals.css';
import Providers from '@/components/Providers';
import { APP_NAME } from '@/lib/pricing';

export const metadata = {
  title: {
    default: `${APP_NAME} - varias telas de TV ao mesmo tempo`,
    template: `%s · ${APP_NAME}`,
  },
  description:
    'Player IPTV com multitela: assista a varios canais ao mesmo tempo e escolha de qual tela sai o audio.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: APP_NAME },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0c0808',
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
