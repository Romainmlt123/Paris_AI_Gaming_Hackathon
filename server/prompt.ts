import { NPCS } from '../src/data/npcs.ts';
import type { AbsenceReport, TalkRequest } from '../src/state/types.ts';
import { EMOTIONS, TALK_EVENT_KINDS } from '../src/state/types.ts';

export function talkPrompt(req: TalkRequest, playerName: string): { system: string; user: string } {
  const s = NPCS[req.npc];
  const c = req.context;
  const others = c.bonds.map((b) => `${NPCS[b.npc].name} (${b.value > 50 ? 'très proche' : b.value > 10 ? 'bonne entente' : b.value < -10 ? 'rivalité' : 'neutre'}, ${b.value})`).join(', ');
  const system = [
    `Tu es ${s.name}, ${s.role} sur une petite île cozy (jeu RAGOTS). Tu parles UNIQUEMENT en français.`,
    `Personnalité : ${s.personality}`,
    `Façon de parler : ${s.speech}`,
    `Tu aimes : ${s.likes.join(', ')}. Tu détestes : ${s.dislikes.join(', ')}.`,
    'Règles : réponses courtes (1 à 3 phrases, max 45 mots), drôles, un peu mesquines, jamais vulgaires. Reste dans ton personnage.',
    'Tu ne connais QUE les faits et rumeurs listés. Les rumeurs peuvent être fausses ou exagérées : tu peux les croire.',
    'Tu ne décides pas de l’état du jeu : tu proposes, le code valide.',
    'Réponds STRICTEMENT en JSON avec les clés :',
    `{"reply": string, "emotion": un de ${JSON.stringify(EMOTIONS)}, "events": [{"kind": un de ${JSON.stringify(TALK_EVENT_KINDS)}, "text": "phrase neutre à la 3e personne décrivant ce que ${playerName} vient de faire", "target": "gaston"|"josette"|"marius"|"player"|null}], "relationDelta": entier de -12 à 12 (ton ressenti sur cette réplique), "reason": "raison en 6 mots max", "intent": null, "suggestions": [3 répliques courtes (max 8 mots) que le joueur pourrait dire ensuite, variées : une gentille, une mesquine, une curieuse], "deal": null ou {"itemId", "direction": "buy"|"sell" du point de vue du joueur, "qty", "price": total}, "denials": [ids des faits connus que le joueur nie dans sa dernière réplique], "acceptGift": booléen}`,
    'events : seulement si le joueur fait vraiment quelque chose de notable (insulte, compliment, flatterie, menace, promesse, excuse, aveu, mensonge...). Le "text" doit nommer la cible, ex : "Le joueur a traité Marius de vieux radoteur." Si le joueur insulte ou critique quelqu’un d’absent, target = cette personne.',
  ].join('\n');

  const lines: string[] = [];
  lines.push(`Jour ${c.day}, ${Math.floor(c.hour)}h. Le joueur s'appelle ${playerName}.`);
  lines.push(`Ta relation avec le joueur : ${c.relation}/100 (${c.tier}). Ton humeur : ${c.mood}. Mensonges déjà démasqués : ${c.liesCaught}.`);
  lines.push(`Tes liens : ${others}.`);
  if (c.memories.length) lines.push(`Tes souvenirs :\n- ${c.memories.join('\n- ')}`);
  if (c.knownFacts.length) lines.push(`Faits que tu as vus de tes yeux (id : texte) :\n${c.knownFacts.map((f) => `- ${f.id} : ${f.text}`).join('\n')}`);
  if (c.heardRumors.length) lines.push(`Rumeurs qu'on t'a racontées :\n${c.heardRumors.map((r) => `- ${r.factId ?? '?'} (par ${r.from}) : ${r.text}`).join('\n')}`);
  if (c.decor.length) lines.push(`Décorations sur l'île : ${c.decor.join(', ')}. Valeur de l'île : ${c.islandValue}.`);
  if (c.playerStung) lines.push("Le joueur a le visage tout gonflé de piqûres de guêpes (c'est hilarant).");
  if (c.intent) lines.push(`Tu es venu·e voir le joueur pour cette raison : ${c.intent.kind} — « ${c.intent.text} ».`);
  if (c.denial) lines.push(`ATTENTION : le joueur vient de nier « ${c.denial.text} ». Or tu SAIS que c'est vrai. Démasque-le avec aplomb, sois blessé·e et piquant·e. emotion = "colere" ou "mefiance".`);
  if (c.offeredItem) lines.push(`Le joueur te tend : ${c.offeredItem.name} (tags : ${c.offeredItem.tags.join(', ') || 'aucun'}). Réagis selon tes goûts ; acceptGift = true si tu le prends.`);
  if (c.shopPrices) lines.push(`Ton catalogue (prix pour ce joueur) : ${c.shopPrices.map((p) => `${p.itemId}=${p.name} ${p.price}p`).join(' ; ')}.`);
  if (c.deal) lines.push(`Négociation en cours (${c.deal.direction === 'sell' ? 'le joueur te vend' : 'le joueur t’achète'} ${c.deal.items.map((i) => `${i.qty} ${i.itemId}`).join(', ')}) : ton offre actuelle ${c.deal.price} pièces, valeur réelle ${c.deal.reference}. Bluffe, marchande, cède peu. Mets ta nouvelle offre dans "deal" (même itemId/direction/qty, price = ton nouveau total).`);
  lines.push(`Inventaire du joueur : ${c.inventory.map((i) => `${i.qty} ${i.name}`).join(', ') || 'vide'}.`);
  if (req.history.length) lines.push(`Conversation en cours :\n${req.history.slice(-8).map((h) => `${h.who === 'player' ? playerName : s.name} : ${h.text}`).join('\n')}`);
  lines.push(req.playerText ? `${playerName} te dit maintenant : « ${req.playerText} »` : 'Le joueur s’approche : c’est toi qui ouvres la conversation (courte réplique d’accroche).');
  return { system, user: lines.join('\n\n') };
}

export function gazettePrompt(report: AbsenceReport, playerName: string, islandValue: number): { system: string; user: string } {
  return {
    system:
      'Tu écris « La Gazette de l’île », un petit journal à potins, drôle, un peu mesquin, en français. Réponds en JSON strict : {"headline": "gros titre accrocheur (max 9 mots)", "articles": [{"title": "titre court", "body": "1 à 2 phrases"}]} avec 2 à 3 articles. N’invente aucun fait : reformule seulement ceux donnés, avec humour.',
    user: `Joueur : ${playerName}. Absence de ${report.hours} h, jour ${report.day}. Valeur de l'île : ${islandValue}.\nCe qui s'est passé :\n- ${report.lines.join('\n- ')}\nRelations modifiées :\n- ${report.relationChanges.map((r) => `${NPCS[r.npc].name} ${r.delta > 0 ? '+' : ''}${r.delta} (${r.reason})`).join('\n- ') || 'aucune'}`,
  };
}
