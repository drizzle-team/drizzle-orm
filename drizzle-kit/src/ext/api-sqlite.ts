import type { Relations } from 'drizzle-orm/_relations';
import type { AnySQLiteTable } from 'drizzle-orm/sqlite-core';
import type { CasingType } from 'src/cli/validations/common';
import type { SqliteCredentials } from 'src/cli/validations/sqlite';

export const startStudioServer = async (
	imports: Record<string, unknown>,
	credentials: SqliteCredentials,
	options?: {
		host?: string;
		port?: number;
		casing?: CasingType;
		key?: string;
		cert?: string;
	},
) => {
	const { is } = await import('drizzle-orm');
	const { SQLiteTable } = await import('drizzle-orm/sqlite-core');
	const { Relations } = await import('drizzle-orm/_relations');
	const { drizzleForSQLite, prepareServer } = await import('../cli/commands/studio');

	const sqliteSchema: Record<string, Record<string, AnySQLiteTable>> = {};
	const relations: Record<string, Relations> = {};

	Object.entries(imports).forEach(([k, t]) => {
		if (is(t, SQLiteTable)) {
			const schema = 'public'; // sqlite does not have schemas
			sqliteSchema[schema] = sqliteSchema[schema] || {};
			sqliteSchema[schema][k] = t;
		}

		if (is(t, Relations)) {
			relations[k] = t;
		}
	});

	const setup = await drizzleForSQLite(credentials, sqliteSchema, relations, [], options?.casing);
	const server = await prepareServer(setup);

	const host = options?.host || '127.0.0.1';
	const port = options?.port || 4983;
	server.start({
		host,
		port,
		key: options?.key,
		cert: options?.cert,
		cb: (err) => {
			if (err) {
				console.error(err);
			} else {
				console.log(`Studio is running at ${options?.key ? 'https' : 'http'}://${host}:${port}`);
			}
		},
	});
};
