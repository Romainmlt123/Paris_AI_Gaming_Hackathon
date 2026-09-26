import { handleTts } from '../server/voice';

export function POST(req: Request): Promise<Response> {
  return handleTts(req);
}
