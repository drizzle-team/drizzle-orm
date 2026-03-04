import type { Relations } from 'drizzle-orm/_relations';
import type { AnyMySqlTable } from 'drizzle-orm/mysql-core';
import type { CasingType } from 'src/cli/validations/common';
import type { MysqlCredentials } from 'src/cli/validations/mysql';

export const startStudioServer = async (
	imports: Record<string, unknown>,
	credentials: MysqlCredentials,
	options?: {
		host?: string;
		port?: number;
		casing?: CasingType;
		key?: string;
		cert?: string;
	},
) => {
	const { is } = await import('drizzle-orm');
	const { MySqlTable, getTableConfig } = await import('drizzle-orm/mysql-core');
	const { Relations } = await import('drizzle-orm/_relations');
	const { drizzleForMySQL, prepareServer } = await import('../cli/commands/studio');

	const mysqlSchema: Record<string, Record<string, AnyMySqlTable>> = {};
	const relations: Record<string, Relations> = {};

	Object.entries(imports).forEach(([k, t]) => {
		if (is(t, MySqlTable)) {
			const schema = getTableConfig(t).schema || 'public';
			mysqlSchema[schema] = mysqlSchema[schema] || {};
			mysqlSchema[schema][k] = t;
		}

		if (is(t, Relations)) {
			relations[k] = t;
		}
	});

	const setup = await drizzleForMySQL(credentials, mysqlSchema, relations, [], options?.casing);
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
