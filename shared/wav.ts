/** 44-byte RIFF header for mono 16-bit PCM. */
export function wavHeader(dataBytes: number, sampleRate: number): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(44);
  const v = new DataView(buf);
  const ascii = (at: number, s: string): void => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, 'data');
  v.setUint32(40, dataBytes, true);
  return new Uint8Array(buf);
}

/** Wraps raw PCM s16le mono bytes into a WAV file. */
export function pcmToWav(pcm: Uint8Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(44 + pcm.byteLength);
  out.set(wavHeader(pcm.byteLength, sampleRate), 0);
  out.set(pcm, 44);
  return out;
}

/** Linear-interpolation resampling of float samples. */
export function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to || input.length === 0) return input;
  const out = new Float32Array(Math.max(1, Math.round((input.length * to) / from)));
  const ratio = from / to;
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const i0 = Math.min(input.length - 1, Math.floor(pos));
    const i1 = Math.min(input.length - 1, i0 + 1);
    const t = pos - i0;
    out[i] = (input[i0] ?? 0) * (1 - t) + (input[i1] ?? 0) * t;
  }
  return out;
}

/** Float samples in [-1, 1] → 16-bit mono WAV. */
export function floatToWav(samples: Float32Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const pcm = new DataView(new ArrayBuffer(samples.length * 2));
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    pcm.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return pcmToWav(new Uint8Array(pcm.buffer), sampleRate);
}
