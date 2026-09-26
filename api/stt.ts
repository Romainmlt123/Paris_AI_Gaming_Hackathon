import { handleStt } from '../server/voice';

export function POST(req: Request): Promise<Response> {
  return handleStt(req);
}
