import type { AbsenceRequest, TalkRequest } from './state/types';

export type ApiResult = { ok: true; data: unknown } | { ok: false; error: string };

/** POST JSON avec timeout : un appel IA lent ou en panne ne bloque jamais le jeu. */
async function post(path: string, body: unknown, timeoutMs: number): Promise<ApiResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn(`[api] ${path} → HTTP ${res.status}`);
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return { ok: true, data: (await res.json()) as unknown };
  } catch (err) {
    const error = err instanceof DOMException && err.name === 'AbortError' ? 'timeout' : String(err);
    console.warn(`[api] ${path} échoué (${error})`);
    return { ok: false, error };
  } finally {
    clearTimeout(timer);
  }
}

export const talkApi = (req: TalkRequest): Promise<ApiResult> => post('/api/talk', req, 8000);
export const absenceApi = (req: AbsenceRequest): Promise<ApiResult> => post('/api/absence', req, 14000);
