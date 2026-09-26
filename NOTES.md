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
