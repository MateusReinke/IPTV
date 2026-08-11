import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Blob store backing the optional "conta de sincronizacao".
//
// This endpoint is deliberately dumb: the browser encrypts the whole library
// before uploading (lib/sync.js), so what lands on disk is opaque ciphertext.
// The account id is a SHA-256 of the user's sync code, so the server never
// sees the code itself and cannot decrypt anything it stores.
//
// Set IPTV_DATA_DIR to a persistent volume to enable it; without a writable
// directory the route answers 503 and the UI offers file backups instead.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID_PATTERN = /^[a-f0-9]{64}$/;
const MAX_BODY_BYTES = 4 * 1024 * 1024;

function libraryDir() {
  const base = process.env.IPTV_DATA_DIR || path.join(process.cwd(), '.data');
  return path.join(base, 'library');
}

function fileFor(id) {
  return path.join(libraryDir(), `${id}.json`);
}

async function ensureDir() {
  const dir = libraryDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

function storageUnavailable(err) {
  return Response.json(
    {
      error:
        'A sincronizacao nao esta habilitada neste servidor: nao foi possivel gravar em disco. ' +
        'Configure a variavel IPTV_DATA_DIR apontando para um volume gravavel.',
      detail: err?.code || undefined,
    },
    { status: 503 }
  );
}

function invalidId() {
  return Response.json({ error: 'Codigo de sincronizacao invalido' }, { status: 400 });
}

export async function GET(request) {
  const id = new URL(request.url).searchParams.get('id');

  // No id: capability probe used by the UI to know whether to offer sync.
  if (!id) {
    try {
      await ensureDir();
      return Response.json({ available: true });
    } catch (err) {
      return Response.json({ available: false, detail: err?.code || 'EUNKNOWN' });
    }
  }

  if (!ID_PATTERN.test(id)) return invalidId();

  try {
    const content = await readFile(fileFor(id), 'utf8');
    return new Response(content, {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return Response.json({ error: 'Nenhum dado salvo para este codigo' }, { status: 404 });
    }
    return storageUnavailable(err);
  }
}

export async function PUT(request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !ID_PATTERN.test(id)) return invalidId();

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return Response.json({ error: 'Dados grandes demais para sincronizar' }, { status: 413 });
  }

  let envelope;
  try {
    envelope = JSON.parse(body);
  } catch {
    return Response.json({ error: 'Corpo da requisicao invalido' }, { status: 400 });
  }
  // Only the envelope shape is checked - the payload itself is ciphertext and
  // is meaningless to the server.
  if (
    !envelope ||
    envelope.v !== 1 ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.data !== 'string'
  ) {
    return Response.json({ error: 'Formato de dados invalido' }, { status: 400 });
  }

  try {
    await ensureDir();
    const target = fileFor(id);
    // Write-then-rename so a crash mid-write cannot truncate the only copy.
    const temp = `${target}.${Date.now()}.tmp`;
    await writeFile(temp, JSON.stringify({ ...envelope, savedAt: Date.now() }), 'utf8');
    await rename(temp, target);
    return Response.json({ ok: true, savedAt: Date.now() });
  } catch (err) {
    return storageUnavailable(err);
  }
}

export async function DELETE(request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !ID_PATTERN.test(id)) return invalidId();

  try {
    await unlink(fileFor(id));
  } catch (err) {
    if (err?.code !== 'ENOENT') return storageUnavailable(err);
  }
  return Response.json({ ok: true });
}
