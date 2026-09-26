# RAGOTS — Plan onboarding (format démo 3 min)

## Constat
- Aucun écran d'accueil : le jeu démarre directement sur l'île.
- `GameState` ne stocke ni prénom du joueur, ni nom de l'île, ni apparence.
- Les PNJ disent « le joueur » dans leurs prompts (server/talk.ts).
- Déjà prêt : skin naufragé + mosaïque, `world.setPlayerSkin`, sauvegarde localStorage, `?reset`.

## Budget démo (3 min)
| Temps | Séquence |
|---|---|
| 0:00–0:10 | Écran titre RAGOTS (logo, île en fond qui tourne, « Toucher pour commencer ») |
| 0:10–0:40 | Création du perso + nom de l'île (≤ 30 s, pré-rempli, bouton « Au hasard ») |
| 0:40–1:05 | Cinématique : naufragé tout nu échoué sur la plage, les 3 PNJ accourent |
| 1:05–3:00 | Gameplay existant (ragots, bagarre, meurtre…) |

## P0 — indispensable pour la démo
1. **Écran titre** (DOM par-dessus la scène 3D) : logo pixel « RAGOTS », slogan (« Une île mignonne. Des voisins qui parlent. Trop. »), caméra en orbite lente sur l'île, bouton « Nouvelle partie » / « Continuer » si sauvegarde.
2. **Création du perso** en 1 écran, aperçu du sprite en direct (canvas `drawSheet`, rotation face/dos au tap) :
   - Prénom (champ texte, 12 car., défaut aléatoire).
   - Couleur de peau (4 pastilles), coiffure (short / bun / cap / beanie — déjà dans le moteur), couleur des cheveux (5), couleur du haut (6).
   - Bouton « Au hasard » (dé) pour aller vite en démo.
   - Tout existe déjà dans `SpriteSpec` → peu de code : on génère le `SpriteSpec` du joueur à partir des choix.
3. **Nom de l'île** : champ + 3 propositions drôles cliquables (« Île-aux-Commères », « Potinville », « Ragot-sur-Mer »).
4. **Persistance** : `GameState.profile = { name, island, look }` (version de save bumpée, migration simple), le skin choisi est appliqué après la cinématique.
5. **Injection dans l'IA** : prénom + nom de l'île dans le prompt de `/api/talk` et dans les répliques de secours → les PNJ appellent le joueur par son prénom et râlent sur « ton île de Potinville ». C'est l'effet « wow » de la démo, 2 lignes de prompt.

## P1 — fort impact, rapide
6. **Cinématique d'arrivée** (≈ 20 s, passable au tap) : fondu depuis l'écran perso → plan sur la mer → le naufragé (skin castaway + mosaïque) s'échoue sur le sable, se relève, se gratte les fesses de dos → Josette hurle « UN HOMME TOUT NU ! » → les 3 PNJ accourent, bulles de dialogue scriptées → Gaston lui vend des fringues « à prix d'ami » → le skin choisi apparaît (petit nuage de poussière réutilisé de brawl.ts).
7. **Première rumeur gratuite** : le fait « Est arrivé tout nu sur la plage » est créé au jour 1 → les PNJ en reparlent immédiatement, démontre le système de ragots dès la 1re minute.
8. **Tutoriel contextuel minimal** : 3 bulles d'aide max (« Tape sur un habitant pour lui parler », « Ce que tu dis sera répété… », « Ouvre ton sac »), qui disparaissent après usage.

## P2 — si le temps le permet
9. Musique/jingle d'intro + voix Gradium sur le cri de Josette.
10. Choix d'un « trait » de départ (Radin / Bavard / Charmeur) qui modifie les jauges initiales et est connu des PNJ.
11. Accessoire bonus (lunettes, fleur dans les cheveux).

## Hors scope (volontairement)
- Comptes / cloud save, choix du genre avec sprites différents, éditeur libre des couleurs, plusieurs îles.

## Mode démo
- `?demo` : pré-remplit prénom/île, raccourcit la cinématique, désactive les délais aléatoires → démo reproductible.
- `?skip-intro` pour les autres équipes qui testent le gameplay.

## Découpage technique
- `src/ui/onboarding.ts` (écran titre + création + nom de l'île, DOM/CSS pixel).
- `src/game/intro.ts` (cinématique scriptée : timeline de promesses sur `world` — caméra, déplacements, bulles).
- `shared/types.ts` + `shared/state.ts` + `src/game/save.ts` (profile, migration).
- `server/talk.ts` + `shared/fallback.ts` (prénom / île dans les répliques).
- Tests : migration de save, génération du `SpriteSpec` depuis le profil, prompt contenant prénom et île.

Estimation : P0 + P1 ≈ une session de travail.

## État d'avancement (feature/rouge)
- [x] P0 — écran titre, création perso (prénom, peau, coiffure, cheveux, haut, aperçu face/dos, au hasard), nom de l'île, sauvegarde + migration, prénom et île dans les prompts `/api/talk` et `/api/simulate`.
- [x] P1 — cinématique d'arrivée (~20 s, bouton « Passer »), première rumeur « X a débarqué tout nu sur la plage de Y », 3 bulles d'aide (parler, ragots, absence).
- [x] Mode démo : `?demo` (île pré-remplie, cinématique accélérée), `?skip-intro`, `?name=` / `?island=` pour pré-remplir.
- [x] P2 partiel — voix Gradium des répliques de la cinématique quand le son est activé.
- [ ] P2 restant — jingle, trait de caractère, accessoire.

## Itération 2 (retours Romain)
- Écran d'accueil plein écran opaque, style « lobby » (rayons animés, logo géant, trio de PNJ, bouton JOUER) : on ne voit plus l'île.
- Création du perso sur le même fond ; le perso est prévisualisé nu (mosaïque), la couleur du haut est retirée.
- Cinématique : le joueur dérive nu sur un radeau pendant 5 cartons (objectif, parler aux habitants, chaque mot compte, meilleurs amis / pires ennemis), puis le radeau s'échoue au ponton, point de départ du joueur.
- Le joueur reste nu en jeu : personne ne l'habille. Les PNJ le savent (prompt `/api/talk`).
