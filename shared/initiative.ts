import { CHARACTERS } from './characters';
import { CONFRONT_SUGGESTIONS, openerLine } from './opener';
import { hashString, pick } from './rng';
import type { Emotion, GameState, NpcId, TalkResult } from './types';
import { NPC_IDS } from './types';
import { percentOf } from './violence';

/** Something about the player (or the NPC's own feelings) that makes an NPC walk up by itself. */
export type Trigger = 'nu' | 'rumeur' | 'colere' | 'ami' | 'fauche' | 'riche' | 'celebre' | 'immobile' | 'nuit';

export const IDLE_TRIGGER_SEC = 45;
const BROKE_COINS = 100;
const RICH_COINS = 2000;
const FAMOUS_VALUE = 200;

export interface Initiative {
  npc: NpcId;
  trigger: Trigger;
  /** Why the NPC comes, for the AI prompt. */
  reason: string;
  fallback: TalkResult;
}

interface Rule {
  trigger: Trigger;
  npc: NpcId;
  priority: number;
  when: (state: GameState, idleSec: number) => boolean;
  reason: (state: GameState) => string;
  emotion: Emotion;
  lines: (state: GameState) => readonly string[];
  suggestions: readonly string[];
}

const isNight = (state: GameState): boolean => state.clock >= 21 * 60 || state.clock < 5 * 60;
const pct = (state: GameState, npc: NpcId): number => percentOf(state.npcs[npc].relation);

const NAKED_SUGGESTIONS = ['J\u2019ai fait naufrage…', 'Arrête de regarder !', 'T\u2019aurais pas un slip ?'];

