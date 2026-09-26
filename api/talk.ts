import { handleTalk } from '../server/talk.js';

export function POST(req: Request): Promise<Response> {
  return handleTalk(req);
}
