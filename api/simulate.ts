import { handleSimulate } from '../server/simulate';

export function POST(req: Request): Promise<Response> {
  return handleSimulate(req);
}