const RULES: readonly Rule[] = [
  {
    trigger: 'nu', npc: 'josette', priority: 100, emotion: 'surprise',
    when: (s) => s.outfit === 'nu',
    reason: () => 'Un inconnu vient d\u2019échouer sur l\u2019île, COMPLÈTEMENT NU. Tu accours, choquée et ravie : c\u2019est le ragot du siècle. Tu poses mille questions.',
    lines: () => [
      'Mon chou ! Attends attends attends… T\u2019es TOUT NU ?! Ch\u2019est pas vrai ! Tu sors d\u2019où comme ça, hein ?',
      'Oh là là là ! Un naufragé ! Et tout nu en plus ! Mi j\u2019dis, faut que je raconte ça à Marius. Tout de suite !',
    ],
    suggestions: NAKED_SUGGESTIONS,
  },
  {
    trigger: 'nu', npc: 'gaston', priority: 90, emotion: 'joie',
    when: (s) => s.outfit === 'nu',
    reason: () => 'Le nouveau venu se promène tout nu. Tu flaires l\u2019affaire : tu veux lui vendre des habits hors de prix (il peut t\u2019en acheter en te parlant).',
    lines: () => [
      'Oh fada ! Tout nu sur MON île ? Mon ami, j\u2019ai exactement ce qu\u2019il te faut : un pantalon presque neuf. Presque.',
      'Peuchère… Bon, entre nous, j\u2019ai des habits. Pas donnés, hein. Mais la pudeur, ça n\u2019a pas de prix. Enfin si : le mien.',
    ],
    suggestions: ['Combien pour des habits ?', 'Tu fais crédit ?', 'Je suis très bien comme ça'],
  },
  {
    trigger: 'nu', npc: 'marius', priority: 60, emotion: 'amuse',
    when: (s, idle) => s.outfit === 'nu' && idle >= 10,
    reason: () => 'Le naufragé se balade toujours tout nu. Tu viens lui parler calmement, avec une métaphore marine sur la nudité, un peu moqueur.',
    lines: () => ['… Boudu. La mer non plus ne porte rien. Mais elle, elle a de la tenue, pitchoun.', '… Pfff… Même les poulpes ont plus de pudeur que toi. Et pourtant ils ont huit bras.'],
    suggestions: NAKED_SUGGESTIONS,
  },
  ...NPC_IDS.map((npc): Rule => ({
    trigger: 'rumeur', npc, priority: 80, emotion: 'mefiance',
    when: (s) => s.npcs[npc].intent !== null,
    reason: (s) => `Tu viens le voir de toi-même pour ceci : ${s.npcs[npc].intent ?? ''}`,
    lines: (s) => [openerLine(s, npc)],
    suggestions: CONFRONT_SUGGESTIONS,
  })),
  ...NPC_IDS.map((npc): Rule => ({
    trigger: 'colere', npc, priority: 70, emotion: 'colere',
    when: (s) => pct(s, npc) <= 25,
    reason: () => 'Tu bouillonnes de rancune contre le joueur. Tu viens le trouver pour lui dire ses quatre vérités et le menacer.',
    lines: () => [ANGRY[npc]],
    suggestions: ['Calme-toi, on peut parler', 'Pardon, vraiment…', 'Viens, on règle ça !'],
  })),
  ...NPC_IDS.map((npc): Rule => ({
    trigger: 'ami', npc, priority: 40, emotion: 'joie',
    when: (s) => pct(s, npc) >= 75,
    reason: () => 'Tu adores le joueur. Tu viens lui faire une confidence, un petit cadeau ou lui glisser un ragot exclusif.',
    lines: () => [FRIENDLY[npc]],
    suggestions: ['Raconte !', 'T\u2019es un vrai ami', 'Un cadeau ? Pour moi ?'],
  })),
  {
    trigger: 'fauche', npc: 'gaston', priority: 50, emotion: 'amuse',
    when: (s) => s.coins < BROKE_COINS,
    reason: (s) => `Le joueur est fauché (${s.coins} pièces). Tu viens lui proposer un prêt à taux d\u2019usure ou un petit boulot humiliant.`,
    lines: () => ['Mon ami, j\u2019entends ton porte-monnaie pleurer d\u2019ici. Un petit prêt ? À peine 40 % d\u2019intérêts. Par jour. Hé hé.'],
    suggestions: ['40 % ?! T\u2019es fou', 'Quel genre de boulot ?', 'Je préfère mourir'],
  },
  {
    trigger: 'fauche', npc: 'josette', priority: 45, emotion: 'tristesse',
    when: (s) => s.coins < BROKE_COINS && s.npcs.josette.relation >= 0,
    reason: () => 'Le joueur n\u2019a plus un sou. Tu viens lui apporter une baguette de la veille, avec tendresse et beaucoup de questions.',
    lines: () => ['Mon chou… on m\u2019a dit que t\u2019avais plus un sou. Tiens, une baguette d\u2019hier. Chut, hein, mi j\u2019dis rien à personne.'],
    suggestions: ['Merci Josette…', 'Qui t\u2019a dit ça ?', 'J\u2019ai pas besoin de pitié'],
  },
  {
    trigger: 'riche', npc: 'gaston', priority: 55, emotion: 'joie',
    when: (s) => s.coins >= RICH_COINS,
    reason: (s) => `Le joueur a ${s.coins} pièces. Tu sens l\u2019odeur de l\u2019argent et tu viens lui vendre n\u2019importe quoi.`,
    lines: () => ['Vé, vé, vé ! Qui c\u2019est qui brille comme un lingot ? Mon meilleur client ! J\u2019ai une statue de moi pour toi.'],
    suggestions: ['Montre-moi ça', 'Je garde mon argent', 'Une statue de TOI ?'],
  },
  {
    trigger: 'celebre', npc: 'josette', priority: 45, emotion: 'joie',
    when: (s) => s.islandValue >= FAMOUS_VALUE,
    reason: (s) => `L\u2019île est devenue superbe grâce au joueur (valeur ${s.islandValue}). Tout le monde en parle, tu viens le féliciter et cancaner.`,
    lines: () => ['Mon chou ! Toute l\u2019île ne parle que de toi et de tes décorations ! Enfin… surtout moi. Mais je parle beaucoup !'],
    suggestions: ['Merci, t\u2019es adorable', 'Qui en dit du mal ?', 'Ça m\u2019a coûté cher'],
  },
  {
    trigger: 'immobile', npc: 'marius', priority: 30, emotion: 'neutre',
    when: (_s, idle) => idle >= IDLE_TRIGGER_SEC,
    reason: () => 'Le joueur reste planté sans bouger depuis un moment. Tu viens voir s\u2019il va bien, à ta manière lente et philosophe.',
    lines: () => ['… Tu bouges plus, pitchoun. C\u2019est bien. Le poisson aussi, il attend. Tu attends quoi, toi ?'],
    suggestions: ['Je réfléchis', 'Je m\u2019ennuie un peu', 'Laisse-moi tranquille'],
  },
  {
    trigger: 'immobile', npc: 'josette', priority: 25, emotion: 'surprise',
    when: (s, idle) => idle >= IDLE_TRIGGER_SEC && s.npcs.josette.relation >= -15,
    reason: () => 'Le joueur ne bouge plus depuis un moment. Tu t\u2019inquiètes (et tu veux savoir pourquoi, pour le raconter).',
    lines: () => ['Coucou ? Mon chou ? T\u2019es tout raide ! T\u2019as vu un fantôme ou quoi ? Raconte !'],
    suggestions: ['Je rêvassais', 'Tu m\u2019espionnes ?', 'Quoi de neuf ?'],
  },
  {
    trigger: 'nuit', npc: 'marius', priority: 35, emotion: 'neutre',
    when: (s) => isNight(s) && s.npcs.marius.relation >= -15,
    reason: () => 'Il fait nuit, l\u2019île dort. Tu viens partager un moment calme sous les étoiles et un conseil de pêche douteux.',
    lines: () => ['… La nuit, les poissons rêvent. Moi aussi. Tu veux savoir de quoi ? Non ? Tant pis, té.'],
    suggestions: ['Raconte-moi', 'Il est tard, Marius', 'Un conseil de pêche ?'],
  },
];

