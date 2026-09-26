import type { SlotId } from '../state/types';

export const SLOT_IDS: readonly SlotId[] = ['placette', 'falaise', 'ponton', 'mairie', 'plage', 'verger'];

export const SLOT_LABELS: Record<SlotId, string> = {
  placette: 'La placette',
  falaise: 'Le bord de falaise',
  ponton: "L'entrée du ponton",
  mairie: 'Le jardin de la mairie',
  plage: 'La plage',
  verger: 'Le verger',
};

/** Points d'apparition des ramassables chaque matin (rayon ≤ 8, loin des maisons). */
export const PICKUP_SPAWNS: readonly { itemId: string; x: number; z: number }[] = [
  { itemId: 'pomme', x: -6, z: -3 },
  { itemId: 'pomme', x: -2, z: -5 },
  { itemId: 'figue', x: 5, z: 2 },
  { itemId: 'figue', x: -1, z: -2 },
  { itemId: 'coquillage', x: 6.5, z: 4 },
  { itemId: 'coquillage', x: -5, z: 5.5 },
  { itemId: 'coquillage', x: 4, z: 6.5 },
];
