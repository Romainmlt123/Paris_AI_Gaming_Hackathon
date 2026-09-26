// Prompt de simulation d'absence : l'île vit pendant que le joueur n'est pas là.
import { CHARACTERS } from './characters.ts';
import { INTENT_KINDS_FOR_SCHEMA, NPC_IDS } from './shared.ts';
import type { GeminiSchema } from '../gemini.ts';
import type { AbsenceRequest } from '../../src/state/types.ts';

const SYSTEM = `Tu es le moteur narratif de RAGOTS, un jeu cozy sur une petite île où trois habitants font circuler des rumeurs sur le joueur.
Tu simules ce qui s'est passé pendant l'absence du joueur. Le code du jeu applique ensuite (et plafonne) ce que tu proposes.

LES HABITANTS :
${NPC_IDS.map((id) => `- ${id} (${CHARACTERS[id].name}, ${CHARACTERS[id].role}) : ${CHARACTERS[id].personality.split('. ').slice(0, 2).join('. ')}.`).join('\n')}

RÈGLES :
- "conversations" : 1 à 3 discussions entre habitants (a ≠ b). Ceux qui s'apprécient (bond élevé) se parlent plus et se confient plus. Josette et Marius se racontent TOUT. "summary" : une phrase au passé.
- "transfers" : rumeurs transmises. "sourceId" DOIT être EXACTEMENT l'id d'un fait ou d'une rumeur fourni(e) ; n'invente jamais d'id. "from" doit connaître l'info (témoin du fait, ou détenteur de la rumeur) ; "to" ne doit pas déjà la connaître. "text" : la version racontée, du point de vue de "to", qui peut être déformée et amplifiée ; "distortion" de 0 (fidèle) à 3 (méconnaissable), plus forte si ça passe par Josette ou si l'histoire est juteuse. Si le fait est grave (insulte, mensonge), il DOIT circuler.
- "bondDeltas" : petites variations entre habitants (-10..10), a ≠ b.
- "relationDeltas" : variations de l'affection des habitants envers le joueur (-10..10) causées par ce qu'ils ont appris, avec une raison courte (≤ 60 caractères) à la 2e personne, visible par le joueur. Ex : « Josette a appris que tu as insulté Marius ».
- "intents" : ce que chaque habitant concerné veut faire à la prochaine visite du joueur (au plus un par habitant). Si Josette a appris une offense contre Marius, elle a l'intention "confront". "text" : sa phrase d'accroche, dans SA voix, courte. "about" : l'id du fait ou de la rumeur concerné(e), ou null.
- "recap" : 3 à 6 lignes courtes (≤ 90 caractères), au passé, drôles et un peu mesquines, racontées par un narrateur commère qui s'adresse au joueur (tutoiement). La première commence exactement par « Pendant ton absence… » (avec le caractère …). Elles doivent refléter les transferts et intentions.
- Français parlé, vivant. N'invente pas de nouveaux faits graves sur le joueur ; brode sur ce qui existe. S'il ne s'est rien passé de notable, raconte des petites anecdotes de la vie de l'île sans transfert.`;

export function buildAbsencePrompt(req: AbsenceRequest): { system: string; user: string } {
  const npcs = req.npcs
    .map((n) => `- ${n.id} : affection pour le joueur ${n.relation}, humeur ${n.mood}. Souvenirs : ${n.memories.length ? n.memories.join(' | ') : 'aucun'}`)
    .join('\n');
  const bonds = req.bonds.map((b) => `- ${b.a}–${b.b} : ${b.value}`).join('\n');
  const facts = req.facts.length
    ? req.facts.map((f) => `- [${f.id}] ${f.text} (témoins : ${f.witnesses.join(', ') || 'aucun'})`).join('\n')
    : '- aucun';
  const rumors = req.rumors.length
    ? req.rumors.map((r) => `- [${r.id}] détenue par ${r.holder} : « ${r.text} » (fait ${r.factId ?? 'inventé'}, déformation ${r.distortion})`).join('\n')
    : '- aucune';
  const user = [
    `Le joueur a été absent ${req.hours} heures (jour ${req.day}).`,
    `HABITANTS :\n${npcs}`,
    `LIENS ENTRE HABITANTS (-100..100) :\n${bonds || '- inconnus'}`,
    `FAITS RÉELS :\n${facts}`,
    `RUMEURS EN CIRCULATION :\n${rumors}`,
    `DÉCORATIONS DE L'ÎLE : ${req.decor.length ? req.decor.join(', ') : 'aucune'}`,
    'Simule l\'absence et réponds en JSON.',
  ].join('\n\n');
  return { system: SYSTEM, user };
}

const npcEnum: GeminiSchema = { type: 'string', enum: NPC_IDS };

export const ABSENCE_SCHEMA: GeminiSchema = {
  type: 'object',
  properties: {
    conversations: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: { a: npcEnum, b: npcEnum, summary: { type: 'string' } },
        required: ['a', 'b', 'summary'],
        propertyOrdering: ['a', 'b', 'summary'],
      },
    },
    transfers: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        properties: {
          from: npcEnum,
          to: npcEnum,
          sourceId: { type: 'string' },
          text: { type: 'string' },
          distortion: { type: 'integer', minimum: 0, maximum: 3 },
        },
        required: ['from', 'to', 'sourceId', 'text', 'distortion'],
        propertyOrdering: ['from', 'to', 'sourceId', 'text', 'distortion'],
      },
    },
    bondDeltas: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: { a: npcEnum, b: npcEnum, delta: { type: 'integer', minimum: -10, maximum: 10 } },
        required: ['a', 'b', 'delta'],
        propertyOrdering: ['a', 'b', 'delta'],
      },
    },
    relationDeltas: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          npc: npcEnum,
          delta: { type: 'integer', minimum: -10, maximum: 10 },
          reason: { type: 'string' },
        },
        required: ['npc', 'delta', 'reason'],
        propertyOrdering: ['npc', 'delta', 'reason'],
      },
    },
    intents: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          npc: npcEnum,
          intent: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: INTENT_KINDS_FOR_SCHEMA },
              text: { type: 'string' },
              about: { type: 'string', nullable: true },
            },
            required: ['kind', 'text', 'about'],
            propertyOrdering: ['kind', 'text', 'about'],
          },
        },
        required: ['npc', 'intent'],
        propertyOrdering: ['npc', 'intent'],
      },
    },
    recap: { type: 'array', minItems: 3, maxItems: 6, items: { type: 'string' } },
  },
  required: ['conversations', 'transfers', 'bondDeltas', 'relationDeltas', 'intents', 'recap'],
  propertyOrdering: ['conversations', 'transfers', 'bondDeltas', 'relationDeltas', 'intents', 'recap'],
};
