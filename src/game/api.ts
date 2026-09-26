import type { AbsenceReport, ChatTurn, Gazette, NpcContext, NpcId, TalkResponse } from '../state/types.ts';
import { fallbackResponse, validateTalkResponse } from '../logic/validate.ts';
import { NPCS } from '../data/npcs.ts';

async function post(url: string, body: unknown, timeoutMs: number): Promise<Response> {
  return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
}

/** Ne rejette jamais : en cas d'échec ou de lenteur, réplique de secours. */
export async function talk(npc: NpcId, playerText: string, context: NpcContext, history: ChatTurn[], offeredItemId: string | null, playerName: string): Promise<TalkResponse> {
  try {
    const res = await post('/api/talk', { npc, playerText, context, history, offeredItemId, playerName }, 9000);
    if (!res.ok) throw new Error(String(res.status));
    const raw = (await res.json()) as unknown;
    const out = validateTalkResponse(raw, npc, context, playerText);
    if (raw && typeof raw === 'object' && 'fallback' in raw && (raw as { fallback?: unknown }).fallback === true) out.fallback = true;
    return out;
  } catch {
    return fallbackResponse(npc, context, playerText);
  }
}

export async function gazette(report: AbsenceReport, playerName: string, islandValue: number): Promise<Gazette> {
  try {
    const res = await post('/api/gazette', { report, playerName, islandValue }, 10000);
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as Gazette;
  } catch {
    const t = report.transfers[0];
    return {
      headline: t ? `${NPCS[t.from].name} n'a pas su tenir sa langue !` : "Calme plat sur l'île",
      articles: report.lines.slice(0, 3).map((l, i) => ({ title: ['À la une', 'Radio-coquillage', 'Brèves'][i] ?? 'Brève', body: l })),
      fallback: true,
    };
  }
}

export async function tts(npc: NpcId, text: string): Promise<Blob | null> {
  try {
    const res = await post('/api/tts', { npc, text }, 9000);
    return res.ok ? await res.blob() : null;
  } catch {
    return null;
  }
}

export async function stt(wav: Blob): Promise<string> {
  try {
    const res = await fetch('/api/stt', { method: 'POST', body: wav, headers: { 'content-type': 'audio/wav' }, signal: AbortSignal.timeout(14000) });
    if (!res.ok) return '';
    const j = (await res.json()) as { text?: string };
    return j.text ?? '';
  } catch {
    return '';
  }
}
