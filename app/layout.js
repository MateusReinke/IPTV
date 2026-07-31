import './globals.css';
import Providers from '@/components/Providers';

export const metadata = {
  title: 'IPTV Player',
  description: 'Cliente web para playlists Xtream Codes (IPTV)',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#101013',
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
