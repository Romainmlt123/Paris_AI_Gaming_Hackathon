// Petit serveur node:http local : garde les clés et relaie vers les handlers.
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { env, hasGemini } from './env.ts';
import { handleAbsence, handleHealth, handleTalk } from './handlers.ts';
import type { HandlerResult } from './handlers.ts';

const MAX_BODY_BYTES = 64 * 1024;

class BodyError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      // On continue de drainer sans stocker, pour pouvoir répondre 413 proprement.
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > MAX_BODY_BYTES) {
        reject(new BodyError(413, `body trop gros (> ${MAX_BODY_BYTES} octets)`));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new BodyError(400, 'body JSON invalide'));
      }
    });
    req.on('error', (err) => reject(new BodyError(400, `lecture du body : ${err.message}`)));
  });
}

function send(res: ServerResponse, { status, json }: HandlerResult): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(status === 204 ? undefined : JSON.stringify(json));
}

const POST_ROUTES: Record<string, (body: unknown) => Promise<HandlerResult>> = {
  '/api/talk': handleTalk,
  '/api/absence': handleAbsence,
};

async function route(req: IncomingMessage): Promise<HandlerResult> {
  const path = (req.url ?? '/').split('?')[0] ?? '/';
  if (req.method === 'OPTIONS') return { status: 204, json: null };
  if (req.method === 'GET' && path === '/api/health') return handleHealth();
  const handler = POST_ROUTES[path];
  if (!handler) return { status: 404, json: { error: `route inconnue : ${req.method} ${path}` } };
  if (req.method !== 'POST') return { status: 405, json: { error: 'POST attendu' } };
  try {
    return await handler(await readJsonBody(req));
  } catch (err) {
    if (err instanceof BodyError) return { status: err.status, json: { error: err.message } };
    console.error(`[api] erreur inattendue sur ${path} :`, err);
    return { status: 500, json: { error: 'erreur interne' } };
  }
}

const server = createServer((req, res) => {
  const start = Date.now();
  route(req)
    .then((result) => {
      send(res, result);
      console.log(`[api] ${req.method} ${req.url} → ${result.status} (${Date.now() - start} ms)`);
    })
    .catch((err: unknown) => {
      console.error('[api] échec d\'envoi de la réponse :', err);
      if (!res.headersSent) send(res, { status: 500, json: { error: 'erreur interne' } });
    });
});

server.listen(env.port, () => {
  console.log(`[api] RAGOTS sur http://localhost:${env.port} — modèle ${env.geminiModel}, Gemini ${hasGemini ? 'actif' : 'ABSENT (répliques de secours)'}`);
});
