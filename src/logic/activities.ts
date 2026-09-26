import type { GameState, NpcId } from '../state/types.ts';
import { item } from '../data/items.ts';
import { addFact, nextId } from './facts.ts';
import { addItem, countItem, freeRoomFor, removeItem } from './inventory.ts';

const FISH_TABLE: { id: string; w: number }[] = [
  { id: 'sardine', w: 34 },
  { id: 'bar', w: 32 },
  { id: 'dorade', w: 20 },
  { id: 'poisson_pourri', w: 9 },
  { id: 'poulpe_or', w: 5 },
];

export function rollFish(r: number): string {
  const total = FISH_TABLE.reduce((n, f) => n + f.w, 0);
  let x = r * total;
  for (const f of FISH_TABLE) {
    x -= f.w;
    if (x < 0) return f.id;
  }
  return 'sardine';
}

export type ActResult = { state: GameState; message: string; itemId?: string; stung?: boolean; spoke?: { npc: NpcId; text: string } };

const MARIUS_ON_FISH: Record<string, string> = {
  sardine: '... Une sardine. Petite, mais honnête.',
  bar: '... Un bar. La mer te fait un clin d’œil.',
  dorade: '... Une dorade royale. Hm. Pas mal, pour un terrien.',
  poisson_pourri: '... Même la mer te renvoie tes déchets. Médite là-dessus.',
  poulpe_or: '... Le Poulpe doré. Trente ans que je l’attends. Trente ans.',
};

export function catchFish(state: GameState, r: number): ActResult {
  const draft = structuredClone(state);
  const id = rollFish(r);
  if (freeRoomFor(draft.player.inventory, id) < 1) return { state, message: 'Ta sacoche est pleine !' };
  addItem(draft.player.inventory, id, 1);
  const def = item(id);
  if (def.tags.includes('legendary') || id === 'poisson_pourri') {
    addFact(draft, { actor: 'player', target: null, kind: 'catch', text: `${draft.player.name} a pêché ${def.name} au ponton.`, witnesses: ['marius'], severity: id === 'poisson_pourri' ? 0 : 2 });
  }
  return { state: draft, message: `Tu as pêché : ${def.name} !`, itemId: id, spoke: { npc: 'marius', text: MARIUS_ON_FISH[id] ?? '... Hm.' } };
}

export function shakeTree(state: GameState, treeId: string, r: number, dropAt: { x: number; z: number }): ActResult {
  const draft = structuredClone(state);
  const tree = draft.trees.find((t) => t.id === treeId);
  if (!tree) return { state, message: '' };
  if (tree.hive && tree.shakenDay !== draft.day) {
    tree.hive = false;
    tree.shakenDay = draft.day;
    draft.player.stungUntilDay = draft.day;
    addFact(draft, { actor: 'player', target: null, kind: 'stung', text: `${draft.player.name} s'est fait piquer par des guêpes en secouant un arbre.`, witnesses: ['josette'] });
    draft.npcs.josette.intent = { kind: 'mock', text: 'Hihi ! Mais qu’est-ce qui est arrivé à ta figure ?', about: null };
    return { state: draft, message: 'Aïe ! Une ruche ! Tu te fais piquer...', stung: true };
  }
  tree.shakenDay = draft.day;
  if (tree.fruits <= 0) return { state: draft, message: 'Plus rien dans cet arbre aujourd’hui.' };
  tree.fruits -= 1;
  const golden = tree.fruit === 'figue' && r < 0.08;
  const itemId = golden ? 'figue_or' : tree.fruit;
  draft.pickups.push({ id: nextId(draft, 'p'), itemId, x: dropAt.x, z: dropAt.z });
  return { state: draft, message: golden ? 'Une figue dorée tombe ! ✨' : `${item(itemId).name} tombe de l’arbre.`, itemId };
}

export function takePickup(state: GameState, pickupId: string): ActResult {
  const p = state.pickups.find((x) => x.id === pickupId);
  if (!p) return { state, message: '' };
  if (freeRoomFor(state.player.inventory, p.itemId) < 1) return { state, message: 'Ta sacoche est pleine !' };
  const draft = structuredClone(state);
  draft.pickups = draft.pickups.filter((x) => x.id !== pickupId);
  addItem(draft.player.inventory, p.itemId, 1);
  const def = item(p.itemId);
  if (p.itemId === 'carnet') {
    addFact(draft, { actor: 'player', target: 'gaston', kind: 'other', text: `${draft.player.name} a trouvé le carnet de comptes secret de Gaston.`, witnesses: [], severity: 0 });
  }
  return { state: draft, message: `${def.icon} ${def.name} ramassé`, itemId: p.itemId };
}

export function catchButterfly(state: GameState): ActResult {
  if (countItem(state.player.inventory, 'filet') < 1) return { state, message: 'Il te faut un filet (chez Gaston).' };
  if (freeRoomFor(state.player.inventory, 'papillon') < 1) return { state, message: 'Ta sacoche est pleine !' };
  const draft = structuredClone(state);
  addItem(draft.player.inventory, 'papillon', 1);
  return { state: draft, message: '🦋 Papillon azur attrapé !', itemId: 'papillon' };
}

export function feedAnimal(state: GameState, animalId: string): ActResult {
  const a = state.animals.find((x) => x.id === animalId);
  if (!a) return { state, message: '' };
  if (a.readyToCollect) {
    const res = a.kind === 'dodo' ? 'plume' : 'laine';
    if (freeRoomFor(state.player.inventory, res) < 1) return { state, message: 'Ta sacoche est pleine !' };
    const draft = structuredClone(state);
    const d = draft.animals.find((x) => x.id === animalId);
    if (d) d.readyToCollect = false;
    addItem(draft.player.inventory, res, 1);
    return { state: draft, message: `${a.name} te donne : ${item(res).name} !`, itemId: res };
  }
  if (a.lastFedDay >= state.day) return { state, message: `${a.name} a déjà mangé aujourd’hui.` };
  const fruit = state.player.inventory.find((s) => item(s.itemId).tags.includes('fruit') && !item(s.itemId).tags.includes('legendary'));
  if (!fruit) return { state, message: `${a.name} réclame un fruit.` };
  const draft = structuredClone(state);
  removeItem(draft.player.inventory, fruit.itemId, 1);
  const d = draft.animals.find((x) => x.id === animalId);
  if (d) {
    d.lastFedDay = draft.day;
    d.readyToCollect = true;
  }
  return { state: draft, message: `${a.name} croque ${item(fruit.itemId).name.toLowerCase()} avec joie. Reviens le voir !` };
}
