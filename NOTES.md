# NOTES — RAGOTS

Mémoire du projet : fait, reste, décisions, pièges. Branche de travail : `dev-claude`.

## Lancer
- `npm run dev` → Vite (5173, `--host` pour le téléphone sur le LAN) + API Node (8787, proxy `/api`).
- `npm test` (Vitest, logique pure) · `npm run typecheck`.
- `node scripts/shot.mjs [url] [out.png]` : capture 390×844.
- `node scripts/demo.mjs "http://localhost:5173/?q=low"` : scénario de démo complet (section 12) avec captures dans `shots/`.
- `node scripts/activities.mjs` : ruche + Josette moqueuse + pêche.
- URL : `?q=low|medium|high` force la qualité (et bloque l'auto-dégradation), `?fps` affiche le compteur hors dev.
- API démo : `window.__ragots` (talk, say, close, sleep, give, bells, place, shake, fishAt, forceShake, forceFish, reset, state).

## Fait
- Île HD-2D 100 % procédurale (Three.js) : plateau d'herbe extrudé + falaises, colline, plage polaire, eau shader (écume, reflets), 4 bâtiments, ponton, arbres instanciés avec vent, touffes, fleurs, rochers, chemin.
- Rendu : caméra 48°, focale serrée, tilt-shift + étalonnage + vignette en une passe, bloom (high), ombres de feuillage/nuages mouvantes injectées dans les matériaux du sol, lumière selon l'heure.
- Sprites pixel art générés en code (16×24, 2 frames de marche), ombre de silhouette via un plan projecteur tourné vers le soleil, « ! » au-dessus des habitants.
- Logique pure testée (35 tests) : relations/paliers, rumeurs (faits ≠ rumeurs), validation IA, économie, absence + repli déterministe, activités.
- Serveur : `/api/talk`, `/api/absence` (Gemini `gemini-3.8-flash`, thinking low, ~2 s), `/api/tts` (Gradium), `/api/health`. Répliques de secours partout.
- UI : HUD (jour, valeur de l'île, clochettes animées, puces relation avec « ! »), dialogue rétro typewriter + portraits expressifs + suggestions + variation expliquée, sacoche 16 cases, catalogue Gaston, deal borné, déco par emplacements + réactions (bulles), nuit + récap, initiative (l'habitant vient parler).
- Activités : pêche (tap au bon moment, poulpe doré rare), secouer les arbres (fruits, pomme dorée, ruche → visage gonflé + Josette se moque), enclos (Flocon le mouton-nuage : fruit → laine dorée ; oublié → ragot).
- Audio procédural (blips par personnage, ambiance vagues/mouettes, sfx) ; son actif par défaut, bouton 🔊.

## Reste
- Clé Gradium vide dans `.env` → voix non testée en vrai.
- Tester sur vrai téléphone (fps, clavier iOS/Android).
- Vercel : brancher `server/handlers.ts` dans `api/*.ts` (attention réponse binaire TTS).
- Bonus : micro (STT), île d'ami visitable.

## Décisions
- Pas de Blender (non installé) : tout en Three.js procédural, plus rapide à itérer.
- Les intentions (« ! ») sont décidées par le code (absence, ruche) ; celles proposées par l'IA en conversation sont ignorées.
- Si la simulation IA d'absence oublie une confrontation justifiée par les faits, on fusionne avec le repli déterministe (`mergeKeyIntents`).
- Josette démarre à 25 (Copain) pour que la chute de jauge fasse changer de palier pendant la démo.
- Réveil à 8h minimum après une nuit (la démo reste de jour).

## Pièges
- Billboard face caméra = ombre en trait vu du soleil → plan projecteur séparé (`colorWrite:false`, `side: DoubleSide` sinon culling dans la passe d'ombre).
- `PCFSoftShadowMap` retiré de three r186 → `PCFShadowMap`.
- Police pixel : les chiffres 5/8 ressemblent à S → chiffres en Nunito.
- Animations CSS `pop` écrasent `transform: translateX(-50%)` → centrer avec `left:0; right:0; margin:auto`.
- Gemini 3.8 Flash refuse `thinkingLevel: 'minimal'` (seulement low/medium/high).
- En headless (swiftshader) le jeu tourne à ~25 fps et l'auto-qualité descend : utiliser `?q=` pour les captures.
- `pkill -f server/index` tue le shell de l'outil : filtrer avec ps+awk.
