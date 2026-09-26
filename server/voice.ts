import { asNpcId } from '../shared/validate';
import { EMOTIONS, type Emotion } from '../shared/types';
import { json } from './gemini';
import { GradiumError, synthesize, transcribe } from './gradium';

const TTS_TIMEOUT_MS = 8000;
const STT_TIMEOUT_MS = 10000;
const MAX_AUDIO_BYTES = 2_000_000;

function asEmotion(value: unknown): Emotion {
  return EMOTIONS.find((e) => e === value) ?? 'neutre';
}

export async function handleTts(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }
  const body = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const npc = asNpcId(body['npc']);
  const text = body['text'];
  if (!npc || typeof text !== 'string') return json({ error: 'invalid tts request' }, 400);
  try {
    const wav = await synthesize(npc, text, asEmotion(body['emotion']), TTS_TIMEOUT_MS);
    if (!wav) return new Response(null, { status: 204 });
    return new Response(wav, { headers: { 'content-type': 'audio/wav', 'cache-control': 'no-store' } });
  } catch (err) {
    if (!(err instanceof GradiumError)) throw err;
    console.warn(`[tts] ${npc}: Gradium failed — ${err.message}`);
    return json({ error: 'tts unavailable' }, 503);
  }
}

export async function handleStt(req: Request): Promise<Response> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_AUDIO_BYTES) return json({ error: 'invalid audio size' }, 413);
  const audio = new Uint8Array(await req.arrayBuffer());
  if (audio.byteLength < 44 || audio.byteLength > MAX_AUDIO_BYTES) return json({ error: 'invalid audio size' }, 400);
  try {
    return json({ text: await transcribe(audio, STT_TIMEOUT_MS) });
  } catch (err) {
    if (!(err instanceof GradiumError)) throw err;
    console.warn(`[stt] Gradium failed — ${err.message}`);
    return json({ error: 'stt unavailable' }, 503);
  }
}
