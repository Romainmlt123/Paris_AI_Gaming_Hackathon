import { CHARACTERS } from '../shared/characters';
import { cleanIsland, cleanName } from '../shared/player';
import { parseSimResult } from '../shared/validate';
import type { SimRequest, SimResult } from '../shared/types';
import { GeminiError, generateJson, json } from './gemini';

const SIM_TIMEOUT_MS = 9000;

const SYSTEM = `Tu es le narrateur caché de l'île du jeu « RAGOTS ». Le joueur s'est absenté ; tu simules ce que les habitants ont fait entre eux.
Habitants :
${Object.values(CHARACTERS)
  .map((c) => `- id "${c.id}" : ${c.name}, ${c.role}. ${c.personality}`)
  .join('\n')}

Règles :
- Français parlé, drôle, un peu mesquin. Résumés courts (max 160 caractères), au passé composé.
- Un habitant ne peut transmettre QUE des faits qu'il connaît déjà (voir la liste « qui sait quoi »). Utilise exactement les factId fournis.
- Les rumeurs se déforment un peu à chaque transmission (exagération, détail inventé, changement de ton), mais restent reconnaissables.
- Josette est le hub des ragots : elle répète tout. Marius raconte tout à Josette. Gaston répète ce qui l'arrange.
- Tu PROPOSES, le jeu vérifie et décide des conséquences. Renvoie uniquement ce JSON :
{"conversations": [{"a": id, "b": id, "summary": string}], "transfers": [{"from": id, "to": id, "factId": string, "text": version racontée de la rumeur}], "intents": [{"npc": id, "text": ce que cet habitant veut dire/demander au joueur à son retour}], "bondChanges": [{"a": id, "b": id, "delta": entier -15..15}], "thoughts": [{"npc": id, "text": ce que cet habitant pense en secret du joueur ce matin, une phrase à la première personne, drôle et mesquine, dans sa voix, EN ANGLAIS (pour la Gazette, publiée en anglais)}]}
Une pensée par habitant (3 au total).
2 à 4 conversations, dans l'ordre chronologique.`;

function userPrompt(req: SimRequest): string {
  const facts = req.facts.length
    ? req.facts.map((f) => `- ${f.id} (gravité ${f.severity}${f.aboutPlayer ? ', concerne le joueur' : ''}) : ${f.text}`).join('\n')
    : '- (rien de notable)';
  const rumors = req.rumors.length ? req.rumors.map((r) => `- ${r.holder} connaît ${r.factId} : « ${r.text} »`).join('\n') : '- personne';
  const bonds = Object.entries(req.bonds).map(([k, v]) => `- ${k} : ${v}/100`).join('\n');
  const relations = Object.entries(req.relations).map(([k, v]) => `- ${k} → joueur : ${v}/100`).join('\n');
  const name = cleanName(req.playerName);
  const island = cleanIsland(req.islandName);
  return `${name ? `Le joueur s'appelle ${name} : utilise son prénom dans les résumés et intentions.\n` : ''}${island ? `L'île s'appelle ${island}.\n` : ''}Absence du joueur : ${req.hours} heures (jour ${req.day}).
Faits réels :
${facts}
Qui sait quoi :
${rumors}
Affinités entre habitants :
${bonds}
Relations au joueur :
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
