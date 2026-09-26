import { CHARACTERS } from '../shared/characters';
import { cleanIsland, cleanName } from '../shared/player';
import { parseSimResult } from '../shared/validate';
import type { SimRequest, SimResult } from '../shared/types';
import { GeminiError, generateJson, json } from './gemini';

const SIM_TIMEOUT_MS = 9000;

const SYSTEM = `You are the hidden narrator of the island in the game "RAGOTS". The player has been away; you simulate what the islanders did among themselves.
Islanders:
${Object.values(CHARACTERS)
  .map((c) => `- id "${c.id}": ${c.name}, ${c.role}. ${c.personality}`)
  .join('\n')}

Rules:
- Funny, slightly petty spoken English. Short summaries (max 160 characters), in the past tense.
- An islander can ONLY pass on facts they already know (see the "who knows what" list). Use exactly the factIds provided.
- Rumors get a little distorted with each retelling (exaggeration, invented detail, change of tone), but stay recognizable.
- Josette is the gossip hub: she repeats everything. Marius tells Josette everything. Gaston repeats whatever suits him.
- You PROPOSE, the game checks and decides the consequences. Return only this JSON:
{"conversations": [{"a": id, "b": id, "summary": string}], "transfers": [{"from": id, "to": id, "factId": string, "text": the retold version of the rumor}], "intents": [{"npc": id, "text": what this islander wants to say/ask the player when they return}], "bondChanges": [{"a": id, "b": id, "delta": integer -15..15}], "thoughts": [{"npc": id, "text": what this islander secretly thinks of the player this morning, one first-person sentence, funny and petty, in their own voice}]}
One thought per islander (3 in total).
2 to 4 conversations, in chronological order.`;

function userPrompt(req: SimRequest): string {
  const facts = req.facts.length
    ? req.facts.map((f) => `- ${f.id} (severity ${f.severity}${f.aboutPlayer ? ', about the player' : ''}): ${f.text}`).join('\n')
    : '- (nothing notable)';
  const rumors = req.rumors.length ? req.rumors.map((r) => `- ${r.holder} knows ${r.factId}: "${r.text}"`).join('\n') : '- nobody';
  const bonds = Object.entries(req.bonds).map(([k, v]) => `- ${k}: ${v}/100`).join('\n');
  const relations = Object.entries(req.relations).map(([k, v]) => `- ${k} → player: ${v}/100`).join('\n');
  const name = cleanName(req.playerName);
  const island = cleanIsland(req.islandName);
  return `${name ? `The player is called ${name}: use their first name in summaries and intents.\n` : ''}${island ? `The island is called ${island}.\n` : ''}Player away for: ${req.hours} hours (day ${req.day}).
Real facts:
${facts}
Who knows what:
${rumors}
Affinities between islanders:
${bonds}
Relations to the player:
${relations}`;
}

export async function handleSimulate(req: Request): Promise<Response> {
  let body: SimRequest;
  try {
    body = (await req.json()) as SimRequest;
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }
  if (!Array.isArray(body.facts) || !Array.isArray(body.rumors) || typeof body.hours !== 'number') {
    return json({ error: 'invalid simulate request' }, 400);
  }
  return json(await simulateWithAi(body));
}

/** Returns an AI proposal, or `{ source: 'fallback' }` so the client runs the code-only simulation. */
async function simulateWithAi(req: SimRequest): Promise<SimResult | { source: 'fallback' }> {
  try {
    const parsed = parseSimResult(await generateJson(SYSTEM, userPrompt(req), SIM_TIMEOUT_MS));
    if (parsed) return parsed;
    console.warn('[simulate] AI output rejected by validation');
  } catch (err) {
    if (!(err instanceof GeminiError)) throw err;
    console.warn(`[simulate] Gemini failed, client will use fallback — ${err.message}`);
  }
  return { source: 'fallback' };
}
