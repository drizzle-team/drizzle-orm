/**
 * Example 1 — Built-in mode override
 *
 * The simplest case: use Drizzle's native `Date` mode for all timestamp and
 * date columns instead of the default `'string'` mode.
 *
 * Generated output changes from:
 *   createdAt: timestamp("created_at", { mode: 'string' })
 * to:
 *   createdAt: timestamp("created_at", { mode: 'date' })
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
		columnTypeMapper: ({ sqlType }) => {
			if (sqlType.startsWith('timestamp') || sqlType === 'date') {
				return { mode: 'date' };
			}
		},
	},
});
