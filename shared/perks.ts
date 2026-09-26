import { CHARACTERS } from './characters';
import type { GameState, NpcId, PerkId } from './types';

export interface Perk {
  id: PerkId;
  npc: NpcId;
  /** Relation needed to unlock (matches a tier threshold). */
  min: number;
  tier: string;
  /** Shown as a toast: what the player concretely gets. */
  reward: string;
  /** What the NPC says when handing it over. */
  line: string;
}

export const PERKS: readonly Perk[] = [
  {
    id: 'gaston-copain',
    npc: 'gaston',
    min: 15,
    tier: 'Copain',
    reward: 'Gaston rachète ta récolte 20 % plus cher',
    line: 'Entre nous, mon ami… pour toi, je rachète tes trouvailles 20 % plus cher. Le répète pas, j\u2019ai une réputation.',
  },
  {
    id: 'gaston-confident',
    npc: 'gaston',
    min: 50,
    tier: 'Confident',
    reward: 'Cadeau : un Parterre d\u2019œillets dans ton sac',
    line: 'Tiens. Un parterre, cadeau de la maison. Si on te demande, tu l\u2019as payé plein pot.',
  },
  {
    id: 'josette-copain',
    npc: 'josette',
    min: 15,
    tier: 'Copain',
    reward: 'Ragot exclusif : les balances de Gaston sont truquées',
    line: 'Viens là, mon chou… Gaston trafique ses balances. Je dis ça, je dis rien. Mais tu pourrais lui en toucher un mot quand il te fait un prix !',
  },
  {
    id: 'marius-copain',
    npc: 'marius',
    min: 15,
    tier: 'Copain',
    reward: 'Coin secret : une perle de plus sur la plage chaque matin',
    line: '… Tu vois la plage ? Chaque matin, la mer y laisse une perle. Mon coin secret. Maintenant le tien. Chut.',
  },
  {
    id: 'marius-confident',
    npc: 'marius',
    min: 50,
    tier: 'Confident',
    reward: 'Secret : Marius n\u2019a jamais pêché le poulpe doré',
    line: '… Le poulpe doré. Je l\u2019ai jamais pêché. Voilà. La mer le savait. Maintenant toi aussi.',
  },
];

/** Grants every perk whose threshold the NPC's relation has reached. Each perk is given once. */
export function unlockPerks(state: GameState, npc: NpcId): { state: GameState; perks: Perk[] } {
  const due = PERKS.filter((p) => p.npc === npc && state.npcs[npc].relation >= p.min && !state.perks.includes(p.id));
  if (due.length === 0) return { state, perks: [] };
  const next = structuredClone(state);
  for (const perk of due) {
    next.perks.push(perk.id);
    if (perk.id === 'gaston-confident') next.inventory.push('parterre');
    next.npcs[npc].memories = [...next.npcs[npc].memories, `Jour ${next.day} : tu as confié au joueur « ${perk.reward} »`].slice(-8);
  }
  return { state: next, perks: due };
}

export function perkToast(perk: Perk): string {
  return `🎁 ${CHARACTERS[perk.npc].name} · ${perk.tier} — ${perk.reward}`;
}
