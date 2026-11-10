import { SuperJSON } from '../shared/superjson.js';

export function deserializeResponse<T>(text: string): T {
  return SuperJSON.parse(text) as T;
}
