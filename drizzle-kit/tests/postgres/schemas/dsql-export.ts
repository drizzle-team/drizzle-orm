import { index, integer, pgTable, uuid } from 'drizzle-orm/pg-core';

export const dsqlExport = pgTable('dsql_export', { id: uuid().primaryKey(), age: integer() }, (t) => [
	index('dsql_export_age_idx').on(t.age),
]);
