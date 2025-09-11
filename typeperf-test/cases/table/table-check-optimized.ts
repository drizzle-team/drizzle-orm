import { drizzle } from 'drizzle-orm/node-postgres';
import type { Table } from '../../lib/optimized-tables.ts';
import type { schema } from '../../lib/schema-optimized.ts';

export type Schema = typeof schema;

export const db = drizzle({ connection: 'postgres:/...' });

// type Check<TTables extends Record<string, Table>> = {
// 	[K in keyof TTables]: TTables[K]['_'];
// };
type Check<TTable extends Table> = TTable;

export type Tmp = Check<typeof schema['user']>;
