import { World } from './world/world';
import type { Quality } from './world/scene';
import { SLOT_POSITIONS } from './world/props';
import { store } from './state/store';
import { NPCS } from './data/npcs';
import { getItem, ITEMS } from './data/items';
import { talkApi, absenceApi } from './api';
import { buildNpcContext, isPlayerStung } from './logic/context';
import { validateAbsenceResponse, validateTalkResponse } from './logic/validate';
import { applyTalkResponse } from './logic/talk';
import { addItem, applyDeal, countItem, islandValue, placeDecor, removeItem, shopPrice, type EconomyError } from './logic/economy';
import { applyAbsence, buildAbsenceRequest, simulateAbsenceFallback } from './logic/absence';
import { recordFact } from './logic/rumors';
import { seededRng } from './logic/rng';
import { tierOf } from './logic/relations';
import { Bag, Dialogue, Hud, nightFade, npcInfo, picker, showRecap, toast } from './ui/ui';
import { h } from './ui/dom';
import { NPC_IDS } from './state/types';
import type { AbsenceResponse, ChatTurn, DealProposal, Emotion, GameState, Intent, NpcId, Pickup, SlotId } from './state/types';

const ECON_ERRORS: Record<EconomyError, string> = {
  'unknown-item': 'Objet inconnu.',
  'invalid-qty': 'Quantité invalide.',
  'inventory-full': 'Ta sacoche est pleine !',
  'not-enough-items': "Tu n'as pas ce qu'il faut.",
  'not-enough-bells': 'Pas assez de clochettes…',
  'not-decor': "Ça ne se pose pas sur l'île.",
};

const GREETINGS: Record<NpcId, Record<'bad' | 'mid' | 'good', string>> = {
  gaston: {
    bad: 'Tiens, revoilà les ennuis. Tu paies comptant, cette fois ?',
    mid: "Approche, approche ! Aujourd'hui j'ai des prix… presque honnêtes !",
    good: 'Mon client préféré ! Pour toi, je sors la marchandise de derrière les fagots.',
  },
  josette: {
    bad: 'Oh. C\'est toi. Je suis très occupée, tu vois…',
    mid: "Coucou mon chou ! Alors, quoi de neuf ? Raconte, raconte !",
    good: 'Mon petit chou à la crème ! Viens là, j\'ai des choses à te raconter…',
  },
  marius: {
    bad: '… La mer est grande. Va voir plus loin si j\'y suis.',
    mid: '… Salut, petit. Le poisson mord pas. Comme d\'habitude.',
    good: '… Ah, te voilà. Assieds-toi. Regarde l\'eau avec moi.',
  },
};

const DEFAULT_SUGGESTIONS: Record<NpcId, string[]> = {
  gaston: ["T'as quoi de beau aujourd'hui ?", 'Tes prix sont du vol, Gaston.', 'Tu me fais une ristourne ?'],
  josette: ['Quoi de neuf sur l’île ?', 'Tes croissants sentent bon !', 'Tu sais garder un secret ?'],
  marius: ['Ça mord, aujourd’hui ?', 'T’es qu’un vieux radoteur.', 'Un conseil de pêche ?'],
};

const INTENT_EMOTION: Record<Intent['kind'], Emotion> = {
  confront: 'colere', gossip: 'surprise', thank: 'joie', ask: 'neutre', offer: 'joie', mock: 'moquerie',
};

const CONFRONT_SUGGESTIONS = ["C'est faux, j'ai rien dit !", 'Pardon… je regrette.', 'Et alors ? Il l’a cherché.'];

