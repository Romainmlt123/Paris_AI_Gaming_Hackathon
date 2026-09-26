import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { NPCS } from '../src/data/npcs.ts';
import { fallbackResponse, validateTalkResponse } from '../src/logic/validate.ts';
import type { Gazette, GazetteRequest, NpcId, TalkRequest } from '../src/state/types.ts';
import { NPC_IDS } from '../src/state/types.ts';
import { gazettePrompt, talkPrompt } from './prompt.ts';

if (existsSync('.env')) process.loadEnvFile('.env');
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_STUDIO_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const GRADIUM_KEY = process.env.GRADIUM_API_KEY || process.env.GRADIUM_KEY || '';
const PORT = Number(process.env.PORT || 8787);
const TALK_TIMEOUT = 7000;
const DIST = join(process.cwd(), 'dist');

async function gemini(system: string, user: string, timeoutMs: number): Promise<unknown> {
  if (!GEMINI_KEY) throw new Error('pas de clé Gemini');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.9, thinkingConfig: { thinkingLevel: 'low' } },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return JSON.parse(text.replace(/^```json\s*|```$/g, ''));
}

async function readBody(req: IncomingMessage, limit = 2_000_000): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    const b = c as Buffer;
    size += b.length;
    if (size > limit) throw new Error('corps trop gros');
    chunks.push(b);
  }
  return Buffer.concat(chunks);
}

function json(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function isNpc(v: unknown): v is NpcId {
  return typeof v === 'string' && (NPC_IDS as readonly string[]).includes(v);
}

async function handleTalk(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = JSON.parse((await readBody(req)).toString('utf8')) as TalkRequest & { playerName?: string };
  if (!isNpc(body.npc) || typeof body.playerText !== 'string' || !body.context) return json(res, 400, { error: 'requête invalide' });
  const playerText = body.playerText.slice(0, 300);
  const ctx = body.context;
  const t0 = Date.now();
  try {
    const p = talkPrompt({ ...body, playerText }, (body.playerName || 'le joueur').slice(0, 24));
    const raw = await gemini(p.system, p.user, TALK_TIMEOUT);
    const out = validateTalkResponse(raw, body.npc, ctx, playerText);
    console.log(`[talk] ${body.npc} ${Date.now() - t0}ms ${out.fallback ? 'FALLBACK' : 'ok'}`);
    json(res, 200, out);
  } catch (e) {
    console.warn(`[talk] ${body.npc} secours après ${Date.now() - t0}ms :`, (e as Error).message);
    json(res, 200, fallbackResponse(body.npc, ctx, playerText));
  }
}

function fallbackGazette(r: GazetteRequest): Gazette {
  const t = r.report.transfers[0];
  return {
    headline: t ? `${NPCS[t.from].name} n'a pas su tenir sa langue !` : "Calme plat sur l'île",
    articles: r.report.lines.slice(0, 3).map((l, i) => ({ title: ['À la une', 'Radio-coquillage', 'Brèves'][i] ?? 'Brève', body: l })),
    fallback: true,
  };
}

async function handleGazette(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = JSON.parse((await readBody(req)).toString('utf8')) as GazetteRequest;
  try {
    const p = gazettePrompt(body.report, body.playerName, body.islandValue);
    const raw = (await gemini(p.system, p.user, 8000)) as Partial<Gazette>;
    if (typeof raw.headline !== 'string' || !Array.isArray(raw.articles)) throw new Error('gazette invalide');
    const articles = raw.articles
      .filter((a): a is { title: string; body: string } => typeof a?.title === 'string' && typeof a?.body === 'string')
      .slice(0, 3)
      .map((a) => ({ title: a.title.slice(0, 60), body: a.body.slice(0, 280) }));
    json(res, 200, { headline: raw.headline.slice(0, 90), articles: articles.length ? articles : fallbackGazette(body).articles });
  } catch (e) {
    console.warn('[gazette] secours :', (e as Error).message);
    json(res, 200, fallbackGazette(body));
  }
}

const ttsCache = new Map<string, Buffer>();
async function handleTts(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = JSON.parse((await readBody(req)).toString('utf8')) as { npc?: unknown; text?: unknown };
  if (!isNpc(body.npc) || typeof body.text !== 'string' || !GRADIUM_KEY) return json(res, 400, { error: 'tts indisponible' });
  const text = body.text.slice(0, 400);
  const key = `${body.npc}:${text}`;
  let audio = ttsCache.get(key);
  if (!audio) {
    const r = await fetch('https://api.gradium.ai/api/post/speech/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': GRADIUM_KEY },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ text, voice_id: NPCS[body.npc].voiceId, output_format: 'wav', only_audio: true }),
    });
    if (!r.ok) return json(res, 502, { error: `gradium ${r.status}` });
    audio = Buffer.from(await r.arrayBuffer());
    if (ttsCache.size > 200) ttsCache.clear();
    ttsCache.set(key, audio);
  }
  res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': audio.length });
  res.end(audio);
}

async function handleStt(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!GRADIUM_KEY) return json(res, 400, { error: 'stt indisponible' });
  const audio = await readBody(req, 8_000_000);
  const url = `https://api.gradium.ai/api/post/speech/asr?json_config=${encodeURIComponent(JSON.stringify({ language: 'fr' }))}`;
  const r = await fetch(url, { method: 'POST', headers: { 'x-api-key': GRADIUM_KEY, 'content-type': 'audio/wav' }, body: new Uint8Array(audio), signal: AbortSignal.timeout(12000) });
  if (!r.ok) return json(res, 502, { error: `gradium ${r.status}` });
  const parts: string[] = [];
  for (const line of (await r.text()).split('\n')) {
    if (!line.trim()) continue;
    const m = JSON.parse(line) as { type?: string; text?: string };
    if (m.type === 'text' && m.text) parts.push(m.text);
  }
  json(res, 200, { text: parts.join(' ').replace(/\s+/g, ' ').trim() });
}

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml', '.json': 'application/json', '.wav': 'audio/wav', '.webp': 'image/webp' };
function serveStatic(url: string, res: ServerResponse): void {
  const clean = normalize(decodeURIComponent(url.split('?')[0] ?? '/')).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, clean);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  if (!existsSync(file)) return json(res, 404, { error: 'build absent : npm run build' });
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}

createServer((req, res) => {
  const url = req.url ?? '/';
  const route = async (): Promise<void> => {
    if (req.method === 'POST' && url === '/api/talk') return handleTalk(req, res);
    if (req.method === 'POST' && url === '/api/gazette') return handleGazette(req, res);
    if (req.method === 'POST' && url === '/api/tts') return handleTts(req, res);
    if (req.method === 'POST' && url === '/api/stt') return handleStt(req, res);
    if (url === '/api/health') return json(res, 200, { gemini: Boolean(GEMINI_KEY), gradium: Boolean(GRADIUM_KEY), model: GEMINI_MODEL });
    if (req.method === 'GET') return serveStatic(url, res);
    json(res, 404, { error: 'introuvable' });
  };
  route().catch((e: unknown) => {
    console.error('[api]', e);
    if (!res.headersSent) json(res, 500, { error: 'erreur serveur' });
  });
}).listen(PORT, () => console.log(`RAGOTS api sur http://localhost:${PORT} (gemini=${Boolean(GEMINI_KEY)}, gradium=${Boolean(GRADIUM_KEY)})`));
