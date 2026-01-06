// Baseline: minimal imports, no type operations
import { integer, pgTable } from 'drizzle-orm/pg-core';

export const t = pgTable('t', {
	id: integer(),
});
