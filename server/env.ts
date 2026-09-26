// Lecture de la configuration serveur. Les clés ne sont jamais loguées ni renvoyées au client.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  // Natif depuis Node 20.12 : ne remplace pas les variables déjà définies dans l'environnement.
  process.loadEnvFile(envPath);
} else {
  console.warn('[env] Pas de fichier .env : mode réplique de secours si GEMINI_API_KEY absente.');
}

function readString(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

function readPort(): number {
  const raw = readString('PORT', '8787');
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.warn(`[env] PORT invalide (« ${raw} »), utilisation de 8787.`);
    return 8787;
  }
  return port;
}

export const env = {
  geminiApiKey: readString('GEMINI_API_KEY', ''),
  // Flash stable le plus récent d'après https://ai.google.dev/gemini-api/docs/models (sept. 2026).
  geminiModel: readString('GEMINI_MODEL', 'gemini-3.8-flash'),
  // Niveau de réflexion : 'low' = latence minimale sur les Flash 3.x. Vide = ne pas envoyer thinkingConfig.
  geminiThinkingLevel: readString('GEMINI_THINKING_LEVEL', 'low'),
  gradiumApiKey: readString('GRADIUM_API_KEY', ''),
  port: readPort(),
} as const;

export const hasGemini = env.geminiApiKey.length > 0;
export const hasGradium = env.gradiumApiKey.length > 0;
