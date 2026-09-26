import { handleStt } from '../server/voice.js';

export function POST(req: Request): Promise<Response> {
  return handleStt(req);
}
