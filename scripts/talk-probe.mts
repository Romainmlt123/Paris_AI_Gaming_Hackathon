import { createInitialState } from '../src/logic/initial.ts';
import { buildContext } from '../src/logic/context.ts';
const s = createInitialState();
const t0 = Date.now();
const r = await fetch('http://localhost:8787/api/talk', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ npc: 'marius', playerText: "T'es qu'un vieux radoteur qui pêche que des cailloux", offeredItemId: null, history: [], context: buildContext(s, 'marius'), playerName: 'Baptiste' }) });
console.log(Date.now() - t0, JSON.stringify(await r.json(), null, 1));
