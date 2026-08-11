import { APP_NAME } from '@/lib/pricing';

// Web app manifest, generated so the product name follows NEXT_PUBLIC_APP_NAME.
// Installing from the browser is the first step toward the store builds: the
// same URL wraps cleanly in a Trusted Web Activity (Play) or WKWebView (iOS).

export const dynamic = 'force-static';

export function GET() {
  return Response.json(
    {
      name: APP_NAME,
      short_name: APP_NAME,
      description: 'Assista a varios canais ao mesmo tempo, escolhendo de qual tela sai o audio.',
      start_url: '/app',
      scope: '/',
      display: 'standalone',
      orientation: 'any',
      background_color: '#0c0808',
      theme_color: '#0c0808',
      lang: 'pt-BR',
      categories: ['entertainment', 'video'],
      icons: [
        { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
      ],
    },
    { headers: { 'content-type': 'application/manifest+json' } }
  );
}
