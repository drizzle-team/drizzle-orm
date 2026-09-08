import { drizzle } from 'drizzle-orm/node-postgres';
import type { schema } from '../../lib/schema.ts';

export type Schema = typeof schema;

export const db = drizzle({ connection: 'postgres:/...' });

type Check<TTables extends Record<string, { _: { brand: 'Table' } }>> = {
	[K in keyof TTables]: TTables[K]['_'];
};

export type Tmp = Check<typeof schema>;
