# NOTES — RAGOTS

Mémoire du projet : fait, reste, décisions, pièges.

## Fait
- Init du repo : CLAUDE.md (instructions + brief), .gitignore, branche `dev-romain`.
- Socle Vite 8 + Three.js 0.186 + TS strict + Vitest. `npm run dev` sert le jeu ET les routes `api/*` (middleware Vite).
- Logique pure testée (`shared/`) : état, relations/paliers, faits vs rumeurs, validation IA, répliques de secours, simulation d'absence, économie (marchandage Gaston, achat, slots déco, valeur de l'île), réplique d'initiative.
- `/api/talk` et `/api/simulate` : Gemini (`gemini-3.8-flash`, JSON mode, timeout 7 s / 9 s), repli systématique.
- Rendu HD-2D : île en tuiles instanciées (carte procédurale 24×30 + A*), eau shader (écume, dégradé), arbres/rochers/fleurs, 5 bâtiments, sprites pixel art générés en canvas avec vraies ombres (customDepthMaterial), bloom + tilt-shift, 3 niveaux de qualité + gouverneur fps.
- UI DOM : HUD (jour, ★ valeur, pièces, 3 jauges), dialogue typewriter + suggestions + saisie au-dessus du clavier (`--kb` via visualViewport), récap d'absence, toasts, bottom sheets (sac, échoppe, slots).
- Démo section 12 jouable de bout en bout, vérifiée en Playwright 390×844. Hooks `window.ragots` pour l'enregistrement scripté.

## Reste
- Voix Gradium (TTS habitants), activités (pêche, cueillette), objets à montrer/offrir.
- Lumière plus « fin de journée » (teinte, ombre de feuillage mouvante), portraits expressifs.
- Perf réelle sur téléphone (le headless tourne en SwiftShader ≈ 10-15 fps, non représentatif).

## Décisions
- Pas de serveur Node séparé : fonctions `api/*.ts` compatibles Vercel, servies en dev par un middleware Vite.
- Île construite en Three.js (tuiles) plutôt que Blender : plus rapide à itérer, cohérent HD-2D. Blender reste dispo pour des props.
- Sprites générés par code (canvas) : 100 % originaux, zéro asset externe.
- La simulation d'absence fusionne IA + règles (`mergeSim`) : la rumeur Marius → Josette est garantie même si l'IA l'omet.
- L'habitant qui vient parler en premier après le récap = premier « veut te parler » du récap (Josette dans la démo).
- `?reset` efface la sauvegarde, `?q=low|mid|high` force la qualité.

## Pièges
- npm Arborist plante (`edgesOut`) : `.npmrc` avec `legacy-peer-deps=true`.
- Le secret Devin s'appelle `GOOGLE_STUDIO_KEY` : `server/gemini.ts` accepte aussi `GEMINI_API_KEY`.
- InstancedMesh + BoxGeometry : passer UN matériau (pas un tableau d'un seul), sinon 5 faces sur 6 disparaissent.
- Les emojis n'apparaissent pas en headless (pas de police emoji), OK sur téléphone.

## Passe graphismes HD (branche devin/*-hd-graphics)
- Sprites 32×48 (au lieu de 16×24) avec ombrage, reflets et yeux détaillés ; acteurs 1.5 u de haut ; portraits recadrés 24 px.
- Textures procédurales 64 px/tuile : pavés avec joints, herbe à brins, sable ridé, planches veinées, pierres, tuiles de toit.
- Herbe 3D : `src/render/grass.ts`, touffes instanciées animées par le vent (vertex shader) ; densité par niveau de qualité via `mesh.count` (low 3 / mid 7 / high 14 passes par tuile). Piège : `DoubleSide` inverse la normale des faces arrière → brins noirs ; on duplique les triangles dans les deux sens.
- Feuillage : couronnes en cartes de feuilles alpha (texture canvas lissée), normales sphériques, ombres via `customDepthMaterial` ; buissons en bord d'île.
- Lumière rasante chaude (ombres longues), shadow map 4096 en high, passe d'étalonnage finale (saturation, teinte chaude, vignette), caméra plus proche.
- Eau : fond plus sombre au large, crêtes pixelisées animées.

## Dialogues IA
- Filtres de sécurité Gemini désactivés (`safetySettings` à `OFF`, server/gemini.ts) : les habitants encaissent insultes et grossièretés et répondent dans leur personnage au lieu de tomber sur la réplique de secours.
- Timeouts : serveur 9 s, client 11 s (réponse Gemini typique ~1,3 s).
- Piège : un serveur Vite lancé depuis une autre branche renvoyait 404 sur /api/talk → toutes les répliques passaient par le secours. Relancer `npm run dev` après un changement de branche.

## Bagarres & meurtres (shared/violence.ts)
- Jauge d'amitié affichée en % : `(relation + 100) / 2`. 10 % = relation -80, 0 % = -100.
- Franchir 10 % vers le bas → bagarre nuage (3,4 s, onomatopées DOM, secousse caméra), puis +15 et rumeur « se sont battus ».
- Atteindre 0 % → le PNJ tue le joueur avec son arme (caisse / rouleau / espadon), fantôme, carte de décès, réveil le lendemain 8h00, pièces /2, relation du tueur remise à -40, les deux autres viennent parler du meurtre.
- Humeurs au-dessus des PNJ : cœur ≥ 75 %, orage ≤ 25 %, crâne ≤ 18 % (jauge HUD qui clignote).
- Hook démo : `ragots.clash('marius', 'fight' | 'murder')`.

## Clavier / souris (src/main.ts, world.move)
- ZQSD + WASD + flèches : déplacement libre, bloqué par `canStep` (murs, buissons, marches > 1). Annule le chemin tap-to-move.
- E / Espace / Entrée : parle à l'habitant le plus proche (≤ 6 cases, on marche jusqu'à lui) ; si le dialogue est ouvert, focus du champ.
- Échap : quitte le champ, ferme la feuille du dessus, puis le dialogue. I / B : sac.
- Souris : clic = tap existant, curseur main au survol des habitants/slots. Aide clavier affichée ≥ 721 px ; HUD/dialogue plafonnés à 620 px sur desktop.
- `ragots.pos()` expose la position joueur pour les scripts de démo.

## Eau & sable
- Eau : bandes de profondeur, caustiques cellulaires fines (masquées par bruit), rides, reflets, écume de rivage, sable mouillé.
- Sable : damier 2×2 multi-tons, rides décalées aléatoirement, galets et coquillages.

## Onboarding / cinématique (branche feature/rouge)
- Skin « naufragé » : `SPRITES.castaway` (`naked: true`, src/render/sprites.ts) — tout nu, fesses et corps dans la planche ; gros floutage mosaïque animé (plus large que le perso, recalculé 9×/s, pulse + tangage) ajouté par l'acteur (src/render/actor.ts, censorMosaic) quand il fait face caméra, fesses visibles de dos (marque de bronzage + joues roses), algue dans les cheveux.
- Changer le skin du joueur à chaud : `world.setPlayerSkin('castaway' | 'player')`, hook `ragots.skin(...)`, ou `?skin=castaway` au chargement.
