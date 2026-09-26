import { NPCS } from '../data/npcs.ts';
import { BEACH_TILES, tileToWorld } from '../data/island.ts';
import type { AbsenceReport, Fact, GameState, Intent, NpcId, RelationChange, RumorTransfer } from '../state/types.ts';
import { NPC_IDS } from '../state/types.ts';
import { actorName, addFact, knowsFact, nextId } from './facts.ts';
import { applyRelation, bondKey, clamp, getBond } from './relations.ts';
import { makeRng, pick } from './rng.ts';
import { distort } from './rumors.ts';

/** Ce que l'habitant sait du fait : distorsion 0 s'il en a été témoin. */
function knowledge(state: GameState, npc: NpcId): { fact: Fact; distortion: number; text: string }[] {
  const out: { fact: Fact; distortion: number; text: string }[] = [];
  for (const f of state.facts) {
    if (f.actor !== 'player' || f.severity === 0 && f.kind !== 'stung') continue;
    if (f.witnesses.includes(npc)) {
      out.push({ fact: f, distortion: 0, text: f.text });
      continue;
    }
    const r = state.rumors.find((x) => x.holder === npc && x.factId === f.id);
    if (r) out.push({ fact: f, distortion: r.distortion, text: r.text });
  }
  return out;
}

/** Réaction d'un habitant qui apprend un fait sur le joueur. */
export function hearsayDelta(state: GameState, listener: NpcId, fact: Fact, distortion: number): number {
  if (fact.kind === 'stung') return 0;
  let delta = fact.severity * 3 * (1 + distortion * 0.15);
  const target = fact.target;
  if (target && target !== 'player' && target !== listener) {
    const bond = getBond(state, listener, target);
    if (fact.severity < 0) {
      if (bond >= 50) delta *= 1.8;
      else if (bond <= -20) delta = 1; // mesquin : on n'est pas mécontent
    }
  }
  return Math.round(clamp(delta, -15, 15));
}

function intentFor(state: GameState, npc: NpcId, fact: Fact, delta: number): Intent | null {
  const target = fact.target && fact.target !== 'player' ? actorName(state, fact.target) : null;
  if (fact.kind === 'stung') return { kind: 'mock', text: "Alors, il paraît qu'on s'est fait piquer ? Hihi !", about: fact.id };
  if (fact.kind === 'neglect') return { kind: 'confront', text: 'Tes pauvres bêtes... Tu les as oubliées !', about: fact.id };
  if (delta <= -6) {
    return {
      kind: 'confront',
      text: target ? `Il faut qu'on parle de ce que tu as fait à ${target}.` : "Il faut qu'on parle, toi et moi.",
      about: fact.id,
    };
  }
  if (delta >= 5) return { kind: 'thank', text: "J'ai entendu de belles choses sur toi !", about: fact.id };
  if (npc === 'josette') return { kind: 'gossip', text: "J'ai des nouvelles toutes chaudes !", about: fact.id };
  return null;
}

function refreshWorld(draft: GameState, newDays: number, rng: () => number, world: string[]): void {
  if (newDays <= 0) return;
  for (const t of draft.trees) {
    t.fruits = 3;
    t.hive = t.hive || rng() < 0.25;
  }
  world.push('Les arbres ont refait leurs fruits.');
  const shells = draft.pickups.filter((p) => p.itemId === 'coquillage' || p.itemId === 'conque').length;
  let spawned = 0;
  for (let k = shells; k < 6; k++) {
    const tile = pick(rng, BEACH_TILES);
    const w = tileToWorld(tile.i, tile.j);
    draft.pickups.push({ id: nextId(draft, 'p'), itemId: rng() < 0.12 ? 'conque' : 'coquillage', x: w.x, z: w.z });
    spawned++;
  }
  if (spawned > 0) world.push(`La marée a déposé ${spawned} coquillage${spawned > 1 ? 's' : ''} sur la plage.`);
  for (const a of draft.animals) {
    if (a.lastFedDay < draft.day - 1) {
      const already = draft.facts.some((f) => f.kind === 'neglect' && f.day === draft.day && f.text.includes(a.name));
      if (!already) {
        addFact(draft, {
          actor: 'player',
          target: null,
          kind: 'neglect',
          text: `${draft.player.name} a oublié de nourrir ${a.name}, le ${a.kind === 'dodo' ? 'dodo nain' : 'mouton-nuage'}.`,
          witnesses: ['josette'],
        });
        world.push(`${a.name} a le ventre vide depuis hier...`);
      }
    }
  }
  const hasCarnet = draft.player.inventory.some((s) => s.itemId === 'carnet') || draft.pickups.some((p) => p.itemId === 'carnet');
  const carnetFound = draft.facts.some((f) => f.text.includes('carnet'));
  if (!hasCarnet && !carnetFound && draft.day >= 2) {
    const w = tileToWorld(18, 12);
    draft.pickups.push({ id: nextId(draft, 'p'), itemId: 'carnet', x: w.x, z: w.z });
    world.push("Un carnet oublié traîne derrière l'échoppe de Gaston...");
  }
  if (draft.player.stungUntilDay !== null && draft.player.stungUntilDay < draft.day) draft.player.stungUntilDay = null;
}

