import type { Fact } from '../state/types.ts';
import { pick } from './rng.ts';

const NEG = [
  'Et devant témoins, en plus !',
  "Il paraît que ce n'était pas la première fois...",
  "Certains disent même qu'il en riait !",
  "On raconte qu'il a juré de recommencer.",
];
const POS = ["Et ça, c'est rare de nos jours.", "On dit qu'il est plein aux as.", "Il paraît qu'il veut devenir maire !"];
const FUNNY = ['La tête comme une citrouille !', "Paraît qu'il a pleuré comme un bébé.", "Il a couru jusqu'à la mer en hurlant !"];

/** Déforme un fait selon le niveau de distorsion (0 = fidèle). Déterministe via rng. */
export function distort(fact: Fact, level: number, rng: () => number): string {
  if (level <= 0) return fact.text;
  const pool = fact.kind === 'stung' ? FUNNY : fact.severity < 0 ? NEG : POS;
  const extra: string[] = [];
  for (let i = 0; i < Math.min(level, 3); i++) {
    const s = pick(rng, pool);
    if (!extra.includes(s)) extra.push(s);
  }
  return `${fact.text} ${extra.join(' ')}`;
}
