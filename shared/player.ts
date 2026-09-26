export const NAME_MAX = 14;

/** Trims, collapses whitespace and strips control/markup characters from a typed first name. */
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001f\u007f<>{}"`\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
}

/** How the island refers to the player in facts and prompts. */
export function playerLabel(name: string): string {
  return cleanName(name) || 'Le joueur';
}
