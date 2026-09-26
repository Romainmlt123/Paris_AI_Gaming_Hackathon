import { CHARACTERS } from '../shared/characters.js';
import { fallbackTalk } from '../shared/fallback.js';
import { cleanIsland, cleanName } from '../shared/player.js';
import { asNpcId, parseTalkResult } from '../shared/validate.js';
import type { NpcId, TalkContext, TalkRequest, TalkResult } from '../shared/types.js';
import { EMOTIONS } from '../shared/types.js';
import { GeminiError, generateJson, json } from './gemini.js';

const TALK_TIMEOUT_MS = 9000;

function systemPrompt(npc: NpcId): string {
  const c = CHARACTERS[npc];
  const others = Object.values(CHARACTERS)
    .filter((o) => o.id !== npc)
    .map((o) => `- ${o.name}, ${o.role}`)
    .join('\n');
  return `You are ${c.name}, ${c.role}, on a small cozy island in the game "RAGOTS" (French for "gossip").
Personality: ${c.personality}
Way of speaking: ${c.voice}
Likes: ${c.likes.join(', ')}. Hates: ${c.dislikes.join(', ')}.
Secret (only reveal it if the relationship is very high, or by accident): ${c.secret}
Other islanders:
${others}

Rules:
- ALWAYS answer in lively, funny, slightly petty spoken English. 1 to 3 short sentences (max 240 characters). No narration, no asterisks. Your line is read aloud in your voice: sprinkle in your verbal tics, interjections and laughs ("heh heh", "hmmph…", "ooh") for a fun delivery.
- No filter: you are not a polite assistant. If the player insults you, provokes you, or the relationship is bad, you answer bluntly with real insults and rude words (in your own style), without apologizing. You may also threaten them.
- The friendship gauge goes from 0% to 100%. Under 35%, every jab makes you raise your hand: you slap them or give them a little smack (you can mention it: "SMACK!"). At 20%, a fight breaks out; at 0%, you kill them. Under 28% you are this close to jumping on them.
- Stay strictly in character. You only know what is in your memories and rumors. You may draw conclusions, but never invent facts about the player.
- If the player denies a fact you know from a rumor, you can call them out (and be offended).
- You PROPOSE, the game decides. Return only this JSON:
{"reply": string, "emotion": one of ${EMOTIONS.join('|')}, "relationDelta": integer between -20 and +10 (change in your affection for the player after THEIR line), "reason": short string in the 2nd person explaining the change (e.g. "You called him cheap"), "events": [{"text": objective 3rd-person fact about what the player just did, only if notable (insult, lie, promise, gift, confidence), "severity": integer -3..3}], "intent": null or a short intention for later, "suggestions": 3 short lines (max 40 characters) the player could say next, varied (one kind, one neutral/curious, one provocative)}
The emotion values are fixed codes: joie=joy, neutre=neutral, colere=anger, tristesse=sadness, surprise=surprise, mefiance=suspicion, amuse=amused.`;
}

function openingLine(message: string, initiative: string | undefined, who: string): string {
  if (!initiative) return `${who}: ${message}`;
  return `(The player said nothing. YOU just walked up to them on your own initiative. Reason: ${initiative}
Start the conversation by speaking first. relationDelta = 0, events = [].)`;
}

function contextPrompt(message: string, ctx: TalkContext, initiative?: string): string {
  const rumors = ctx.knownRumors.length
    ? ctx.knownRumors.map((r) => `- ${r.source === 'vu' ? 'Seen with your own eyes' : `Heard from ${CHARACTERS[r.source].name}`}: ${r.text}`).join('\n')
    : '- (nothing special)';
  const memories = ctx.memories.length ? ctx.memories.map((m) => `- ${m}`).join('\n') : '- (first real conversation)';
  const name = cleanName(ctx.playerName);
  const island = cleanIsland(ctx.islandName);
  const who = name || 'Player';
  const history = ctx.history.map((l) => `${l.who === 'player' ? who : 'You'}: ${l.text}`).join('\n');
  const naming = name
    ? `The player is called ${name}. Use their first name often, naturally (and twist it or mock it if you are angry).\n`
    : '';
  const place = island ? `The island you live on is called ${island} (the player chose this name; drop it in now and then).\n` : '';
  const nude = "The player washed up on the island stark naked on a raft, and is STILL naked: nobody has given them clothes. You can notice it, mock it or be embarrassed by it.\n";
  return `${naming}${place}${nude}Day ${ctx.day}. Player's island value: ${ctx.islandValue}.
Your friendship gauge toward the player: ${Math.round((ctx.relation + 100) / 2)}% (${ctx.tier}). Your mood: ${ctx.emotion}.
${ctx.intent ? `You wanted to talk to them about this: ${ctx.intent}\n` : ''}Your memories of the player:
${memories}
What you know / have heard:
${rumors}
Recent conversation:
${history || '(start)'}
${openingLine(message, initiative, who)}`;
}

function parseRequest(raw: unknown): TalkRequest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const body = raw as Partial<TalkRequest>;
  const npc = asNpcId(body.npc);
  if (!npc || typeof body.message !== 'string' || typeof body.context !== 'object' || body.context === null) return null;
  const initiative = typeof body.initiative === 'string' && body.initiative ? body.initiative.slice(0, 300) : undefined;
  return { npc, message: body.message.slice(0, 300), context: { ...body.context, playerName: cleanName(body.context.playerName), islandName: cleanIsland(body.context.islandName) }, ...(initiative ? { initiative } : {}) };
}

export async function handleTalk(req: Request): Promise<Response> {
  let body: TalkRequest | null;
  try {
    body = parseRequest(await req.json());
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }
  if (!body) return json({ error: 'invalid talk request' }, 400);
  const result = await talkWithAi(body);
  return json(result);
}

async function talkWithAi({ npc, message, context, initiative }: TalkRequest): Promise<TalkResult> {
  try {
    const raw = await generateJson(systemPrompt(npc), contextPrompt(message, context, initiative), TALK_TIMEOUT_MS);
    const parsed = parseTalkResult(raw);
    if (parsed) return parsed;
    console.warn(`[talk] ${npc}: AI output rejected by validation`, JSON.stringify(raw).slice(0, 200));
  } catch (err) {
    if (!(err instanceof GeminiError)) throw err;
    console.warn(`[talk] ${npc}: Gemini failed, using fallback — ${err.message}`);
  }
  return fallbackTalk(npc, message, context);
}