/**
 * Simulation d'absence : 100 % code, déterministe (graine + jour).
 * Les habitants se racontent ce qu'ils savent selon leurs liens ; les rumeurs se déforment ;
 * les relations et les intentions évoluent. L'IA ne fait ensuite que raconter le résultat (Gazette).
 */
export function simulateAbsence(state: GameState, hours: number, now: number): { state: GameState; report: AbsenceReport } {
  const draft: GameState = structuredClone(state);
  const rng = makeRng(draft.seed * 31 + draft.day * 977 + draft.counter);
  const transfers: RumorTransfer[] = [];
  const changes: RelationChange[] = [];
  const impact = new Map<NpcId, { fact: Fact; delta: number }>();
  const rounds = clamp(Math.ceil(hours / 3), 1, 4);

  for (let round = 0; round < rounds; round++) {
    for (const teller of NPC_IDS) {
      const sheet = NPCS[teller];
      for (const k of knowledge(draft, teller)) {
        for (const listener of NPC_IDS) {
          if (listener === teller || knowsFact(draft, listener, k.fact.id)) continue;
          const bond = getBond(draft, teller, listener);
          const concernsListenerFriend = k.fact.target !== null && k.fact.target !== 'player' && k.fact.target !== listener && getBond(draft, listener, k.fact.target) >= 50;
          const sure = bond >= 70 || (teller === 'josette' && bond >= 0);
          const p = sheet.gossip * (0.5 + bond / 200) + (concernsListenerFriend ? 0.2 : 0);
          if (!sure && rng() >= p) continue;
          const distortion = clamp(k.distortion + (rng() > sheet.accuracy ? 1 : 0), 0, 3);
          const text = distort(k.fact, distortion, rng);
          draft.rumors.push({ id: nextId(draft, 'r'), factId: k.fact.id, holder: listener, heardFrom: teller, text, distortion, day: draft.day });
          transfers.push({ from: teller, to: listener, sourceId: k.fact.id, text, distortion });
          if (concernsListenerFriend && k.fact.severity < 0) {
            const key = bondKey(teller, listener);
            draft.bonds[key] = clamp((draft.bonds[key] ?? 0) + 2, -100, 100);
          }
          const delta = hearsayDelta(draft, listener, k.fact, distortion);
          const reason = `${NPCS[teller].name} lui a raconté : ${k.fact.text}`;
          const change = applyRelation(draft, listener, delta, reason, now);
          if (change) changes.push(change);
          const prev = impact.get(listener);
          if (!prev || Math.abs(delta) > Math.abs(prev.delta) || (delta === prev.delta && k.fact.day >= prev.fact.day)) impact.set(listener, { fact: k.fact, delta });
        }
      }
    }
  }

  // Les habitants qui ont été directement touchés (témoins) peuvent aussi vouloir revenir en parler.
  const intents: { npc: NpcId; intent: Intent }[] = [];
  for (const npc of NPC_IDS) {
    const st = draft.npcs[npc];
    const hit = impact.get(npc);
    let intent = hit ? intentFor(draft, npc, hit.fact, hit.delta) : null;
    if (!intent) {
      const neglect = draft.facts.find((f) => f.kind === 'neglect' && f.witnesses.includes(npc) && f.day === draft.day);
      if (neglect) intent = intentFor(draft, npc, neglect, -6);
    }
    st.intent = intent ?? st.intent;
    st.mood = intent?.kind === 'confront' ? 'colere' : intent?.kind === 'mock' ? 'moquerie' : 'neutre';
    if (st.intent) intents.push({ npc, intent: st.intent });
  }

  const totalHours = draft.hour + hours;
  const newDays = Math.floor(totalHours / 24);
  draft.day += newDays;
  draft.hour = totalHours % 24;
  const world: string[] = [];
  refreshWorld(draft, newDays, rng, world);

  const lines: string[] = [];
  for (const t of transfers) lines.push(`${NPCS[t.from].name} a raconté à ${NPCS[t.to].name} : « ${t.text} »`);
  if (transfers.length === 0) lines.push("Rien de croustillant : l'île a fait la sieste.");
  lines.push(...world);

  const report: AbsenceReport = { hours, day: draft.day, transfers, relationChanges: changes, intents, world, lines };
  draft.pendingRecap = { hours, lines, relationChanges: changes, gazette: null };
  return { state: draft, report };
}
