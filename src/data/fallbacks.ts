import type { Emotion, NpcId } from '../state/types.ts';

export type FallbackSituation = 'generic' | 'confront' | 'lie' | 'insulted' | 'gift' | 'deal' | 'opener';

/** Répliques de secours écrites à la main : si l'IA échoue ou traîne, le jeu continue. */
export const FALLBACKS: Record<NpcId, Record<FallbackSituation, { text: string; emotion: Emotion }[]>> = {
  gaston: {
    generic: [
      { text: "Hmm hmm, oui oui... Écoute, le temps c'est de l'argent, et là tu me coûtes cher.", emotion: 'neutre' },
      { text: 'Voyons voyons... (douze et trois, quinze...) Pardon, tu disais ?', emotion: 'neutre' },
    ],
    confront: [{ text: "On m'a raconté des choses sur toi, mon ami. Des choses qui font baisser ta cote. Beaucoup.", emotion: 'mefiance' }],
    lie: [{ text: "Ah non. Pas à moi. Le bluff, c'est MON rayon. Tu mens comme tu marchandes : mal.", emotion: 'colere' }],
    insulted: [{ text: "Sur ma moustache ! Personne ne parle comme ça à Gaston. Tes prix viennent de doubler.", emotion: 'colere' }],
    gift: [{ text: "Un cadeau ? Pour moi ? (combien ça vaut...) C'est... touchant. Vraiment.", emotion: 'joie' }],
    deal: [{ text: "Mon dernier prix, et je me ruine en le disant. C'est à prendre ou à laisser.", emotion: 'neutre' }],
    opener: [{ text: 'Ah, mon meilleur client ! Enfin... mon seul client. Viens, viens !', emotion: 'joie' }],
  },
  josette: {
    generic: [
      { text: "Oh mon chou, attends, j'ai une fournée au four... Tu disais quoi ? Raconte, raconte !", emotion: 'joie' },
      { text: 'Hihi, toi alors ! Entre nous... tu ne répètes pas, hein ?', emotion: 'joie' },
    ],
    confront: [{ text: "Toi. Viens ici. Marius m'a TOUT raconté. Alors, qu'est-ce que tu as à dire pour ta défense ?", emotion: 'colere' }],
    lie: [{ text: "Ne me mens pas, mon chou. Je sais tout ce qui se passe sur cette île. TOUT. Et là, tu mens.", emotion: 'colere' }],
    insulted: [{ text: "Oh ! Non mais tu te rends compte de ce que tu dis ? Tout le monde va le savoir, crois-moi.", emotion: 'colere' }],
    gift: [{ text: 'Pour moi ? Oh mon chou, il ne fallait pas ! Tiens, je te garde le meilleur ragot du jour.', emotion: 'joie' }],
    deal: [{ text: 'Les affaires, vois ça avec Gaston, moi je fais du pain !', emotion: 'neutre' }],
    opener: [{ text: "Coucou mon chou ! Viens par là, j'ai des nouvelles toutes chaudes, comme mes croissants !", emotion: 'joie' }],
  },
  marius: {
    generic: [
      { text: "... La mer n'aime pas qu'on la presse, petit.", emotion: 'neutre' },
      { text: '... Hm. Le vent tourne. Comme les gens.', emotion: 'neutre' },
    ],
    confront: [{ text: "... J'ai repensé à ce que tu m'as dit. Ça m'est resté là. Comme un hameçon.", emotion: 'tristesse' }],
    lie: [{ text: "... Le poisson qui ment finit toujours dans le filet. Je sais ce que je sais.", emotion: 'mefiance' }],
    insulted: [{ text: '... Bien. Très bien. Je vais le dire à Josette.', emotion: 'colere' }],
    gift: [{ text: "... Pour moi ? La mer rend ce qu'on lui prête. Merci, petit.", emotion: 'joie' }],
    deal: [{ text: '... Je ne vends rien. Va voir le moustachu.', emotion: 'neutre' }],
    opener: [{ text: "... Tiens. Te voilà. La mer m'a dit que tu viendrais.", emotion: 'neutre' }],
  },
};

export function pickFallback(npc: NpcId, situation: FallbackSituation, n: number): { text: string; emotion: Emotion } {
  const lines = FALLBACKS[npc][situation];
  const line = lines[Math.abs(n) % lines.length];
  if (!line) throw new Error(`Aucune réplique de secours pour ${npc}/${situation}`);
  return line;
}
