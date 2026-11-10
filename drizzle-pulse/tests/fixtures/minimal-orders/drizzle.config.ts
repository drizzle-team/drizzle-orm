import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

export default {
  dialect: 'postgresql' as const,
  schema: resolve(dir, 'schema.ts'),
  out: resolve(dir, 'drizzle'),
};
