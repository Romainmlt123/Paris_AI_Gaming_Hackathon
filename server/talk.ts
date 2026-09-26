import { CHARACTERS } from '../shared/characters';
import { fallbackTalk } from '../shared/fallback';
import { asNpcId, parseTalkResult } from '../shared/validate';
import type { NpcId, TalkContext, TalkRequest, TalkResult } from '../shared/types';
import { EMOTIONS } from '../shared/types';
import { GeminiError, generateJson, json } from './gemini';

const TALK_TIMEOUT_MS = 7000;

function systemPrompt(npc: NpcId): string {
  const c = CHARACTERS[npc];
  const others = Object.values(CHARACTERS)
    .filter((o) => o.id !== npc)
    .map((o) => `- ${o.name}, ${o.role}`)
    .join('\n');
  return `Tu incarnes ${c.name}, ${c.role}, sur une petite île cosy du jeu « RAGOTS ».
Personnalité : ${c.personality}
Façon de parler : ${c.voice}
Aime : ${c.likes.join(', ')}. Déteste : ${c.dislikes.join(', ')}.
Secret (ne le révèle que si la relation est très haute, ou par maladresse) : ${c.secret}
Autres habitants :
${others}

Règles :
- Réponds TOUJOURS en français parlé, vivant, drôle, un peu mesquin. 1 à 3 phrases courtes (max 240 caractères). Jamais de narration, pas d'astérisques.
- Reste strictement dans le personnage. Tu ne sais que ce qui figure dans tes souvenirs et rumeurs. Tu peux tirer des conclusions, mais pas inventer de faits sur le joueur.
- Si le joueur nie un fait que tu connais par une rumeur, tu peux le démasquer (et t'en offusquer).
- Tu PROPOSES, le jeu décide. Renvoie uniquement ce JSON :
{"reply": string, "emotion": un de ${EMOTIONS.join('|')}, "relationDelta": entier entre -20 et +10 (variation de ton affection pour le joueur suite à SA réplique), "reason": string courte à la 2e personne expliquant la variation (ex. « Tu l'as traité de radin »), "events": [{"text": fait objectif à la 3e personne sur ce que le joueur vient de faire, seulement si c'est marquant (insulte, mensonge, promesse, cadeau, confidence), "severity": entier -3..3}], "intent": null ou une intention courte pour la suite, "suggestions": 3 répliques courtes (max 40 caractères) que le joueur pourrait dire ensuite, variées (une gentille, une neutre/curieuse, une provocante)}`;
}

function contextPrompt(message: string, ctx: TalkContext): string {
  const rumors = ctx.knownRumors.length
    ? ctx.knownRumors.map((r) => `- ${r.source === 'vu' ? 'Vu de tes yeux' : `Entendu de ${CHARACTERS[r.source].name}`} : ${r.text}`).join('\n')
    : '- (rien de spécial)';
  const memories = ctx.memories.length ? ctx.memories.map((m) => `- ${m}`).join('\n') : '- (première vraie discussion)';
  const history = ctx.history.map((l) => `${l.who === 'player' ? 'Joueur' : 'Toi'} : ${l.text}`).join('\n');
  return `Jour ${ctx.day}. Valeur de l'île du joueur : ${ctx.islandValue}.
Ta relation au joueur : ${ctx.relation}/100 (${ctx.tier}). Ton humeur : ${ctx.emotion}.
${ctx.intent ? `Tu voulais lui parler de ceci : ${ctx.intent}\n` : ''}Tes souvenirs du joueur :
${memories}
Ce que tu sais / as entendu :
${rumors}
Conversation récente :
${history || '(début)'}
Joueur : ${message}`;
}

function parseRequest(raw: unknown): TalkRequest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const body = raw as Partial<TalkRequest>;
  const npc = asNpcId(body.npc);
  if (!npc || typeof body.message !== 'string' || typeof body.context !== 'object' || body.context === null) return null;
  return { npc, message: body.message.slice(0, 300), context: body.context };
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

async function talkWithAi({ npc, message, context }: TalkRequest): Promise<TalkResult> {
  try {
    const raw = await generateJson(systemPrompt(npc), contextPrompt(message, context), TALK_TIMEOUT_MS);
    const parsed = parseTalkResult(raw);
    if (parsed) return parsed;
    console.warn(`[talk] ${npc}: AI output rejected by validation`, JSON.stringify(raw).slice(0, 200));
  } catch (err) {
    if (!(err instanceof GeminiError)) throw err;
    console.warn(`[talk] ${npc}: Gemini failed, using fallback — ${err.message}`);
  }
  return fallbackTalk(npc, message, context);
}
