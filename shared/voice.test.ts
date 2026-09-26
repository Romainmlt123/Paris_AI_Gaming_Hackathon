import { describe, expect, it } from 'vitest';
import { speakableText, voiceSettings, TTS_MAX_CHARS } from './voices';
import { floatToWav, resample, wavHeader } from './wav';

describe('speakableText', () => {
  it('strips emojis and markup, turns ellipses into pauses', () => {
    expect(speakableText('… Ah. 😊 *soupir* Te voilà...')).toBe('Ah. soupir Te voilà <break time="0.5s" />');
    expect(speakableText('Bon… on verra')).toBe('Bon <break time="0.5s" /> on verra');
  });
  it('caps length', () => {
    expect(speakableText('a'.repeat(1000)).length).toBe(TTS_MAX_CHARS);
  });
  it('returns empty for emoji-only lines', () => {
    expect(speakableText('😠😠')).toBe('');
  });
});

describe('voiceSettings', () => {
  it('Marius is slower than Josette, anger speeds up', () => {
    expect(voiceSettings('marius', 'neutre').padding_bonus).toBeGreaterThan(voiceSettings('josette', 'neutre').padding_bonus);
    expect(voiceSettings('gaston', 'colere').padding_bonus).toBeLessThan(voiceSettings('gaston', 'neutre').padding_bonus);
  });
  it('stays in Gradium ranges', () => {
    const s = voiceSettings('marius', 'tristesse');
    expect(s.padding_bonus).toBeLessThanOrEqual(4);
    expect(s.temp).toBeGreaterThanOrEqual(0);
  });
});

describe('wav', () => {
  it('writes a valid header', () => {
    const h = new DataView(wavHeader(100, 24000).buffer);
    expect(String.fromCharCode(h.getUint8(0), h.getUint8(1), h.getUint8(2), h.getUint8(3))).toBe('RIFF');
    expect(h.getUint32(24, true)).toBe(24000);
    expect(h.getUint32(40, true)).toBe(100);
  });
  it('encodes and resamples', () => {
    const samples = new Float32Array(480).fill(0.5);
    const down = resample(samples, 48000, 24000);
    expect(down.length).toBe(240);
    const wav = floatToWav(down, 24000);
    expect(wav.byteLength).toBe(44 + 480);
    expect(new DataView(wav.buffer).getInt16(44, true)).toBe(Math.floor(0.5 * 0x7fff));
  });
});
