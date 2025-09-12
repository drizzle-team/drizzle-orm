import { drizzle } from 'drizzle-orm/node-postgres';
import type { schema } from '../../lib/schema.ts';

export type Schema = typeof schema;

export const db = drizzle({ connection: 'postgres:/...' });

type Check<TTables extends Record<string, unknown>> = {
	[K in keyof TTables as TTables[K] extends { _: { brand: 'Table'; name: string; columns: any } } ? K : never]:
		TTables[K] extends { _: { columns: infer Columns } } ? Columns : never;
};

export type Tmp = Check<typeof schema>;
