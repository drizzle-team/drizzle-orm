import type { Relations } from 'drizzle-orm/_relations';
import type { AnySingleStoreTable } from 'drizzle-orm/singlestore-core';
import type { CasingType } from 'src/cli/validations/common';
import type { SingleStoreCredentials } from 'src/cli/validations/singlestore';

export const startStudioServer = async (
	imports: Record<string, unknown>,
	credentials: SingleStoreCredentials,
	options?: {
		host?: string;
		port?: number;
		casing?: CasingType;
		key?: string;
		cert?: string;
	},
) => {
	const { is } = await import('drizzle-orm');
	const { SingleStoreTable, getTableConfig } = await import('drizzle-orm/singlestore-core');
	const { Relations } = await import('drizzle-orm/_relations');
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
