import type { NpcId } from '../state/types';

export interface NpcMeta {
  id: NpcId;
  name: string;
  job: string;
  color: string; // couleur UI (bulle, jauge)
  home: { x: number; z: number };
  /** Répliques de secours si l'IA échoue ou traîne. */
  fallbackReplies: readonly string[];
}

export const NPCS: Record<NpcId, NpcMeta> = {
  gaston: {
    id: 'gaston', name: 'Gaston', job: 'Marchand', color: '#d9a441', home: { x: -4, z: 1 },
    fallbackReplies: [
      "Hmm ? Pardon, je recomptais ma caisse. Tu disais ?",
      "Parle moins vite, l'ami, les bonnes affaires, ça se savoure.",
      "Ah, un client ! Enfin… peut-être. On verra ce que tu as dans la bourse.",
    ],
  },
  josette: {
    id: 'josette', name: 'Josette', job: 'Boulangère', color: '#e78fa8', home: { x: 3, z: -2 },
    fallbackReplies: [
      "Oh pardon, mon chou, j'ai la tête dans le four ! Tu disais ?",
      "Attends, attends… redis-moi ça, j'ai pas tout suivi, j'étais en train d'écouter derrière la porte.",
      "Mmh ! Toi, t'as une tête à avoir des choses à me raconter…",
    ],
  },
  marius: {
    id: 'marius', name: 'Marius', job: 'Pêcheur', color: '#5b8fb9', home: { x: 1, z: 5 },
    fallbackReplies: [
      "…La mer est calme. Moi aussi. Enfin, pour l'instant.",
      "Hmm. Laisse-moi réfléchir. Les poissons, eux, ne se pressent jamais.",
      "Tu sais, petit… certaines questions, faut les laisser mariner.",
    ],
  },
};

export interface RelationTier {
  id: 'ennemi' | 'froid' | 'voisin' | 'copain' | 'ami' | 'confident';
  name: string;
  /** Borne basse incluse (la plus haute borne atteinte gagne). */
  min: number;
  /** Remise de Gaston en % (négatif = majoration). */
  gastonDiscount: number;
  /** Josette confie un ragot exclusif. */
  josetteGossip: boolean;
  /** Marius révèle son secret. */
  mariusSecret: boolean;
}

// Ordonnés du plus bas au plus haut. ≤-60 Ennemi juré, ≤-20 Froid, <20 Voisin, <50 Copain, <80 Ami, ≥80 Confident.
export const RELATION_TIERS: readonly RelationTier[] = [
  { id: 'ennemi', name: 'Ennemi juré', min: -100, gastonDiscount: -30, josetteGossip: false, mariusSecret: false },
  { id: 'froid', name: 'Froid', min: -59, gastonDiscount: -10, josetteGossip: false, mariusSecret: false },
  { id: 'voisin', name: 'Voisin', min: -19, gastonDiscount: 0, josetteGossip: false, mariusSecret: false },
  { id: 'copain', name: 'Copain', min: 20, gastonDiscount: 5, josetteGossip: true, mariusSecret: false },
  { id: 'ami', name: 'Ami', min: 50, gastonDiscount: 10, josetteGossip: true, mariusSecret: true },
  { id: 'confident', name: 'Confident', min: 80, gastonDiscount: 20, josetteGossip: true, mariusSecret: true },
];
