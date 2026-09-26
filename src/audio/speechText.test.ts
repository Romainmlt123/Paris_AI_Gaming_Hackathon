import { describe, expect, it } from 'vitest';
import { cleanForSpeech, TTS_MAX_CHARS } from './speechText';

describe('cleanForSpeech', () => {
  it('retire les didascalies et les emojis', () => {
    expect(cleanForSpeech('(soupir) Mon ami… *se frotte les mains* Tu veux ma ruine ?! 😤')).toBe('Mon ami… Tu veux ma ruine?!');
    expect(cleanForSpeech('Oh là là [rire] !')).toBe('Oh là là!');
  });
  it('renvoie vide quand il ne reste que de la ponctuation', () => {
    expect(cleanForSpeech('(silence) … *regarde la mer*')).toBe('');
  });
  it('tronque sur une fin de mot', () => {
    const out = cleanForSpeech('bla '.repeat(200));
    expect(out.length).toBeLessThanOrEqual(TTS_MAX_CHARS);
    expect(out.endsWith('bla')).toBe(true);
  });
});
