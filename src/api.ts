import { parseSimResult, parseTalkResult } from '../shared/validate';
import type { NpcId, SimRequest, SimResult, TalkContext, TalkResult } from '../shared/types';

const TALK_TIMEOUT_MS = 16000;
const SIM_TIMEOUT_MS = 24000;
const ATTEMPTS = 2;

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

/** Calls an AI route until it returns a valid result. Throws when the AI stays unavailable. */
async function callAi<T>(path: string, body: unknown, timeoutMs: number, parse: (raw: unknown) => T | null): Promise<T> {
  let last: unknown = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const parsed = parse(await post(path, body, timeoutMs));
      if (parsed) return parsed;
      last = new Error(`${path} → invalid response`);
    } catch (err) {
      last = err;
    }
    console.warn(`[api] ${path} attempt ${attempt} failed — ${describe(last)}`);
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export function talk(npc: NpcId, message: string, context: TalkContext): Promise<TalkResult> {
  return callAi('/api/talk', { npc, message, context }, TALK_TIMEOUT_MS, parseTalkResult);
}

/** Line an NPC opens a conversation with, generated from `reason`. */
export function initiativeLine(npc: NpcId, context: TalkContext, reason: string): Promise<TalkResult> {
  return callAi('/api/talk', { npc, message: '', context, initiative: reason }, TALK_TIMEOUT_MS, parseTalkResult);
}

export function simulate(req: SimRequest): Promise<SimResult> {
  return callAi('/api/simulate', req, SIM_TIMEOUT_MS, parseSimResult);
}