export class Game {
  readonly world: World;
  private readonly ui: HTMLElement;
  private readonly hud: Hud;
  private readonly dialogue: Dialogue;
  private readonly bag: Bag;
  private history: ChatTurn[] = [];
  private deal: DealProposal | null = null;
  private talking: NpcId | null = null;
  private decorMode = false;
  private decorBanner: HTMLElement | null = null;
  private busy = false;
  private barks: { el: HTMLElement; npc: NpcId; until: number }[] = [];

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement, quality: Quality) {
    this.ui = ui;
    this.world = new World(canvas, quality, {
      tapNpc: (id) => this.openTalk(id),
      tapPickup: (p) => this.pickUp(p),
      tapSlot: (slot) => this.chooseDecor(slot),
      tapWater: () => this.tapWater(),
      arrivedNpc: (id) => this.openTalk(id),
    });
    this.hud = new Hud(ui, {
      bag: () => this.openBag(),
      decor: () => this.toggleDecorMode(),
      sleep: () => void this.sleep(8),
      chip: (id) => npcInfo(ui, store.get(), id),
    });
    this.dialogue = new Dialogue(ui, {
      send: (text) => void this.say(text, null),
      offer: () => this.offer(),
      close: () => this.closeTalk(),
      acceptDeal: () => this.acceptDeal(),
      refuseDeal: () => this.refuseDeal(),
      catalog: () => this.catalog(),
    });
    this.bag = new Bag(ui);
    store.subscribe((s, prev) => this.sync(s, prev));
    this.world.onFrame = () => this.updateBarks();
  }

  start(): void {
    const s = store.get();
    this.sync(s, null);
    this.world.start();
    if (s.pendingRecap) {
      showRecap(this.ui, null, s.pendingRecap, () => this.afterRecap());
      return;
    }
    // Vraie absence (onglet rouvert après un moment) : l'île a vécu sans nous.
    const hoursAway = (Date.now() - s.lastSavedAt) / 3_600_000;
    if (s.lastSavedAt > 0 && hoursAway >= 0.5) void this.sleep(Math.min(12, Math.max(1, Math.round(hoursAway))));
  }

  // ---------- Synchronisation état → rendu ----------
  private sync(s: GameState, prev: GameState | null): void {
    this.hud.render(s, islandValue(s));
    for (const id of NPC_IDS) this.world.setBang(id, s.npcs[id].intent !== null && this.talking !== id);
    if (!prev || prev.pickups !== s.pickups) this.world.setPickups(s.pickups);
    if (!prev || prev.decor !== s.decor) this.world.setDecor(s.decor);
    if (!prev || isPlayerStung(prev) !== isPlayerStung(s)) this.world.setPlayerSwollen(isPlayerStung(s));
    if (!prev || prev.hour !== s.hour) this.world.stage.setHour(s.hour);
    this.dialogue.update(s);
  }

  // ---------- Conversation ----------
  openTalk(id: NpcId): void {
    if (this.talking || this.busy) return;
    if (this.decorMode) this.toggleDecorMode();
    this.bag.close();
    const s = store.get();
    const npc = s.npcs[id];
    this.talking = id;
    this.history = [];
    this.deal = null;
    this.world.setFrozen(true);
    this.world.faceEachOther(id);
    this.world.setBang(id, false);
    this.hud.setVisible(false);
    this.dialogue.open(id, s);

    let opening: string;
    let emotion: Emotion = npc.mood;
    let suggestions = DEFAULT_SUGGESTIONS[id];
    if (npc.intent) {
      opening = npc.intent.text;
      emotion = INTENT_EMOTION[npc.intent.kind];
      if (npc.intent.kind === 'confront') suggestions = CONFRONT_SUGGESTIONS;
    } else {
      const band = npc.relation < -19 ? 'bad' : npc.relation >= 20 ? 'good' : 'mid';
      opening = GREETINGS[id][band];
      if (isPlayerStung(s) && id === 'josette') {
        opening = 'Oh là là ! Mais qu’est-ce qui est arrivé à ta figure ?! On dirait une brioche trop levée !';
        emotion = 'moquerie';
      }
    }
    this.history.push({ who: 'npc', text: opening });
    this.dialogue.setEmotion(emotion);
    void this.dialogue.say(opening);
    this.dialogue.setSuggestions(suggestions);
  }

  closeTalk(): void {
    if (!this.talking) return;
    const id = this.talking;
    this.talking = null;
    this.deal = null;
    this.dialogue.close();
    this.bag.close();
    this.world.setFrozen(false);
    this.hud.setVisible(true);
    // L'intention est « consommée » dès que la conversation a eu lieu.
    store.set((s) => (s.npcs[id].intent && this.history.length > 1 ? { ...s, npcs: { ...s.npcs, [id]: { ...s.npcs[id], intent: null } } } : s));
    this.sync(store.get(), null);
  }

  async say(text: string, offeredItemId: string | null): Promise<void> {
    const id = this.talking;
    if (!id || this.busy) return;
    this.busy = true;
    this.history.push({ who: 'player', text });
    this.dialogue.thinking();
    this.dialogue.showDeal(null);
    this.deal = null;
    const before = store.get();
    const res = await talkApi({ npc: id, playerText: text, offeredItemId, history: this.history.slice(-10), context: buildNpcContext(before, id) });
    const resp = validateTalkResponse(res.ok ? res.data : null, { npc: id, seed: this.history.length });
    // Le code décide des intentions (absence, événements) : on ignore celles proposées en conversation.
    resp.intent = null;
    if (this.talking !== id) {
      this.busy = false;
      return;
    }
    const logLen = before.relationLog.length;
    store.set((s) => applyTalkResponse(s, id, resp, Date.now()));
    const after = store.get();
    const change = after.relationLog.length > logLen ? (after.relationLog[after.relationLog.length - 1] ?? null) : null;
    this.history.push({ who: 'npc', text: resp.reply });
    this.dialogue.setEmotion(resp.emotion);
    this.dialogue.showDelta(change);
    if (change) this.hud.bumpChip(id, change.delta);
    const tierBefore = tierOf(before.npcs[id].relation).name;
    const tierAfter = tierOf(after.npcs[id].relation).name;
    if (tierBefore !== tierAfter) toast(this.ui, `${NPCS[id].name} : ${tierBefore} → ${tierAfter}`, after.npcs[id].relation > before.npcs[id].relation ? 'good' : 'bad');
    this.dialogue.setBusy(false);
    this.busy = false;
    await this.dialogue.say(resp.reply);
    if (this.talking !== id) return;
    this.dialogue.setSuggestions(resp.suggestions.length ? resp.suggestions : DEFAULT_SUGGESTIONS[id]);
    if (id === 'gaston' && resp.deal) {
      this.deal = resp.deal;
      this.dialogue.showDeal(resp.deal);
    }
  }

  private offer(): void {
    const id = this.talking;
    if (!id) return;
    this.bag.open(store.get(), `Offrir à ${NPCS[id].name}`, () => true, (slot) => {
      this.bag.close();
      const item = getItem(slot.itemId);
      const r = removeItem(store.get(), slot.itemId, 1);
      if (!r.ok) {
        toast(this.ui, ECON_ERRORS[r.reason], 'bad');
        return;
      }
      store.set(r.state);
      toast(this.ui, `${item.icon} ${item.name} offert à ${NPCS[id].name}`);
      void this.say(`(Je t'offre : ${item.name})`, item.id);
    });
  }

  private catalog(): void {
    const s = store.get();
    const rel = s.npcs.gaston.relation;
    const buy = ITEMS.filter((i) => i.price > 0 && (i.kind !== 'tool' || countItem(s, i.id) === 0)).map((i) => ({
      icon: i.icon,
      label: i.name,
      sub: `${shopPrice(i.id, rel).price.toLocaleString('fr-FR')} 🔔${i.prestige ? ` · ★ ${i.prestige}` : ''}`,
      onPick: () => this.dialogue.prefill(`Je veux ${i.name.toLowerCase()}. Tu me fais un prix ?`),
    }));
    const sell = s.player.inventory
      .filter((slot) => getItem(slot.itemId).kind === 'resource' || getItem(slot.itemId).kind === 'story')
      .map((slot) => {
        const i = getItem(slot.itemId);
        return {
          icon: i.icon,
          label: `Vendre ${slot.qty > 1 ? `${slot.qty} × ` : ''}${i.name}`,
          sub: `~${(shopPrice(i.id, rel).sellPrice * slot.qty).toLocaleString('fr-FR')} 🔔`,
          onPick: () => this.dialogue.prefill(`Je te vends ${slot.qty > 1 ? `mes ${slot.qty} ` : 'mon '}${i.name.toLowerCase()}, combien ?`),
        };
      });
    picker(this.ui, 'Le bric-à-brac de Gaston', [...buy, ...sell]);
  }

  private acceptDeal(): void {
    const deal = this.deal;
    if (!deal || this.talking !== 'gaston') return;
    const r = applyDeal(store.get(), deal);
    this.dialogue.showDeal(null);
    this.deal = null;
    if (!r.ok) {
      toast(this.ui, ECON_ERRORS[r.reason], 'bad');
      void this.dialogue.say(r.reason === 'not-enough-bells' ? 'Hé ! Pas de clochettes, pas de marchandise. Reviens avec la bourse pleine.' : "Hmm, on dirait qu'il y a un souci, l'ami.");
      return;
    }
    const item = getItem(deal.itemId);
    store.set(recordFact(r.state, {
      day: r.state.day, actor: 'player', target: 'gaston', kind: 'deal',
      text: `Le joueur a ${deal.direction === 'buy' ? 'acheté' : 'vendu'} ${item.name} pour ${deal.price} clochettes chez Gaston.`, witnesses: ['gaston'],
    }));
    toast(this.ui, `${item.icon} ${deal.direction === 'buy' ? 'Acheté' : 'Vendu'} : ${item.name} (${deal.price.toLocaleString('fr-FR')} 🔔)`, 'good');
    this.history.push({ who: 'player', text: 'Tope là !' });
    const line = deal.direction === 'buy' ? 'Affaire conclue ! Tu fais une affaire en or… enfin, surtout moi.' : 'Marché conclu ! Ne va pas le crier sur les toits, hein.';
    this.history.push({ who: 'npc', text: line });
    this.dialogue.setEmotion('joie');
    void this.dialogue.say(line);
  }

  private refuseDeal(): void {
    this.deal = null;
    this.dialogue.showDeal(null);
    this.dialogue.prefill('Trop cher. ');
  }

  // ---------- Île : ramassage, eau ----------
  private pickUp(p: Pickup): void {
    const r = addItem(store.get(), p.itemId, 1);
    if (!r.ok) {
      toast(this.ui, ECON_ERRORS[r.reason], 'bad');
      return;
    }
    store.set({ ...r.state, pickups: r.state.pickups.filter((x) => x.id !== p.id) });
    const item = getItem(p.itemId);
    toast(this.ui, `+1 ${item.icon} ${item.name}`, 'good');
  }

  private tapWater(): void {
    if (countItem(store.get(), 'canne-a-peche') === 0) toast(this.ui, 'Il te faudrait une canne à pêche… Gaston en vend.');
    else toast(this.ui, 'Approche-toi du ponton pour pêcher 🎣');
  }

  private openBag(): void {
    if (this.bag.isOpen) {
      this.bag.close();
      return;
    }
    this.bag.open(store.get(), 'Ta sacoche', (slot) => getItem(slot.itemId).kind === 'decor', (slot) => {
      this.bag.close();
      if (!this.decorMode) this.toggleDecorMode();
      toast(this.ui, `Choisis un emplacement pour : ${getItem(slot.itemId).name}`);
    });
  }

  // ---------- Décoration ----------
  toggleDecorMode(): void {
    this.decorMode = !this.decorMode;
    this.world.showSlots(this.decorMode);
    this.decorBanner?.remove();
    this.decorBanner = null;
    if (this.decorMode) {
      this.decorBanner = h('div.banner', {}, h('span', {}, '✨ Touche un emplacement doré'), h('button', { onclick: () => this.toggleDecorMode() }, 'Terminer'));
      this.ui.append(this.decorBanner);
    }
  }

  private chooseDecor(slot: SlotId): void {
    const s = store.get();
    const current = s.decor[slot];
    const options = s.player.inventory
      .filter((i) => getItem(i.itemId).kind === 'decor')
      .map((i) => {
        const item = getItem(i.itemId);
        return { icon: item.icon, label: item.name, sub: `★ +${item.prestige}`, onPick: () => this.place(slot, item.id) };
      });
    picker(this.ui, `${SLOT_POSITIONS[slot].label}${current ? ` · ${getItem(current).name}` : ''}`, options);
  }

  place(slot: SlotId, itemId: string): void {
    const before = islandValue(store.get());
    const r = placeDecor(store.get(), slot, itemId);
    if (!r.ok) {
      toast(this.ui, ECON_ERRORS[r.reason], 'bad');
      return;
    }
    const item = getItem(itemId);
    store.set(recordFact(r.state, {
      day: r.state.day, actor: 'player', target: null, kind: 'other',
      text: `Le joueur a installé « ${item.name} » (${SLOT_POSITIONS[slot].label}).`, witnesses: [...NPC_IDS],
    }));
    const gain = islandValue(store.get()) - before;
    toast(this.ui, `${item.icon} ${item.name} installé · ★ +${gain}`, 'good');
    this.reactToDecor(itemId);
  }

  /** Réactions immédiates des habitants à une nouvelle décoration (bulles). */
  private reactToDecor(itemId: string): void {
    const item = getItem(itemId);
    const pricey = item.price >= 2500;
    const ugly = itemId === 'statue-doree-moche';
    this.bark('gaston', ugly ? 'Magnifique ! Ça, c’est du standing !' : pricey ? 'Voilà un client qui a du goût… et des moyens !' : 'Mouais. Ça manque de dorures.', 0);
    this.bark('josette', ugly ? '(Entre nous… ça gâche un peu la vue.)' : 'Oh, que c’est mignon ! Tout le monde va en parler !', 1200);
    this.bark('marius', ugly ? '… Même les mouettes détournent les yeux.' : '… Hm. Joli.', 2400);
  }

  private bark(npc: NpcId, text: string, delay: number): void {
    setTimeout(() => {
      const el = h('div.bark', {}, text);
      el.style.setProperty('--npc', NPCS[npc].color);
      this.ui.append(el);
      this.barks.push({ el, npc, until: performance.now() + 3200 });
    }, delay);
  }

  private updateBarks(): void {
    const now = performance.now();
    this.barks = this.barks.filter((b) => {
      if (now > b.until) {
        b.el.remove();
        return false;
      }
      const p = this.world.screenPos(b.npc);
      b.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
      return true;
    });
  }

  // ---------- Absence ----------
  async sleep(hours: number): Promise<void> {
    if (this.talking || this.busy) return;
    this.busy = true;
    if (this.decorMode) this.toggleDecorMode();
    this.world.setFrozen(true);
    this.hud.setVisible(false);
    const night = await nightFade(this.ui, hours);
    const s = store.get();
    const res = await absenceApi(buildAbsenceRequest(s, hours));
    const fallback = simulateAbsenceFallback(s, hours, seededRng(s.day * 131 + s.facts.length));
    const validated = res.ok ? validateAbsenceResponse(res.data, s) : null;
    const resp = validated ? mergeKeyIntents(validated, fallback) : fallback;
    if (!validated) console.info('[absence] simulation de repli (hors IA)');
    store.set(applyAbsence(s, resp, hours, Date.now()));
    const recap = store.get().pendingRecap;
    this.busy = false;
    if (!recap) {
      night.remove();
      this.afterRecap();
      return;
    }
    showRecap(this.ui, night, recap, () => this.afterRecap());
  }

  private afterRecap(): void {
    store.set((s) => ({ ...s, pendingRecap: null }));
    this.world.setFrozen(false);
    this.hud.setVisible(true);
    // Les habitants concernés prennent l'initiative : le plus remonté vient en premier.
    const s = store.get();
    const first = NPC_IDS.map((id) => ({ id, intent: s.npcs[id].intent }))
      .filter((x): x is { id: NpcId; intent: Intent } => x.intent !== null)
      .sort((a, b) => (a.intent.kind === 'confront' ? -1 : 0) - (b.intent.kind === 'confront' ? -1 : 0))[0];
    if (first) setTimeout(() => this.world.approachPlayer(first.id), 900);
  }

  // ---------- API de démo scriptable ----------
  debugState(): GameState {
    return store.get();
  }
  tierName(id: NpcId): string {
    return tierOf(store.get().npcs[id].relation).name;
  }
}

/**
 * L'IA raconte, le code décide : si la simulation IA oublie une confrontation que les faits justifient
 * (repli déterministe), on la rajoute.
 */
function mergeKeyIntents(ai: AbsenceResponse, fallback: AbsenceResponse): AbsenceResponse {
  const intents = [...ai.intents];
  for (const f of fallback.intents) {
    if (f.intent.kind === 'confront' && !intents.some((i) => i.npc === f.npc)) intents.push(f);
  }
  const transfers = [...ai.transfers];
  for (const t of fallback.transfers) {
    if (!transfers.some((x) => x.to === t.to && x.sourceId === t.sourceId)) transfers.push(t);
  }
  return { ...ai, intents, transfers };
}
