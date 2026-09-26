import { handleTts } from '../server/voice.js';

export function POST(req: Request): Promise<Response> {
  return handleTts(req);
}
