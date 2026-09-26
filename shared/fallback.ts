import { CHARACTERS } from './characters';
import { hashString, pick } from './rng';
import type { ContestVerdict, Emotion, NpcId, TalkContext, TalkResult } from './types';

export type Intent = 'insult' | 'contest' | 'denial' | 'compliment' | 'apology' | 'greeting' | 'neutral';

const PATTERNS: Record<Exclude<Intent, 'neutral'>, RegExp> = {
  insult:
    /\b(idiot|imbecile|con|conne|cretin|abruti|debile|stupide|nul|nulle|moche|pue|puant|minable|naze|bouffon|radin|escroc|voleur|vieux croulant|feignant|grosse|gros lard|ta gueule|degage|tocard|loser|pauvre type|incapable)\b/,
  contest: /(exager|deform|en rajoute|brode|gonfle|amplifi|pas (du tout |vraiment )?comme ca|pas exactement ca|a moitie vrai)/,
  denial:
    /(c'?est faux|pas vrai|jamais dit|j'?ai rien (dit|fait)|n'?importe quoi|mensonge|c'?est pas moi|pas moi|jamais de la vie|il ment|elle ment|invente|j'?ai jamais)/,
  apology: /\b(pardon|desole|desolee|excuse|excuses|regrette)\b/,
  compliment:
    /\b(merci|genial|super|magnifique|beau|belle|bravo|adore|delicieux|delicieuse|gentil|gentille|incroyable|meilleur|meilleure|parfait|sympa|talent|malin|genie|doue|classe|flair)\b|l.(œ|oe)il/,
  greeting: /\b(salut|bonjour|coucou|hello|bonsoir|yo|hey)\b/,
};

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’`]/g, "'");
}

export function classifyMessage(message: string): Intent {
  const text = normalize(message);
  for (const intent of ['insult', 'contest', 'denial', 'apology', 'compliment', 'greeting'] as const) {
    if (PATTERNS[intent].test(text)) return intent;
  }
  return 'neutral';
}

type LineSet = Record<Intent | 'caught' | 'upheld', readonly string[]>;

const LINES: Record<NpcId, LineSet> = {
  gaston: {
    insult: [
      'Pardon ?! Répète un peu pour voir… Non, ne répète pas. Tes prix viennent de doubler, mon ami.',
      'Oh là. Tu sais combien ça coûte, une insulte, chez Gaston ? Très cher. Très très cher.',
    ],
    denial: ['Hé hé. Le bluff, c\u2019est mon métier, mon ami. Toi t\u2019es amateur.'],
    contest: ['Exagéré ? Hmm. Tout le monde exagère, mon ami. Surtout moi.'],
    upheld: ['Ah. Bon. J\u2019ai peut-être un peu brodé en le répétant. Le commerce, c\u2019est l\u2019art d\u2019arrondir.', 'Hmm… C\u2019est vrai que Josette en rajoute toujours. Bon, on oublie. Presque.'],
    caught: ['On me la fait pas, à moi. J\u2019ai des oreilles partout. Surtout du côté de la boulangerie.'],
    apology: ['Des excuses ? C\u2019est gratuit, ça. Moi je préfère ce qui se paie. Mais bon… j\u2019accepte.'],
    compliment: [
      'Hé hé… flatteur, va. Ça marche pas sur moi. Bon, un peu. Deux pour cent de remise, pas un de plus.',
      'Enfin quelqu\u2019un qui reconnaît le talent ! Entre nous, t\u2019as l\u2019œil, toi.',
    ],
    greeting: [
      'Ah, un client ! Ou un curieux… J\u2019espère pour toi que t\u2019es un client.',
      'Bienvenue, bienvenue ! Tout est à vendre, même le sourire. Surtout le sourire.',
    ],
    neutral: [
      'Tout a un prix, mon ami. Même les conseils. Surtout les conseils.',
      'Hmm hmm. Et sinon, tu achètes quelque chose ou tu fais du tourisme ?',
      'Écoute, entre nous… j\u2019ai une affaire en or pour toi. Enfin, en plaqué.',
    ],
  },
  josette: {
    insult: [
      'Oh ! Eh ben… je m\u2019attendais pas à ça de toi, mon chou. Tout le monde va être ravi de l\u2019apprendre, tiens.',
      'Pardon ?! Attends attends attends… tu m\u2019as dit QUOI, là ?',
    ],
    denial: ['Hmm. Tu me le dirais, hein, si tu avais fait une bêtise ? Hein ?'],
    contest: ['Exagéré ? Moi ? Jamais de la vie, mon chou. Enfin… raconte ta version.'],
    upheld: ['Attends attends attends… c\u2019est tout ?! Oh là là, on m\u2019a raconté n\u2019importe quoi. Pardon mon chou.', 'Ah bon ?! Ben ça alors… On m\u2019a monté la tête. Je vais aller dire deux mots à quelqu\u2019un.'],
    caught: [
      'Ah non non non, pas à moi ! Marius m\u2019a TOUT raconté. Et en plus tu me mens en face ? Bravo, vraiment bravo.',
      'Mon chou… je sais tout. TOUT. Alors les « c\u2019est pas moi », tu les gardes pour Gaston.',
    ],
    apology: ['Bon… Des excuses, c\u2019est déjà ça. Mais tu iras voir Marius, hein ? Promis ?'],
    compliment: [
      'Oh arrête, tu vas me faire rougir ! Tiens, garde ça pour toi, mais… Gaston triche sur ses balances.',
      'Oh que t\u2019es mignon ! Je le dirai à tout le monde. En bien, hein ! Pour une fois.',
    ],
    greeting: [
      'Oh coucou mon chou ! Alors, quoi de neuf ? Raconte, raconte !',
      'Te voilà ! Viens viens, j\u2019ai des croissants tout chauds et des nouvelles encore plus chaudes.',
    ],
    neutral: [
      'Hmm hmm. Et sinon, t\u2019as entendu la dernière ? Non ? Moi non plus, c\u2019est pour ça que je demande !',
      'Ah oui ? Intéressant… très intéressant. Je note. Dans ma tête, hein. Pas dans un carnet.',
    ],
  },
  marius: {
    insult: [
      '… Ah. D\u2019accord. Je vais aller en parler aux poissons. Et à Josette.',
      '… Tu sais, petit, la mer n\u2019oublie rien. Moi non plus.',
    ],
    denial: ['… Hmm. Le poisson qui nie l\u2019hameçon finit quand même dans le seau.'],
    contest: ['… Exagéré. Peut-être. Les vagues grossissent en approchant du bord.'],
    upheld: ['… Hmm. La rumeur, c\u2019est comme un poisson raconté : il grossit à chaque fois. Bon. Je te crois.'],
    caught: ['… Je sais ce que j\u2019ai entendu. La vague ne ment pas, elle.'],
    apology: ['… Mmh. La marée remonte toujours. Bon. On verra.'],
    compliment: [
      '… Mmh. Gentil. Le poisson aussi, il aime qu\u2019on lui parle doucement.',
      '… Merci. Ça fait comme un rayon de soleil sur l\u2019eau.',
    ],
    greeting: ['… Salut. La mer est calme. Comme moi. Enfin, en général.', '… Oh. Toi. Assieds-toi, si tu veux. Parle pas trop fort.'],
    neutral: [
      '… Tu sais, la patience, c\u2019est comme une ligne : trop tendue, elle casse.',
      '… Hmm. Faut appâter à la mie de pain, à marée basse. Crois-moi. Ou pas.',
    ],
  },
};

const SUGGESTIONS: Record<NpcId, readonly string[]> = {
  gaston: ['Tu me fais un prix ?', 'T\u2019as l\u2019œil pour les affaires !', 'C\u2019est du vol, tes prix !'],
  josette: ['Quoi de neuf sur l\u2019île ?', 'Tes croissants sont divins !', 'Tu sais garder un secret ?'],
  marius: ['Un conseil de pêche ?', 'Belle journée, hein ?', 'T\u2019es un peu lent, non ?'],
};

export function defaultSuggestions(npc: NpcId): string[] {
  return [...SUGGESTIONS[npc]];
}

interface Outcome {
  line: keyof LineSet;
  emotion: Emotion;
  delta: number;
  reason: string;
  severity: number | null;
}

function outcomeFor(intent: Intent, knowsMisdeed: boolean, name: string, verdict: ContestVerdict | null): Outcome {
  if (verdict) {
    return verdict.upheld
      ? { line: 'upheld', emotion: 'surprise', delta: 0, reason: '', severity: null }
      : { line: 'caught', emotion: 'mefiance', delta: 0, reason: '', severity: null };
  }
  switch (intent) {
    case 'contest':
      return { line: 'contest', emotion: 'amuse', delta: 0, reason: '', severity: null };
    case 'insult':
      return { line: 'insult', emotion: 'colere', delta: -12, reason: `Tu as insulté ${name}`, severity: -2 };
    case 'denial':
      return knowsMisdeed
        ? { line: 'caught', emotion: 'mefiance', delta: -15, reason: 'Tu as menti alors qu\u2019on sait tout', severity: -1 }
        : { line: 'denial', emotion: 'mefiance', delta: -1, reason: 'Réponse évasive', severity: null };
    case 'apology':
      return { line: 'apology', emotion: 'neutre', delta: knowsMisdeed ? 4 : 1, reason: 'Tu t\u2019es excusé', severity: null };
    case 'compliment':
      return { line: 'compliment', emotion: 'joie', delta: 4, reason: 'Un compliment qui fait plaisir', severity: null };
    case 'greeting':
      return { line: 'greeting', emotion: 'joie', delta: 1, reason: 'Un bonjour poli', severity: null };
    case 'neutral':
      return { line: 'neutral', emotion: 'neutre', delta: 0, reason: '', severity: null };
  }
}

/** Believable scripted reply used whenever the AI is unavailable, slow, or returns garbage. */
export function fallbackTalk(npc: NpcId, message: string, context: TalkContext): TalkResult {
  const sheet = CHARACTERS[npc];
  const knowsMisdeed = context.knownRumors.some((r) => r.aboutPlayer && r.severity < 0);
  const outcome = outcomeFor(classifyMessage(message), knowsMisdeed, sheet.name, context.verdict);
  const quote = message.trim().slice(0, 60);
  const events =
    outcome.severity === null
      ? []
      : [
          {
            text:
              outcome.line === 'caught'
                ? `Le joueur a menti effrontément à ${sheet.name}`
                : `Le joueur a insulté ${sheet.name} : « ${quote} »`,
            severity: outcome.severity,
          },
        ];
  return {
    reply: pick(LINES[npc][outcome.line], hashString(message)),
    emotion: outcome.emotion,
    relationDelta: outcome.delta,
    reason: outcome.reason,
    events,
    intent: null,
    suggestions: defaultSuggestions(npc),
    source: 'fallback',
  };
}
