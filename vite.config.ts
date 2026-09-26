import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

const API_ROUTES = ['talk', 'simulate', 'tts', 'stt', 'stt-token'] as const;

type RouteHandler = (req: Request) => Promise<Response>;

function isRouteHandler(value: unknown): value is RouteHandler {
  return typeof value === 'function';
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function forward(server: ViteDevServer, route: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const mod = await server.ssrLoadModule(`/api/${route}.ts`);
  const handler: unknown = mod.POST;
  if (req.method !== 'POST' || !isRouteHandler(handler)) {
    res.statusCode = 405;
    res.end('Method not allowed');
    return;
  }
  const body = await readBody(req);
  const request = new Request(`http://localhost/api/${route}`, {
    method: 'POST',
    headers: { 'content-type': req.headers['content-type'] ?? 'application/json' },
    body: new Uint8Array(body),
  });
  const response = await handler(request);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

/** Serves the Vercel-style `api/*.ts` handlers from the Vite dev server. */
function apiRoutes(): Plugin {
  return {
    name: 'ragots-api',
    configureServer(server) {
      for (const route of API_ROUTES) {
        server.middlewares.use(`/api/${route}`, (req, res) => {
          forward(server, route, req, res).catch((err: unknown) => {
            console.error(`[api/${route}] handler crashed`, err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'internal' }));
          });
        });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    plugins: [apiRoutes()],
    server: { host: true },
    test: { include: ['shared/**/*.test.ts', 'src/**/*.test.ts'] },
  };
});
