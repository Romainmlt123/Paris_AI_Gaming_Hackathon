// Appel REST minimal à Gemini (generateContent + sortie JSON structurée). Ne throw jamais.
import { env, hasGemini } from './env.ts';

/** Sous-ensemble OpenAPI accepté par generationConfig.responseSchema. */
export interface GeminiSchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: readonly string[];
  nullable?: boolean;
  items?: GeminiSchema;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  properties?: Record<string, GeminiSchema>;
  required?: readonly string[];
  propertyOrdering?: readonly string[];
}

export type GeminiResult<T> =
  | { ok: true; data: T; ms: number }
  | { ok: false; error: string; ms: number };

export interface GenerateOptions {
  timeoutMs?: number;
  temperature?: number;
  label?: string; // pour les logs
}

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Si le modèle refuse thinkingConfig (400), on retente sans et on s'en souvient.
let thinkingSupported = env.geminiThinkingLevel !== '';

interface GeminiPart {
  text?: string;
  thought?: boolean;
}
interface GeminiApiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

function buildBody(system: string, user: string, schema: GeminiSchema, temperature: number): string {
  const generationConfig: Record<string, unknown> = {
    temperature,
    responseMimeType: 'application/json',
    responseSchema: schema,
    maxOutputTokens: 2048,
  };
  if (thinkingSupported) {
    generationConfig.thinkingConfig = { thinkingLevel: env.geminiThinkingLevel };
  }
  return JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig,
  });
}

function extractText(payload: GeminiApiResponse): { text: string } | { error: string } {
  if (payload.promptFeedback?.blockReason) {
    return { error: `prompt bloqué (${payload.promptFeedback.blockReason})` };
  }
  const candidate = payload.candidates?.[0];
  if (!candidate) return { error: 'aucun candidat dans la réponse' };
  const text = (candidate.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
  if (!text) return { error: `réponse vide (finishReason=${candidate.finishReason ?? '?'})` };
  return { text };
}

interface RawResponse {
  status: number;
  text: string;
}

/** Le timeout couvre la requête ET la lecture du corps. */
async function callOnce(url: string, body: string, timeoutMs: number): Promise<RawResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.geminiApiKey },
      body,
      signal: controller.signal,
    });
    return { status: res.status, text: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

export async function generateJson<T>(
  system: string,
  user: string,
  schema: GeminiSchema,
  opts: GenerateOptions = {},
): Promise<GeminiResult<T>> {
  const label = opts.label ?? 'gemini';
  const timeoutMs = opts.timeoutMs ?? 6000;
  const start = Date.now();
  const fail = (error: string): GeminiResult<T> => {
    const ms = Date.now() - start;
    console.error(`[${label}] échec en ${ms} ms : ${error}`);
    return { ok: false, error, ms };
  };

  if (!hasGemini) return fail('GEMINI_API_KEY absente');

  const url = `${API_BASE}/${encodeURIComponent(env.geminiModel)}:generateContent`;
  const temperature = opts.temperature ?? 0.9;

  let res: RawResponse;
  try {
    res = await callOnce(url, buildBody(system, user, schema, temperature), timeoutMs);
    if (res.status === 400 && thinkingSupported && /thinking/i.test(res.text)) {
      console.warn(`[${label}] thinkingConfig refusé par ${env.geminiModel}, nouvel essai sans.`);
      thinkingSupported = false;
      const remaining = Math.max(1000, timeoutMs - (Date.now() - start));
      res = await callOnce(url, buildBody(system, user, schema, temperature), remaining);
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return fail(`timeout après ${timeoutMs} ms`);
    return fail(`erreur réseau : ${err instanceof Error ? err.message : String(err)}`);
  }

  const raw = res.text;
  if (res.status !== 200) return fail(`HTTP ${res.status} : ${raw.replace(/\s+/g, ' ').slice(0, 300)}`);

  let payload: GeminiApiResponse;
  try {
    payload = JSON.parse(raw) as GeminiApiResponse;
  } catch {
    return fail(`enveloppe API non JSON : ${raw.slice(0, 200)}`);
  }
  const extracted = extractText(payload);
  if ('error' in extracted) return fail(extracted.error);

  let data: T;
  try {
    data = JSON.parse(extracted.text) as T;
  } catch {
    return fail(`JSON du modèle invalide : ${extracted.text.slice(0, 200)}`);
  }
  const ms = Date.now() - start;
  console.log(`[${label}] ok en ${ms} ms (${env.geminiModel})`);
  return { ok: true, data, ms };
}
