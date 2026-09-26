import { handleSimulate } from '../server/simulate.js';

export function POST(req: Request): Promise<Response> {
  return handleSimulate(req);
}
