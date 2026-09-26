const DEFAULT_MODEL = 'gemini-3.8-flash';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export function geminiKey(): string | null {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_STUDIO_KEY || null;
}

export class GeminiError extends Error {}

const SAFETY_OFF = [
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
  'HARM_CATEGORY_CIVIC_INTEGRITY',
].map((category) => ({ category, threshold: 'OFF' }));

interface GeminiPart {
  text?: string;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
}

const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 7000;

/**
 * Calls Gemini in JSON mode and returns the value accepted by `accept`.
 * Retries empty, malformed or rejected outputs and transient HTTP errors, all within `timeoutMs`.
 */
export async function generateJson<T>(system: string, user: string, timeoutMs: number, accept: (raw: unknown) => T | null): Promise<T> {
  const key = geminiKey();
  if (!key) throw new GeminiError('missing GEMINI_API_KEY');
  const deadline = Date.now() + timeoutMs;
  let last = new GeminiError('no attempt');
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const left = deadline - Date.now();
    if (left < 500) break;
    try {
      const value = accept(await callOnce(key, system, user, Math.min(left, ATTEMPT_TIMEOUT_MS)));
      if (value !== null) return value;
      last = new GeminiError('output rejected by validation');
    } catch (err) {
      if (!(err instanceof GeminiError)) throw err;
      last = err;
      if (/^HTTP (400|401|403|404)/.test(err.message)) break;
    }
    console.warn(`[gemini] attempt ${attempt} failed — ${last.message}`);
  }
  throw last;
}

async function callOnce(key: string, system: string, user: string, timeoutMs: number): Promise<unknown> {
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        safetySettings: SAFETY_OFF,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 1,
          thinkingConfig: { thinkingLevel: 'low' },
        },
      }),
    });
  } catch (err) {
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw new GeminiError(`network/timeout (${reason})`);
  }
  if (!response.ok) throw new GeminiError(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = (await response.json()) as GeminiResponse;
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  try {
    return JSON.parse(text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
  } catch {
    throw new GeminiError(`invalid JSON (finishReason ${candidate?.finishReason ?? 'none'}): ${text.slice(0, 120)}`);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
