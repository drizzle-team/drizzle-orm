import { is } from 'drizzle-orm';
import { Relations } from 'drizzle-orm/_relations';
import { AnySQLiteTable, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { CasingType } from 'src/cli/validations/common';
import { SqliteCredentials } from 'src/cli/validations/sqlite';
import { certs } from 'src/utils/certs';

export const startStudioServer = async (
	imports: Record<string, unknown>,
	credentials: SqliteCredentials,
	options?: {
		host?: string;
		port?: number;
		casing?: CasingType;
	},
) => {
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
	const { key, cert } = (await certs()) || {};
	server.start({
		host,
		port,
		key,
		cert,
		cb: (err) => {
			if (err) {
				console.error(err);
			} else {
				console.log(`Studio is running at ${key ? 'https' : 'http'}://${host}:${port}`);
			}
		},
	});
};
