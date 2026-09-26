// Prompt de conversation : fiche + contexte construit par le code + échange en cours.
import { EMOTIONS, INTENT_KINDS_FOR_SCHEMA, TALK_EVENTS_FOR_SCHEMA } from './shared.ts';
import { CHARACTERS, formatSheet } from './characters.ts';
import type { GeminiSchema } from '../gemini.ts';
import type { NpcContext, TalkRequest } from '../../src/state/types.ts';

const COMMON_RULES = `RÈGLES DU JEU (impératives) :
- Tu joues ce personnage dans RAGOTS, un jeu cozy sur une petite île. Reste TOUJOURS dans le personnage. Ne dis jamais que tu es une IA.
- Français parlé, vivant, drôle, un peu mesquin. Tu tutoies le joueur.
- "reply" : 1 à 3 phrases COURTES maximum (écran de téléphone), 220 caractères max. Pas de didascalies entre astérisques, pas de guillemets autour de la réplique. Utilise le caractère « … » (jamais « ... »).
- Tu ne connais QUE ce qui figure dans le contexte (souvenirs, faits vus, rumeurs entendues). N'invente pas de faits sur le joueur.
- Ne propose, ne donne et ne mentionne jamais d'objet qui n'est ni dans l'inventaire du joueur ni dans le catalogue fourni.
- "emotion" : ton émotion après cette réplique.
- "relationDelta" : entier de -15 à 15, ce que cette réplique du joueur change à ton affection pour lui. 0 si c'est banal. Petit (±1 à ±4) pour une gentillesse ou une pique légère, fort (±8 à ±15) pour une insulte, un mensonge démasqué, un beau cadeau ou des excuses sincères.
- "reason" : raison courte (≤ 60 caractères), VISIBLE PAR LE JOUEUR, à la 2e personne, concrète et un peu piquante. Ex : « Tu l'as traité de vieux radoteur », « Tu lui as offert une pomme », « Tu lui as menti en face ». Chaîne vide si relationDelta vaut 0.
- "events" : faits OBJECTIFS survenus dans CETTE réplique du joueur (souvent aucun : tableau vide). Types : insult (le joueur insulte ou se moque méchamment), compliment (sincère), flattery (flatterie intéressée), lie (le joueur nie ou contredit un fait que tu as vu ou une rumeur que tu as entendue, ou affirme une chose que tu sais fausse), gift (il offre un objet), promise, threat, apology, deal (une transaction est conclue ou proposée), confession (il avoue une faute), question (il demande une info ou un conseil), other. "text" : description neutre à la 3e personne, ex : « Le joueur a traité Marius de vieux radoteur. »
- "intent" : null en général. Remplis-le seulement si, suite à cet échange, tu comptes revenir vers le joueur plus tard (kind parmi confront, gossip, thank, ask, offer, mock ; text = ta phrase d'accroche ; about = null).
- "suggestions" : exactement 3 répliques que le JOUEUR pourrait te répondre maintenant, ≤ 40 caractères chacune, contextuelles, variées : 1) une gentille, 2) une mesquine, 3) une drôle. Écrites à la 1re personne du joueur, qui te tutoie.
- "deal" : null, sauf règle spéciale ci-dessous.`;

const LIE_RULE = `DÉTECTION DE MENSONGE (très important) :
Si le joueur nie ou minimise quelque chose que tu as vu (faits) ou qu'on t'a raconté (rumeurs), NE LE CROIS PAS. Confronte-le à ce que tu sais, en citant ta source (qui te l'a raconté), avec ta voix et une formule neuve. Mets un event "lie", une émotion colere ou mefiance, un relationDelta de -15 (le maximum : on ne ment pas à quelqu'un qui sait) et une raison du genre « Tu lui as menti en face ». S'il avoue au contraire et s'excuse, sois touché mais pas naïf : event confession/apology, delta légèrement positif.`;

const DEAL_RULE = `RÈGLE MARCHAND (toi seul, Gaston) :
Tu vends et rachètes des objets. Si une transaction est discutée (achat, vente, marchandage, objet tendu pour être vendu), remplis "deal" : itemId EXACTEMENT parmi le catalogue ou l'inventaire du joueur, direction du point de vue du JOUEUR ("buy" = il t'achète, "sell" = il te vend), qty, price = prix TOTAL que tu proposes. Pars des prix de référence : à la vente tu gonfles (+10 à +40 %), au rachat tu radines (-20 à -50 %). Si le joueur flatte avec finesse ou négocie bien, lâche un peu. Si la flatterie est grossière ou s'il t'insulte, durcis. Si aucune transaction n'est discutée : deal = null.`;

