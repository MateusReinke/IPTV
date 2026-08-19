import { checkDatabase } from '@/lib/server/db';
import { libraryStorageConfigured } from '@/lib/server/libraryStore';
import { streamAuthConfigured } from '@/lib/server/playToken';
import { billingConfigured } from '@/lib/server/billing';

// Setup diagnostics. Deploys fail on configuration far more often than on
// code, and "não consigo criar usuário" is not something anyone should have to
// debug from a 500 page - open /api/health and it says which piece is missing.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const database = await checkDatabase();

  const checks = {
    database,
    // Only these two block the core flows; billing is optional by design.
    encryptionKey: {
      configured: libraryStorageConfigured(),
      note: 'APP_ENCRYPTION_KEY (32 bytes base64) - necessaria para sincronizar favoritos e historico',
    },
    streamSecret: {
      configured: streamAuthConfigured(),
      note: 'STREAM_TOKEN_SECRET - necessaria para reproduzir video',
    },
    billing: {
      configured: billingConfigured(),
      note: 'Opcional: sem Stripe, libere assinaturas manualmente pelo painel',
    },
  };

  const blocking = [];
  if (!database.configured || !database.reachable) blocking.push(database.error || 'banco de dados');
  if (!checks.streamSecret.configured) blocking.push('STREAM_TOKEN_SECRET ausente');

  const ready = blocking.length === 0;
  return Response.json(
    { ready, canCreateAccounts: database.configured && database.reachable, blocking, checks },
    { status: ready ? 200 : 503 }
  );
}
