import { checkDatabase } from '@/lib/server/db';
import { libraryStorageConfigured } from '@/lib/server/libraryStore';
import { streamSecretFromEnv } from '@/lib/server/playToken';
import { billingConfigured } from '@/lib/server/billing';
import { aiConfigured } from '@/lib/server/ai';
import { googleAuthConfigured } from '@/lib/server/googleAuth';

// Setup diagnostics. Deploys fail on configuration far more often than on
// code, and "não consigo criar usuário" is not something anyone should have to
// debug from a 500 page - open /api/health and it says which piece is missing.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const database = await checkDatabase();
  const databaseReady = database.configured && database.reachable;

  const checks = {
    database,
    // The only piece that must come from the environment: keeping the library
    // key next to the ciphertext would defeat encrypting it at rest.
    encryptionKey: {
      configured: libraryStorageConfigured(),
      note: 'APP_ENCRYPTION_KEY - necessaria para sincronizar favoritos e historico entre aparelhos',
    },
    streamSecret: {
      // Generated and stored by the app when absent, so it never blocks a
      // deploy; the env var only pins it to a value you control.
      configured: streamSecretFromEnv() || databaseReady,
      source: streamSecretFromEnv() ? 'env' : 'gerado automaticamente',
      note: 'STREAM_TOKEN_SECRET - opcional; sem ela o app gera e guarda a chave sozinho',
    },
    billing: {
      configured: billingConfigured(),
      note: 'Opcional: sem Stripe, libere assinaturas manualmente pelo painel',
    },
    ai: {
      configured: aiConfigured(),
      note: 'Opcional: AI_PROVIDER/ANTHROPIC_*/OPENAI_* - sem eles, o botao "IA escolhe pra voce" fica oculto',
    },
    googleAuth: {
      configured: googleAuthConfigured(),
      note: 'Opcional: GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET - sem eles, o botao "Continuar com Google" fica oculto',
    },
  };

  // Only the database truly blocks the product now.
  const blocking = databaseReady ? [] : [database.error || 'banco de dados indisponivel'];
  const warnings = [];
  if (!checks.encryptionKey.configured) {
    warnings.push('Sem APP_ENCRYPTION_KEY: favoritos e historico ficam so no navegador.');
  }
  if (!billingConfigured()) {
    warnings.push('Sem Stripe: libere assinaturas manualmente pelo painel /admin.');
  }
  if (!checks.ai.configured) {
    warnings.push('Sem provedor de IA: a recomendacao "IA escolhe pra voce" fica indisponivel.');
  }
  if (!checks.googleAuth.configured) {
    warnings.push('Sem GOOGLE_CLIENT_ID/SECRET: login com Google fica indisponivel.');
  }

  const ready = blocking.length === 0;
  return Response.json(
    { ready, canCreateAccounts: databaseReady, blocking, warnings, checks },
    { status: ready ? 200 : 503 }
  );
}
