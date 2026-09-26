import { handleSttToken } from '../server/voice';

export function POST(): Promise<Response> {
  return handleSttToken();
}
