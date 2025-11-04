import { is } from 'drizzle-orm';
import { Relations } from 'drizzle-orm/_relations';
import { AnyMySqlTable, getTableConfig, MySqlTable } from 'drizzle-orm/mysql-core';
import { CasingType } from 'src/cli/validations/common';
import { MysqlCredentials } from 'src/cli/validations/mysql';
import { certs } from 'src/utils/certs';

export const startStudioServer = async (
	imports: Record<string, unknown>,
	credentials: MysqlCredentials,
	options?: {
		host?: string;
		port?: number;
		casing?: CasingType;
	},
) => {
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
