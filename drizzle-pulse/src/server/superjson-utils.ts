import { SuperJSON } from '../shared/superjson.js';

export function serializeResponse(data: unknown) {
  return SuperJSON.stringify(data);
}
