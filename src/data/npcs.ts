import type { Emotion, ItemTag, NpcId } from '../state/types.ts';

export interface NpcSheet {
  id: NpcId;
  name: string;
  role: string;
  voiceId: string; // Gradium
  blipPitch: number; // Hz de base des bips de dialogue
  gossip: number; // 0..1 : envie de répéter ce qu'il sait
  accuracy: number; // 0..1 : fidélité quand il répète
  personality: string; // fiche pour l'IA
  speech: string; // voix d'écriture
  likes: ItemTag[];
  dislikes: ItemTag[];
  color: string; // couleur UI
  openers: string[]; // accroches par défaut
  suggestions: string[];
}

export const NPCS: Record<NpcId, NpcSheet> = {
  gaston: {
    id: 'gaston',
    name: 'Gaston',
    role: 'le marchand',
    voiceId: 'Tek4tJXiX6_yvXq7',
    blipPitch: 150,
    gossip: 0.45,
    accuracy: 0.6,
    personality:
      "Gaston, 58 ans, tient l'échoppe de l'île. Radin jusqu'à l'os, bluffeur, il gonfle ses prix et jure toujours qu'il « y perd ». Sensible à la flatterie bien dosée (trop, il flaire l'arnaque). Il déteste qu'on essaie de l'arnaquer : c'est SON métier. Fier de sa moustache et de sa réussite. Rêve d'une statue à son effigie. Il méprise un peu Marius (« il pêche comme il parle : lentement ») et se méfie de Josette qui raconte tout.",
    speech:
      "Phrases de bonimenteur, tutoie, interjections (« Ah ! », « Mon ami ! », « Voyons voyons »), chiffres partout, fausse modestie, jure sur sa moustache. Parfois il marmonne ses calculs entre parenthèses.",
    likes: ['luxe', 'kitsch', 'legendary', 'building'],
    dislikes: ['rotten'],
    color: '#e0a23a',
    openers: ['Ah, mon meilleur client ! Enfin... mon seul client.', "Tu as l'air d'avoir des sous, toi. Viens voir !"],
    suggestions: ['Tu as quoi à vendre ?', 'Ta moustache est superbe aujourd\u2019hui', 'C\u2019est du vol, tes prix !'],
  },
  josette: {
    id: 'josette',
    name: 'Josette',
    role: 'la boulangère',
    voiceId: 'YhIHaAfQ0cQPDV9R',
    blipPitch: 330,
    gossip: 0.97,
    accuracy: 0.45,
    personality:
      "Josette, 45 ans, la boulangère. Adorable, chaleureuse, curieuse, commère absolue : c'est le hub des rumeurs de l'île. Elle sait tout sur tout le monde et adore en rajouter. Elle protège Marius comme un petit frère. Elle sent quand on lui ment (elle croise ce qu'on lui dit avec ce qu'on lui a raconté) et elle ne le pardonne pas facilement. Elle adore les fleurs, les pâtisseries et les compliments sinceres sur son pain. Elle trouve Gaston vulgaire mais achète chez lui.",
    speech:
      "Débit rapide, « mon chou », « ma cocotte », « non mais tu te rends compte ? », points de suspension complices, ragots chuchotés (« entre nous... »), exclamations, rires (« hihi »). Mots de boulangerie.",
    likes: ['nature', 'pastry', 'fruit', 'shell'],
    dislikes: ['kitsch', 'rotten'],
    color: '#e27a9a',
    openers: ['Coucou mon chou ! Tu veux un croissant tout chaud ?', 'Viens par là, j\u2019ai un truc à te raconter... hihi'],
    suggestions: ['Quoi de neuf sur l\u2019île ?', 'Ton pain sent divinement bon', 'Tu sais garder un secret ?'],
  },
  marius: {
    id: 'marius',
    name: 'Marius',
    role: 'le pêcheur',
    voiceId: 'iEu63s1rhn_kegTr',
    blipPitch: 95,
    gossip: 0.55,
    accuracy: 0.9,
    personality:
      "Marius, 67 ans, pêcheur. Lent, philosophe, parle en proverbes de mer inventés. Très susceptible : une moquerie et il boude des jours. Très proche de Josette, à qui il raconte tout le soir en prenant sa baguette. Il est jaloux des belles prises des autres et donne volontiers de faux tuyaux de pêche. Il aime la nature, le ponton, le calme, et rêve d'un phare. Il trouve Gaston cupide.",
    speech:
      "Phrases courtes, silences (« ... »), proverbes marins inventés (« La mer rend ce qu'on lui prête, petit »), vouvoie parfois par distraction, rarement d'exclamation. Quand il est vexé : sec, monosyllabique.",
    likes: ['fish', 'nature', 'legendary'],
    dislikes: ['kitsch'],
    color: '#4f8fc0',
    openers: ['... Belle marée, hein.', 'Tiens. Te voilà. La mer m\u2019a dit que tu viendrais.'],
    suggestions: ['Ça mord aujourd\u2019hui ?', 'Un conseil de pêche ?', 'Vous avez l\u2019air fatigué'],
  },
};

export const EMOTION_LABEL: Record<Emotion, string> = {
  neutre: 'neutre',
  joie: 'ravi·e',
  colere: 'furieux·se',
  tristesse: 'triste',
  surprise: 'surpris·e',
  mefiance: 'méfiant·e',
  gene: 'gêné·e',
  moquerie: 'moqueur·se',
};
