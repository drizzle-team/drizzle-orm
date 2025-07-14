import { drizzle } from 'drizzle-orm/node-postgres';
import type { Table } from '../../lib/optimized-tables.ts';
import type { schema } from '../../lib/schema-optimized.ts';

export const db = drizzle({ connection: 'postgres:/...' });

type Check<TTables extends Record<string, Table>> = {
	[K in keyof TTables]: TTables[K]['_'];
};

export type Tmp = Check<typeof schema>;
