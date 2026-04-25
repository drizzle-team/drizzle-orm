/**
 * Example 2 — Custom type: dayjs
 *
 * Replace all timestamp columns with a custom `dayjsTimestamp` type defined in
 * `./custom-types.ts`. The generated schema.ts will import `dayjsTimestamp`
 * from `./custom-types` and use it instead of the built-in `timestamp()`.
 *
 * Generated output changes from:
 *   import { timestamp, pgTable } from "drizzle-orm/pg-core"
 *   createdAt: timestamp("created_at", { mode: 'string' })
 *
 * to:
 *   import { pgTable } from "drizzle-orm/pg-core"
 *   import { dayjsTimestamp } from "./custom-types";
 *   createdAt: dayjsTimestamp("created_at")
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
			if (sqlType.startsWith('timestamp')) {
				return {
					typeName: 'dayjsTimestamp',
					typeImport: { name: 'dayjsTimestamp', from: './custom-types' },
				};
			}
		},
	},
});