function describeContext(ctx: NpcContext): string {
  const lines: string[] = [];
  lines.push(`Jour ${ctx.day}, ${Math.floor(ctx.hour)}h. Ton humeur actuelle : ${ctx.mood}.`);
  lines.push(`Ta relation au joueur : ${ctx.relation} sur une échelle de -100 à 100 (palier « ${ctx.tier} »). Adapte ta chaleur en conséquence.`);
  lines.push(section('Tes souvenirs du joueur', ctx.memories));
  lines.push(section('Ce que tu as VU de tes yeux (vrai)', ctx.knownFacts));
  lines.push(section("Ce qu'on t'a RACONTÉ (tu y crois, même si c'est peut-être déformé)", ctx.heardRumors));
  if (ctx.bonds.length) {
    const bonds = ctx.bonds.map((b) => `${CHARACTERS[b.npc].name} : ${b.value}`).join(', ');
    lines.push(`Ton affection pour les autres habitants (-100..100) : ${bonds}.`);
  }
  const inv = ctx.inventory.map((i) => `${i.name} ×${i.qty} [${i.itemId}]`);
  lines.push(section('Inventaire du joueur', inv));
  if (ctx.shopPrices?.length) {
    const shop = ctx.shopPrices.map((p) => `${p.name} [${p.itemId}] : vente ${p.price}, rachat ${p.sellPrice}`);
    lines.push(section('Catalogue et prix de référence (clochettes)', shop));
  }
  lines.push(`Décorations posées sur l'île : ${ctx.decor.length ? ctx.decor.join(', ') : 'aucune'}. Valeur de l'île : ${ctx.islandValue}.`);
  if (ctx.playerStung) {
    lines.push("ATTENTION : le joueur a le visage tout gonflé (piqué par une ruche en secouant un arbre). Ça se voit. Réagis-y selon ton caractère.");
  }
  return lines.join('\n');
}

function section(title: string, items: string[]): string {
  return items.length ? `${title} :\n${items.map((i) => `- ${i}`).join('\n')}` : `${title} : rien.`;
}

export function buildTalkPrompt(req: TalkRequest): { system: string; user: string } {
  const sheet = CHARACTERS[req.npc];
  const rules = [formatSheet(sheet), COMMON_RULES, LIE_RULE];
  if (req.npc === 'gaston') rules.push(DEAL_RULE);
  else rules.push('"deal" vaut toujours null pour toi : tu n\'es pas marchand.');

  const parts: string[] = [`CONTEXTE :\n${describeContext(req.context)}`];

  const intent = req.context.intent;
  if (intent) {
    parts.push(
      `C'EST TOI QUI ES VENU VOIR LE JOUEUR de toi-même (intention « ${intent.kind} » : ${intent.text}). ` +
        'Si la conversation commence, ta réplique doit d\'abord exprimer cette intention, avec ta voix.',
    );
  }

  if (req.history.length) {
    const hist = req.history.map((t) => `${t.who === 'player' ? 'Joueur' : sheet.name} : ${t.text}`).join('\n');
    parts.push(`CONVERSATION EN COURS :\n${hist}`);
  } else {
    parts.push('La conversation commence à l\'instant.');
  }

  if (req.offeredItemId) {
    const item = req.context.inventory.find((i) => i.itemId === req.offeredItemId);
    const name = item?.name ?? req.context.shopPrices?.find((p) => p.itemId === req.offeredItemId)?.name ?? req.offeredItemId;
    parts.push(`Le joueur te tend un objet : ${name} [${req.offeredItemId}]. Réagis selon tes goûts.`);
  }

  const said = req.playerText.trim();
  parts.push(said ? `LE JOUEUR TE DIT MAINTENANT : « ${said} »` : 'Le joueur s\'approche sans rien dire. Tu parles en premier.');
  parts.push(`Réponds en JSON, en tant que ${sheet.name}.`);

  return { system: rules.join('\n\n'), user: parts.join('\n\n') };
}

export const TALK_SCHEMA: GeminiSchema = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: '1 à 3 phrases courtes, dans la voix du personnage' },
    emotion: { type: 'string', enum: EMOTIONS },
    events: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: TALK_EVENTS_FOR_SCHEMA },
          text: { type: 'string' },
        },
        required: ['kind', 'text'],
        propertyOrdering: ['kind', 'text'],
      },
    },
    relationDelta: { type: 'integer', minimum: -15, maximum: 15 },
    reason: { type: 'string', description: 'raison courte visible par le joueur, vide si delta = 0' },
    intent: {
      type: 'object',
      nullable: true,
      properties: {
        kind: { type: 'string', enum: INTENT_KINDS_FOR_SCHEMA },
        text: { type: 'string' },
        about: { type: 'string', nullable: true },
      },
      required: ['kind', 'text', 'about'],
      propertyOrdering: ['kind', 'text', 'about'],
    },
    suggestions: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string' } },
    deal: {
      type: 'object',
      nullable: true,
      properties: {
        itemId: { type: 'string' },
        direction: { type: 'string', enum: ['buy', 'sell'] },
        qty: { type: 'integer', minimum: 1 },
        price: { type: 'integer', minimum: 0 },
      },
      required: ['itemId', 'direction', 'qty', 'price'],
      propertyOrdering: ['itemId', 'direction', 'qty', 'price'],
    },
  },
  required: ['reply', 'emotion', 'events', 'relationDelta', 'reason', 'intent', 'suggestions', 'deal'],
  propertyOrdering: ['reply', 'emotion', 'events', 'relationDelta', 'reason', 'intent', 'suggestions', 'deal'],
};
