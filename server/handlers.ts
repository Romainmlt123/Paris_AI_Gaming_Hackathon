// Handlers purs (body -> {status, json}), indépendants du serveur http : branchables tels quels dans api/*.ts (Vercel).
import { env, hasGemini, hasGradium } from './env.ts';
import { generateJson } from './gemini.ts';
import { fallbackTalk } from './fallbacks.ts';
import { buildTalkPrompt, TALK_SCHEMA } from './prompts/talk.ts';
import { buildAbsencePrompt, ABSENCE_SCHEMA } from './prompts/absence.ts';
import { NPC_IDS } from '../src/state/types.ts';
import type { AbsenceRequest, AbsenceResponse, NpcId, TalkRequest, TalkResponse } from '../src/state/types.ts';

/** Réponse JSON (cas général) ou binaire (audio TTS) : les deux formes restent sérialisables côté Vercel. */
export type HandlerResult =
  | { status: number; json: unknown }
  | { status: number; binary: Uint8Array; contentType: string };

const TALK_TIMEOUT_MS = 6000;
const ABSENCE_TIMEOUT_MS = 12000; // plus long : sortie plus riche, et un écran de récap masque l'attente

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isNpcId(v: unknown): v is NpcId {
  return typeof v === 'string' && (NPC_IDS as readonly string[]).includes(v);
}

/** Validation de forme sommaire : le reste est garanti par le client (logic/context.ts). */
function checkTalkRequest(body: unknown): string | null {
  if (!isRecord(body)) return 'body doit être un objet';
  if (!isNpcId(body.npc)) return 'npc invalide';
  if (typeof body.playerText !== 'string' || body.playerText.length > 500) return 'playerText invalide (string ≤ 500)';
  if (body.offeredItemId !== null && typeof body.offeredItemId !== 'string') return 'offeredItemId invalide';
  if (!Array.isArray(body.history) || body.history.length > 30) return 'history invalide (tableau ≤ 30)';
  const ctx = body.context;
  if (!isRecord(ctx)) return 'context manquant';
  if (typeof ctx.relation !== 'number' || typeof ctx.day !== 'number' || typeof ctx.hour !== 'number') return 'context.relation/day/hour invalides';
  for (const key of ['memories', 'knownFacts', 'heardRumors', 'bonds', 'inventory', 'decor'] as const) {
    if (!Array.isArray(ctx[key])) return `context.${key} doit être un tableau`;
  }
  return null;
}

function checkAbsenceRequest(body: unknown): string | null {
  if (!isRecord(body)) return 'body doit être un objet';
  if (typeof body.hours !== 'number' || body.hours <= 0) return 'hours invalide';
  if (typeof body.day !== 'number') return 'day invalide';
  for (const key of ['npcs', 'bonds', 'facts', 'rumors', 'decor'] as const) {
    if (!Array.isArray(body[key])) return `${key} doit être un tableau`;
  }
  return null;
}

export async function handleTalk(body: unknown): Promise<HandlerResult> {
  const invalid = checkTalkRequest(body);
  if (invalid) return { status: 400, json: { error: invalid } };
  const req = body as TalkRequest;

  const { system, user } = buildTalkPrompt(req);
  const result = await generateJson<TalkResponse>(system, user, TALK_SCHEMA, {
    timeoutMs: TALK_TIMEOUT_MS,
    temperature: 0.9,
    label: `talk:${req.npc}`,
  });
  if (!result.ok) return { status: 200, json: fallbackTalk(req) };
  const data = result.data;
  // Typo : le modèle écrit parfois « ... » ; le rendu rétro est plus joli avec « … ».
  if (typeof data.reply === 'string') data.reply = data.reply.replace(/\.\.\./g, '…');
  return { status: 200, json: { ...data, fallback: false } };
}

export async function handleAbsence(body: unknown): Promise<HandlerResult> {
  const invalid = checkAbsenceRequest(body);
  if (invalid) return { status: 400, json: { error: invalid } };
  const req = body as AbsenceRequest;

  const { system, user } = buildAbsencePrompt(req);
  const result = await generateJson<AbsenceResponse>(system, user, ABSENCE_SCHEMA, {
    timeoutMs: ABSENCE_TIMEOUT_MS,
    temperature: 0.9,
    label: 'absence',
  });
  // Le client a sa propre simulation déterministe de repli.
  if (!result.ok) return { status: 503, json: { error: 'simulation IA indisponible' } };
  return { status: 200, json: result.data };
}

export function handleHealth(): HandlerResult {
  return { status: 200, json: { ok: true, model: env.geminiModel, hasGemini, hasGradium } };
}
