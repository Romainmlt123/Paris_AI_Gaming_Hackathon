import type { ItemDef } from '../state/types.ts';

const list: ItemDef[] = [
  // Outils
  { id: 'canne', name: 'Canne à pêche', kind: 'tool', icon: '🎣', stack: 1, price: 350, sellPrice: 80, prestige: 0, tags: [] },
  { id: 'filet', name: 'Filet à insectes', kind: 'tool', icon: '🥅', stack: 1, price: 250, sellPrice: 60, prestige: 0, tags: [] },
  { id: 'arrosoir', name: 'Arrosoir', kind: 'tool', icon: '🚿', stack: 1, price: 180, sellPrice: 40, prestige: 0, tags: [] },
  // Ressources
  { id: 'pomme', name: 'Pomme', kind: 'resource', icon: '🍎', stack: 10, price: 0, sellPrice: 25, prestige: 0, tags: ['fruit'] },
  { id: 'figue', name: 'Figue', kind: 'resource', icon: '🟣', stack: 10, price: 0, sellPrice: 45, prestige: 0, tags: ['fruit'] },
  { id: 'figue_or', name: 'Figue dorée', kind: 'resource', icon: '🌟', stack: 5, price: 0, sellPrice: 400, prestige: 0, tags: ['fruit', 'legendary'] },
  { id: 'coquillage', name: 'Coquillage', kind: 'resource', icon: '🐚', stack: 10, price: 0, sellPrice: 20, prestige: 0, tags: ['shell'] },
  { id: 'conque', name: 'Conque nacrée', kind: 'resource', icon: '🦪', stack: 5, price: 0, sellPrice: 160, prestige: 0, tags: ['shell'] },
  { id: 'sardine', name: 'Sardine', kind: 'resource', icon: '🐟', stack: 10, price: 0, sellPrice: 35, prestige: 0, tags: ['fish'] },
  { id: 'bar', name: 'Bar commun', kind: 'resource', icon: '🐟', stack: 10, price: 0, sellPrice: 70, prestige: 0, tags: ['fish'] },
  { id: 'dorade', name: 'Dorade royale', kind: 'resource', icon: '🐠', stack: 5, price: 0, sellPrice: 180, prestige: 0, tags: ['fish'] },
  { id: 'poulpe_or', name: 'Poulpe doré', kind: 'resource', icon: '🐙', stack: 1, price: 0, sellPrice: 1800, prestige: 0, tags: ['fish', 'legendary'] },
  { id: 'poisson_pourri', name: 'Poisson pourri', kind: 'resource', icon: '🦴', stack: 5, price: 0, sellPrice: 1, prestige: 0, tags: ['fish', 'rotten'] },
  { id: 'papillon', name: 'Papillon azur', kind: 'resource', icon: '🦋', stack: 5, price: 0, sellPrice: 90, prestige: 0, tags: ['bug'] },
  { id: 'plume', name: 'Plume irisée', kind: 'resource', icon: '🪶', stack: 10, price: 0, sellPrice: 220, prestige: 0, tags: ['pen'] },
  { id: 'laine', name: 'Laine dorée', kind: 'resource', icon: '🧶', stack: 10, price: 0, sellPrice: 260, prestige: 0, tags: ['pen'] },
  // Décor
  { id: 'banc', name: 'Banc en bois flotté', kind: 'decor', icon: '🪑', stack: 1, price: 400, sellPrice: 150, prestige: 30, tags: ['nature'] },
  { id: 'lampadaire', name: 'Lampadaire rétro', kind: 'decor', icon: '🏮', stack: 1, price: 700, sellPrice: 250, prestige: 55, tags: [] },
  { id: 'oeillets', name: "Parterre d'œillets", kind: 'decor', icon: '🌸', stack: 1, price: 250, sellPrice: 90, prestige: 25, tags: ['nature'] },
  { id: 'fontaine', name: 'Fontaine sculptée', kind: 'decor', icon: '⛲', stack: 1, price: 1600, sellPrice: 600, prestige: 160, tags: ['luxe'], requires: { itemId: 'plume', qty: 1 } },
  { id: 'statue', name: 'Statue dorée de Gaston', kind: 'decor', icon: '🗿', stack: 1, price: 2400, sellPrice: 900, prestige: 190, tags: ['luxe', 'kitsch'] },
  { id: 'echoppe_plus', name: "Agrandissement de l'échoppe", kind: 'decor', icon: '🏪', stack: 1, price: 2200, sellPrice: 0, prestige: 180, tags: ['building'], slots: ['echoppe'] },
  { id: 'stand_patisserie', name: 'Stand de pâtisserie', kind: 'decor', icon: '🧁', stack: 1, price: 1500, sellPrice: 0, prestige: 140, tags: ['building', 'pastry'], slots: ['boulangerie'] },
  { id: 'phare', name: 'Phare du ponton', kind: 'decor', icon: '🗼', stack: 1, price: 3200, sellPrice: 0, prestige: 300, tags: ['building', 'luxe'], slots: ['ponton'], requires: { itemId: 'laine', qty: 1 } },
  // Objets narratifs
  { id: 'carnet', name: 'Carnet de comptes secret de Gaston', kind: 'story', icon: '📒', stack: 1, price: 0, sellPrice: 0, prestige: 0, tags: [] },
  { id: 'lettre', name: 'Lettre parfumée non signée', kind: 'story', icon: '💌', stack: 1, price: 0, sellPrice: 0, prestige: 0, tags: [] },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(list.map((i) => [i.id, i]));
export const SHOP_ITEMS: string[] = list.filter((i) => i.price > 0).map((i) => i.id);

export function item(id: string): ItemDef {
  const def = ITEMS[id];
  if (!def) throw new Error(`Objet inconnu : ${id}`);
  return def;
}
