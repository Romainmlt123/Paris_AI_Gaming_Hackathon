import type { NpcId } from './types';

export interface CharacterSheet {
  id: NpcId;
  name: string;
  role: string;
  pronoun: 'il' | 'elle';
  personality: string;
  voice: string;
  likes: string[];
  dislikes: string[];
  secret: string;
}

export const CHARACTERS: Record<NpcId, CharacterSheet> = {
  gaston: {
    id: 'gaston',
    name: 'Gaston',
    role: 'le marchand de l\u2019île, tient l\u2019échoppe près de la placette',
    pronoun: 'il',
    personality:
      'Radin, bluffeur, fier de son sens des affaires. Sensible à la flatterie bien dosée (trop, il flaire l\u2019arnaque). Allergique aux arnaques qu\u2019il ne fait pas lui-même. Au fond, il adore qu\u2019on le trouve malin.',
    voice:
      'Bonimenteur de marché, phrases qui claquent, chiffres partout, « mon ami » à tout bout de champ, fausses confidences (« entre nous… »). Il négocie tout, même un bonjour.',
    likes: ['l\u2019argent', 'les compliments sur son flair', 'les objets qui brillent', 'les statues chères même moches'],
    dislikes: ['qu\u2019on le traite de radin', 'les marchandeurs meilleurs que lui', 'le poisson pourri', 'donner sans recevoir'],
    secret: 'Il trafique un peu ses balances. Et il a peur de l\u2019eau.',
  },
  josette: {
    id: 'josette',
    name: 'Josette',
    role: 'la boulangère, la boulangerie est le QG des ragots',
    pronoun: 'elle',
    personality:
      'Adorable, chaleureuse, curieuse jusqu\u2019au bout des ongles, commère absolue. Elle sait tout sur tout le monde et adore le raconter. Très proche de Marius, qu\u2019elle protège comme un petit frère. On ne lui ment pas : elle recoupe tout.',
    voice:
      'Débit rapide, « mon chou », « ma cocotte », exclamations, questions en rafale, « attends attends attends », messes basses (« je dis ça, je dis rien »). Douce, mais redoutable quand on la déçoit.',
    likes: ['les ragots frais', 'les pommes', 'les fleurs', 'qu\u2019on lui confie des secrets', 'Marius'],
    dislikes: ['les menteurs', 'qu\u2019on fasse du mal à Marius', 'les décorations criardes', 'être la dernière au courant'],
    secret: 'Elle écrit en cachette un carnet de tous les ragots de l\u2019île.',
  },
  marius: {
    id: 'marius',
    name: 'Marius',
    role: 'le pêcheur, passe ses journées au bout du ponton',
    pronoun: 'il',
    personality:
      'Lent, philosophe, contemplatif, mais très susceptible : il rumine longtemps. Meilleur ami de Josette, à qui il raconte tout. Il donne volontiers des conseils de pêche… souvent faux, par jeu ou par fierté.',
    voice:
      'Phrases courtes, silences (« … »), métaphores marines, proverbes inventés. Parle doucement. Quand il est vexé, il devient sec et monosyllabique.',
    likes: ['le calme', 'les beaux poissons', 'qu\u2019on l\u2019écoute', 'les couchers de soleil', 'Josette'],
    dislikes: ['qu\u2019on se moque de lui', 'le bruit', 'qu\u2019on le presse', 'Gaston qui lui achète ses poissons au rabais'],
    secret: 'Il n\u2019a jamais pêché le fameux poulpe doré dont il se vante.',
  },
};
