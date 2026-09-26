import { fallbackTalk } from '../shared/fallback';
import { mergeSim, simulateFallback } from '../shared/simulate';
import { parseSimResult, parseTalkResult } from '../shared/validate';
import type { GameState, NpcId, SimRequest, SimResult, TalkContext, TalkResult } from '../shared/types';

const CLIENT_TIMEOUT_MS = 9000;

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
