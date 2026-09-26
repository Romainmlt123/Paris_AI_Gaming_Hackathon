# NOTES — RAGOTS

Mémoire du projet : fait, reste, décisions, pièges.

## Lancer
- `npm install` puis `npm run dev` (Vite :5173 + API :8787, proxy `/api`).
- Clés : `.env` avec `GEMINI_API_KEY` / `GRADIUM_API_KEY` (le serveur accepte aussi `GOOGLE_STUDIO_KEY` / `GRADIUM_KEY`).
- `npm test` (logique pure, dont le scénario de démo), `npm run typecheck`, `npm run build`.
- Captures mobiles 390×844 : `node scripts/shot.mjs <url> shots/x.png <intro|island|dialog|recap|demo>`.
  Le scénario `demo` joue toute la séquence de la section 12 (insulte → 8 h → Josette → mensonge démasqué).
- Hooks de debug : `window.ragots.{store, world, openDialog, closeDialog, doAbsence, send}`.

## Fait (branche dev-Baptiste)
- Logique pure (`src/logic/`) : relations bornées + paliers, faits vs rumeurs, déformation, simulation d'absence déterministe (graine), détection de mensonge par le code, validation/plafonnement des réponses IA, économie (prix selon relation, négociation, vente en lot, arnaque au pourri), décoration par slots + réactions, activités (pêche, arbres/ruche, pickups, papillons, enclos), A*.
- Serveur (`server/`) : `/api/talk` (Gemini `gemini-3.8-flash`, JSON strict, timeout 7 s → réplique de secours), `/api/gazette`, `/api/tts` + `/api/stt` (Gradium), `/api/health`.
- Rendu (`src/render/`) : île en tuiles instanciées, props procéduraux Three.js, sprites pixel art canvas (NearestFilter) avec vraies ombres, eau animée, herbe, cycle jour/soir, bloom, 3 niveaux de qualité (auto-baisse si < 40 fps).
- UI (`src/main.ts`, `src/ui/`) : HUD (jour, pièces, prestige, jauges), dialogue avec texte qui s'écrit + suggestions + micro + Montrer/Offrir, deal Gaston, sacoche 16 cases, déco, « Partir 3/8/24 h », récap + Gazette, « ! » et habitants qui viennent parler, tampon MENSONGE DÉMASQUÉ.

## Reste
- Assets Blender (non faits : volumes Three.js procéduraux jugés suffisants pour l'instant).
- Polish lumière de fin de journée, portraits expressifs, île d'ami.
- Vérifier sur vrai téléphone (clavier virtuel, perf), HTTPS pour le micro.

## Décisions
- Simulation d'absence calculée par le code ; Gemini n'écrit que la Gazette.
- Mensonge détecté par le code (dénégation vs faits connus du PNJ), pénalité fixe -18.
- Le PNJ qui vient parler en premier : intention la plus grave, puis le plus bavard (Josette).
- Sauvegarde localStorage `ragots-save-v2`.

## Pièges
- `gemini-3.8-flash` refuse `thinkingLevel: minimal` → `low`.
- Gradium STT exige du WAV : l'enregistrement micro est converti en WAV 16 bits côté client.
- Chromium headless : installer `fonts-noto-color-emoji` sinon les emojis sont des carrés sur les captures.
