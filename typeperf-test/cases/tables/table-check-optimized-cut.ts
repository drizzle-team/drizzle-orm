import { drizzle } from 'drizzle-orm/node-postgres';
// import type { Table } from '../../lib/optimized-tables-cut.ts';
import type * as schema from '../../lib/schema-optimized-cut.ts';

export const db = drizzle({ connection: 'postgres:/...' });

export type Check<TTables> = TTables;

export type Tmp = Check<typeof schema>;
