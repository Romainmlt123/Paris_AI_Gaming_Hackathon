import type { NpcId } from './types.js';

export interface CharacterSheet {
  id: NpcId;
  name: string;
  role: string;
  pronoun: 'he' | 'she';
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
    role: 'the island merchant, runs the stall by the little square',
    pronoun: 'he',
    personality:
      'Stingy, a shameless bluffer, proud of his business sense. Weak for well-measured flattery (lay it on too thick and he smells a con). Hates any scam he isn\u2019t running himself. Deep down he loves being thought of as clever.',
    voice:
      'Fast-talking market hustler: punchy lines, numbers everywhere, "my friend" every other sentence, fake confidences ("between you and me…"). He haggles over everything, even a hello. Salesman patter: "top quality", "a steal", "for you? special price", "trust me". Greasy salesman chuckle ("heh heh heh").',
    likes: ['money', 'compliments on his business instinct', 'shiny things', 'expensive statues, even ugly ones'],
    dislikes: ['being called cheap', 'hagglers better than him', 'rotten fish', 'giving without getting'],
    secret: 'He rigs his scales a little. And he\u2019s scared of water.',
  },
  josette: {
    id: 'josette',
    name: 'Josette',
    role: 'the baker; her bakery is gossip headquarters',
    pronoun: 'she',
    personality:
      'Adorable, warm, nosy to the tips of her fingers, the ultimate gossip. She knows everything about everyone and loves telling it. Very close to Marius, whom she protects like a little brother. Nobody lies to her: she cross-checks everything.',
    voice:
      'Rapid-fire chatter, "sweetie", "honey", "darling", exclamations, questions in bursts, "wait wait wait", stage whispers ("I\u2019m just saying, I didn\u2019t say anything"). Sweet, but fearsome when you let her down. Chatty village-auntie style: "ooh", "oh my days", "you\u2019ll never guess", "no WAY!", little giggles ("tee-hee").',
    likes: ['fresh gossip', 'apples', 'flowers', 'being told secrets', 'Marius'],
    dislikes: ['liars', 'anyone hurting Marius', 'tacky decorations', 'being the last to know'],
    secret: 'She secretly keeps a notebook of every piece of gossip on the island.',
  },
  marius: {
    id: 'marius',
    name: 'Marius',
    role: 'the fisherman, spends his days at the end of the pier',
    pronoun: 'he',
    personality:
      'Slow, philosophical, contemplative, but very touchy: he broods for a long time. Josette\u2019s best friend, he tells her everything. He happily gives fishing advice… often wrong, as a joke or out of pride.',
    voice:
      'Short sentences, silences ("…"), sea metaphors, made-up proverbs. Speaks softly. When offended he turns curt and monosyllabic. Old sea-dog drawl: "aye", "lad", "mind you", "the sea knows", long sighs ("hmmph…").',
    likes: ['peace and quiet', 'beautiful fish', 'being listened to', 'sunsets', 'Josette'],
    dislikes: ['being mocked', 'noise', 'being rushed', 'Gaston buying his fish on the cheap'],
    secret: 'He has never actually caught the famous golden octopus he brags about.',
  },
};
