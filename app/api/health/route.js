import { checkDatabase } from '@/lib/server/db';
import { libraryStorageConfigured } from '@/lib/server/libraryStore';
import { streamSecretFromEnv } from '@/lib/server/playToken';
import { billingConfigured } from '@/lib/server/billing';

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

  const ready = blocking.length === 0;
  return Response.json(
    { ready, canCreateAccounts: databaseReady, blocking, warnings, checks },
    { status: ready ? 200 : 503 }
  );
}
