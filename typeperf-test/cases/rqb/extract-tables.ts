import type { ExtractTablesFromSchema } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type * as schema from '../../lib/big-schema.ts';

export const db = drizzle({
	connection: 'postgres:/...',
});

export type Tables = ExtractTablesFromSchema<typeof schema.tables>;
