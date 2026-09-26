import { handleTalk } from '../server/talk';

export function POST(req: Request): Promise<Response> {
  return handleTalk(req);
}
