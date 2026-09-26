import { fallbackTalk } from '../shared/fallback';
import { mergeSim, simulateFallback } from '../shared/simulate';
import { parseSimResult, parseTalkResult } from '../shared/validate';
import type { GameState, NpcId, SimRequest, SimResult, TalkContext, TalkResult } from '../shared/types';

const CLIENT_TIMEOUT_MS = 11000;

async function post(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

/** Never throws: any network/API problem falls back to a scripted reply. */
export async function talk(npc: NpcId, message: string, context: TalkContext): Promise<TalkResult> {
  try {
    const parsed = parseTalkResult(await post('/api/talk', { npc, message, context }, CLIENT_TIMEOUT_MS));
    if (parsed) return parsed;
    console.warn('[api] talk: invalid response, using fallback');
  } catch (err) {
    console.warn(`[api] talk failed, using fallback — ${describe(err)}`);
  }
  return fallbackTalk(npc, message, context);
}

/** Line an NPC opens with when it walks up by itself. Never throws: falls back to the scripted line. */
export async function initiativeLine(npc: NpcId, context: TalkContext, reason: string, fallback: TalkResult): Promise<TalkResult> {
  try {
    const parsed = parseTalkResult(await post('/api/talk', { npc, message: '', context, initiative: reason }, CLIENT_TIMEOUT_MS));
    if (parsed) return { ...parsed, suggestions: parsed.suggestions.length ? parsed.suggestions : fallback.suggestions };
  } catch (err) {
    console.warn(`[api] initiative failed, using scripted line — ${describe(err)}`);
  }
  return fallback;
}

export async function simulate(state: GameState, req: SimRequest): Promise<SimResult> {
  const rules = simulateFallback(state, req.hours);
  try {
    const parsed = parseSimResult(await post('/api/simulate', req, CLIENT_TIMEOUT_MS + 2000));
    if (parsed) return mergeSim(parsed, rules);
    console.warn('[api] simulate: AI unavailable or invalid, using code-only simulation');
  } catch (err) {
    console.warn(`[api] simulate failed, using fallback — ${describe(err)}`);
  }
  return rules;
}
