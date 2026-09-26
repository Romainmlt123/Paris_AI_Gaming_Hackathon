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
  candidates?: { content?: { parts?: GeminiPart[] } }[];
}

/** Calls Gemini in JSON mode and returns the parsed JSON. Throws GeminiError on any failure. */
export async function generateJson(system: string, user: string, timeoutMs: number): Promise<unknown> {
  const key = geminiKey();
  if (!key) throw new GeminiError('missing GEMINI_API_KEY');
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
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  try {
    return JSON.parse(text);
  } catch {
    throw new GeminiError(`invalid JSON: ${text.slice(0, 120)}`);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
