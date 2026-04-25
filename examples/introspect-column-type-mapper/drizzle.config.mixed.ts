/**
 * Example 3 — Mixed strategy: jOOQ-style rule matching
 *
 * Demonstrates matching by column name, table name, and SQL type — the same
 * flexibility that jOOQ's `forcedTypes` provides, expressed as plain TypeScript.
 *
 * Rules:
 *  - `created_at` / `updated_at` / `deleted_at` on any table → dayjsTimestamp
 *  - All other timestamps on the `events` table → luxonTimestamp
 *  - All remaining timestamps → native Date mode
 *  - Everything else → default (no override)
 */

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DATABASE_URL!,
	},
	out: './drizzle',
	schema: './schema.ts',

	introspect: {
		casing: 'camel',
		columnTypeMapper: ({ column, table, sqlType }) => {
			if (!sqlType.startsWith('timestamp')) return undefined;

			// Audit columns everywhere → dayjs
			if (/^(created_at|updated_at|deleted_at)$/.test(column)) {
				return {
					typeName: 'dayjsTimestamp',
					typeImport: { name: 'dayjsTimestamp', from: './custom-types' },
				};
			}

			// Events table → luxon (for timezone-aware handling)
			if (table === 'events') {
				return {
					typeName: 'luxonTimestamp',
					typeImport: { name: 'luxonTimestamp', from: './custom-types' },
				};
			}

			// All other timestamps → native Date
			return { mode: 'date' };
		},
	},
});
