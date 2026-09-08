import { drizzle } from 'drizzle-orm/postgres-js';
import { relations } from '../../lib/big-schema-rels.ts';

export const db = drizzle({
	connection: 'postgres:/...',
	relations,
});