const ANGRY: Record<NpcId, string> = {
  gaston: 'Toi ! Oui, toi. Tu me dois du respect, et des sous. Continue comme ça et je te vends au prochain bateau, fada.',
  josette: 'Toi… Je t\u2019ai à l\u2019œil, hein. Toute l\u2019île sait ce que t\u2019as fait. Et mon rouleau à pâtisserie aussi.',
  marius: '… Tu vois cette mer ? Elle est calme. Moi non. Fais attention, pitchoun.',
};

const FRIENDLY: Record<NpcId, string> = {
  gaston: 'Mon ami ! Entre nous… j\u2019ai mis de côté un petit truc pour toi. Prix d\u2019ami. Enfin, prix de Gaston, mais d\u2019ami.',
  josette: 'Mon chou ! Viens viens viens, j\u2019ai un ragot tout chaud. Rien que pour toi. Tu le répètes pas, hein ?',
  marius: '… Tiens. Je t\u2019ai gardé le plus beau coquillage du ponton. Chut. Même Josette sait pas.',
};

const key = (npc: NpcId, trigger: Trigger): string => `${npc}:${trigger}`;

/** Highest-priority NPC initiative that can fire now, skipping NPCs in `blocked` and triggers already used today. */
export function pickInitiative(state: GameState, idleSec: number, blocked: ReadonlySet<NpcId>): Initiative | null {
  const rule = RULES.filter((r) => !blocked.has(r.npc) && state.initiatives[key(r.npc, r.trigger)] !== state.day && r.when(state, idleSec))
    .sort((a, b) => b.priority - a.priority)[0];
  if (!rule) return null;
  const seed = hashString(`${state.day}:${state.clock}:${rule.npc}:${rule.trigger}`);
  return {
    npc: rule.npc,
    trigger: rule.trigger,
    reason: rule.reason(state),
    fallback: {
      reply: pick(rule.lines(state), seed),
      emotion: rule.emotion,
      relationDelta: 0,
      reason: '',
      events: [],
      intent: null,
      suggestions: [...rule.suggestions],
      source: 'fallback',
    },
  };
}

export function markInitiative(state: GameState, npc: NpcId, trigger: Trigger): GameState {
  return { ...state, initiatives: { ...state.initiatives, [key(npc, trigger)]: state.day } };
}

export function comingToast(npc: NpcId): string {
  return `${CHARACTERS[npc].name} vient te voir…`;
}
