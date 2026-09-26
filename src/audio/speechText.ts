// Nettoyage d'une réplique avant synthèse vocale (partagé client + serveur, fonction pure).

export const TTS_MAX_CHARS = 300;

/**
 * Retire les didascalies ((soupir), *se gratte la tête*, [rire]), les emojis et les espaces superflus.
 * Tronque proprement à TTS_MAX_CHARS (sur une fin de mot). Renvoie '' s'il ne reste rien à dire.
 */
export function cleanForSpeech(text: string): string {
  let out = text
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\*[^*]*\*/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[*_~`#]/g, ' ')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?…;:])/g, '$1')
    .trim();
  // Une réplique qui ne contient plus que de la ponctuation ne vaut pas un appel TTS.
  if (!/[\p{L}\p{N}]/u.test(out)) return '';
  if (out.length > TTS_MAX_CHARS) {
    const cut = out.slice(0, TTS_MAX_CHARS);
    const lastSpace = cut.lastIndexOf(' ');
    out = (lastSpace > TTS_MAX_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
  }
  return out;
}
