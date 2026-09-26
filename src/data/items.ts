import type { ItemDef } from '../state/types';

// Catalogue des objets. price = achat chez Gaston (0 = pas en vente), sellPrice = rachat par Gaston.
const tool = (id: string, name: string, icon: string, price: number): ItemDef => ({
  id, name, kind: 'tool', icon, stack: 1, price, sellPrice: Math.round(price / 4), prestige: 0,
});
const res = (id: string, name: string, icon: string, price: number, sellPrice: number): ItemDef => ({
  id, name, kind: 'resource', icon, stack: 10, price, sellPrice, prestige: 0,
});
const decor = (id: string, name: string, icon: string, price: number, prestige: number): ItemDef => ({
  id, name, kind: 'decor', icon, stack: 1, price, sellPrice: Math.round(price / 2), prestige,
});

export const ITEMS: readonly ItemDef[] = [
  tool('canne-a-peche', 'Canne à pêche', '🎣', 400),
  tool('filet', 'Filet à insectes', '🥅', 350),
  tool('arrosoir', 'Arrosoir', '💦', 300),

  res('pomme', 'Pomme', '🍎', 20, 10),
  res('figue', 'Figue', '🫐', 30, 15),
  res('pomme-doree', 'Pomme dorée', '🍏', 1200, 600),
  res('coquillage', 'Coquillage', '🐚', 30, 15),
  res('bar-commun', 'Bar commun', '🐟', 80, 40),
  res('sardine', 'Sardine', '🐠', 50, 25),
  res('poisson-pourri', 'Poisson pourri', '🤢', 5, 1),
  res('poulpe-dore', 'Poulpe doré', '🐙', 3000, 1500),
  res('plume-irisee', 'Plume irisée', '🪶', 400, 200),
  res('laine-doree', 'Laine dorée', '🧶', 500, 250),

  decor('banc-bois-flotte', 'Banc en bois flotté', '🪑', 600, 20),
  decor('lampadaire-retro', 'Lampadaire rétro', '🏮', 900, 35),
  decor('fontaine-sculptee', 'Fontaine sculptée', '⛲', 2500, 90),
  decor('parterre-oeillets', "Parterre d'œillets", '🌷', 400, 25),
  { ...decor('statue-doree-moche', 'Statue dorée (un peu moche)', '🗿', 6000, 200), sellPrice: 1500 },
  decor('stand-patisserie', 'Stand de pâtisserie', '🧁', 1800, 70),
  decor('phare', 'Phare', '🗼', 4000, 150),

  { id: 'carnet-gaston', name: 'Carnet de comptes secret de Gaston', kind: 'story', icon: '📒', stack: 1, price: 0, sellPrice: 800, prestige: 0 },
];

const BY_ID: ReadonlyMap<string, ItemDef> = new Map(ITEMS.map((i) => [i.id, i]));

export function isItemId(id: unknown): id is string {
  return typeof id === 'string' && BY_ID.has(id);
}

export function getItem(id: string): ItemDef {
  const item = BY_ID.get(id);
  if (!item) throw new Error(`Objet inconnu : « ${id} » (absent de src/data/items.ts)`);
  return item;
}
