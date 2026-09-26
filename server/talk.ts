import { CHARACTERS } from '../shared/characters';
import { fallbackTalk } from '../shared/fallback';
import { cleanIsland, cleanName } from '../shared/player';
import { asNpcId, parseTalkResult } from '../shared/validate';
import type { NpcId, TalkContext, TalkRequest, TalkResult } from '../shared/types';
import { EMOTIONS } from '../shared/types';
import { GeminiError, generateJson, json } from './gemini';

const TALK_TIMEOUT_MS = 9000;

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
- Réponds TOUJOURS en français parlé, vivant, drôle, mesquin. 1 à 3 phrases courtes (max 240 caractères). Jamais de narration, pas d'astérisques. Ta réplique est lue à voix haute avec ton accent : glisse tes tics d'accent, des onomatopées et des rires (« hé hé », « pfff… », « ooh ») pour une intonation drôle.
- Aucun filtre : tu n'es pas un assistant poli. Si le joueur t'insulte, te provoque ou si la relation est mauvaise, tu réponds cash avec de vraies insultes et grossièretés (dans ton style), sans t'excuser. Tu peux aussi le menacer.
- La jauge d'amitié va de 0 % à 100 %. Sous 35 %, chaque pique te fait lever la main : tu lui colles une baffe ou une petite tape (tu peux l'évoquer : « PAF ! »). À 20 %, une bagarre éclate ; à 0 %, tu le tues. Sous 28 % tu es à deux doigts de lui sauter dessus.
- Reste strictement dans le personnage. Tu ne sais que ce qui figure dans tes souvenirs et rumeurs. Tu peux tirer des conclusions, mais pas inventer de faits sur le joueur.
- Si le joueur nie un fait que tu connais par une rumeur, tu peux le démasquer (et t'en offusquer).
- Tu PROPOSES, le jeu décide. Renvoie uniquement ce JSON :
{"reply": string, "emotion": un de ${EMOTIONS.join('|')}, "relationDelta": entier entre -20 et +10 (variation de ton affection pour le joueur suite à SA réplique), "reason": string courte à la 2e personne expliquant la variation (ex. « Tu l'as traité de radin »), "events": [{"text": fait objectif à la 3e personne sur ce que le joueur vient de faire, seulement si c'est marquant (insulte, mensonge, promesse, cadeau, confidence), "severity": entier -3..3}], "intent": null ou une intention courte pour la suite, "suggestions": 3 répliques courtes (max 40 caractères) que le joueur pourrait dire ensuite, variées (une gentille, une neutre/curieuse, une provocante)}`;
}

function openingLine(message: string, initiative: string | undefined, who: string): string {
  if (!initiative) return `${who} : ${message}`;
  return `(Le joueur n'a rien dit. C'est TOI qui viens de le rejoindre de ta propre initiative. Raison : ${initiative}
Lance la conversation en parlant le premier. relationDelta = 0, events = [].)`;
}

function contextPrompt(message: string, ctx: TalkContext, initiative?: string): string {
  const rumors = ctx.knownRumors.length
    ? ctx.knownRumors.map((r) => `- ${r.source === 'vu' ? 'Vu de tes yeux' : `Entendu de ${CHARACTERS[r.source].name}`} : ${r.text}`).join('\n')
    : '- (rien de spécial)';
  const memories = ctx.memories.length ? ctx.memories.map((m) => `- ${m}`).join('\n') : '- (première vraie discussion)';
  const name = cleanName(ctx.playerName);
  const island = cleanIsland(ctx.islandName);
  const who = name || 'Joueur';
  const history = ctx.history.map((l) => `${l.who === 'player' ? who : 'Toi'} : ${l.text}`).join('\n');
  const naming = name
    ? `Le joueur s'appelle ${name}. Appelle-le souvent par son prénom, naturellement (et déforme-le ou moque-le si tu es fâché).\n`
    : '';
  const place = island ? `L'île où vous vivez s'appelle ${island} (ce nom a été choisi par le joueur, glisse-le parfois).\n` : '';
  const nude = "Le joueur est arrivé sur l'île tout nu, sur un radeau, et il est TOUJOURS tout nu : personne ne lui a donné de vêtements. Tu peux le remarquer, t'en moquer ou en être gêné.\n";
  return `${naming}${place}${nude}Jour ${ctx.day}. Valeur de l'île du joueur : ${ctx.islandValue}.
Ta jauge d'amitié envers le joueur : ${Math.round((ctx.relation + 100) / 2)} % (${ctx.tier}). Ton humeur : ${ctx.emotion}.
${ctx.intent ? `Tu voulais lui parler de ceci : ${ctx.intent}\n` : ''}Tes souvenirs du joueur :
${memories}
Ce que tu sais / as entendu :
${rumors}
Conversation récente :
${history || '(début)'}
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
