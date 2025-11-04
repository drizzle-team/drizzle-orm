import { is } from 'drizzle-orm';
import { Relations } from 'drizzle-orm/_relations';
import { AnySingleStoreTable, getTableConfig, SingleStoreTable } from 'drizzle-orm/singlestore-core';
import { CasingType } from 'src/cli/validations/common';
import { SingleStoreCredentials } from 'src/cli/validations/singlestore';
import { certs } from 'src/utils/certs';

export const startStudioServer = async (
	imports: Record<string, unknown>,
	credentials: SingleStoreCredentials,
	options?: {
		host?: string;
		port?: number;
		casing?: CasingType;
	},
) => {
	const { drizzleForSingleStore, prepareServer } = await import('../cli/commands/studio');

	const singleStoreSchema: Record<string, Record<string, AnySingleStoreTable>> = {};
	const relations: Record<string, Relations> = {};

	Object.entries(imports).forEach(([k, t]) => {
		if (is(t, SingleStoreTable)) {
			const schema = getTableConfig(t).schema || 'public';
			singleStoreSchema[schema] = singleStoreSchema[schema] || {};
			singleStoreSchema[schema][k] = t;
		}

		if (is(t, Relations)) {
			relations[k] = t;
		}
	});

	const setup = await drizzleForSingleStore(credentials, singleStoreSchema, relations, [], options?.casing);
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
