import Docker from 'dockerode';
import { drizzle, GelJsDatabase } from 'drizzle-orm/gel';
import createClient from 'gel';
import getPort from 'get-port';
import { EntitiesFilter, EntitiesFilterConfig } from 'src/cli/validations/cli';
import { CasingType } from 'src/cli/validations/common';
import { interimToDDL } from 'src/dialects/postgres/ddl';
import { isSystemNamespace, isSystemRole } from 'src/dialects/postgres/grammar';
import { fromDatabase } from 'src/dialects/postgres/introspect';
import { ddlToTypeScript } from 'src/dialects/postgres/typescript';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import { DB } from 'src/utils';
import { tsc } from 'tests/utils';
import { v4 as uuid } from 'uuid';

export type TestDatabase = {
	url: string;
	db: DB;
	drizzle: GelJsDatabase;
	close: () => Promise<void>;
	clear: () => Promise<void>;
};

export const prepareTestDatabase = async (
	logging: boolean,
	tlsSecurity: 'insecure' | 'no_host_verification' | 'strict' | 'default',
): Promise<TestDatabase> => {
	const envUrl = process.env.GEL_CONNECTION_STRING;
	const { url, container } = envUrl ? { url: envUrl, container: null } : await createDockerDB();

	const sleep = 1000;
	let timeLeft = 20000;
	do {
		try {
			await new Promise((resolve) => setTimeout(resolve, 15 * 1000));
			const client = createClient({ dsn: url, tlsSecurity });

			const drizzleDB = drizzle({ client, logger: logging });

			const db = {
				query: async <T extends unknown>(sql: string, params?: any[]) => {
					const [res] = await client.query(sql);
					return res as T[];
				},
			};
			const close = async () => {
				await client?.close().catch(console.error);
				await container?.stop().catch(console.error);
			};
			const clear = async () => {
				const namespaces = await db.query<{ name: string }>('select oid, nspname as name from pg_namespace').then((
					res,
				) => res.filter((r) => !isSystemNamespace(r.name)));

				const roles = await client.query<{ rolname: string }>(
					`SELECT rolname, rolinherit, rolcreatedb, rolcreaterole FROM pg_roles;`,
				).then((it) => it.filter((it) => !isSystemRole(it.rolname)));

				for (const namespace of namespaces) {
					await client.query(`DROP SCHEMA "${namespace.name}" cascade`);
				}

				await client.query('CREATE SCHEMA public;');

				for (const role of roles) {
					await client.query(`DROP ROLE "${role.rolname}"`);
				}
			};
			return { url, db, drizzle: drizzleDB, close, clear };
		} catch (e) {
			await new Promise((resolve) => setTimeout(resolve, sleep));
			timeLeft -= sleep;
		}
	} while (timeLeft > 0);

	throw new Error();
};

export const pull = async (
	db: DB,
	testName: string,
	schemas: string[] = [],
	entities?: EntitiesFilter,
	casing?: CasingType | undefined,
) => {
	const filterConfig: EntitiesFilterConfig = {
		entities,
		schemas,
		tables: [],
		extensions: [],
	};
	// introspect to schema
	const filter = prepareEntityFilter('gel', filterConfig, []);
	const interim = await fromDatabase(db, filter);
	const { ddl } = interimToDDL(interim);
	// write to ts file
	const file = ddlToTypeScript(ddl, interim.viewColumns, 'camel', 'gel');

	const path = `tests/gel/tmp/${testName}.ts`;
	fs.writeFileSync(path, file.file);
	await tsc(file.file);

	const typeCheckResult = await $`pnpm exec tsc --noEmit --skipLibCheck ${path}`.nothrow();
	if (typeCheckResult.exitCode !== 0) {
		throw new Error(typeCheckResult.stderr || typeCheckResult.stdout);
	}

	return path;
};

async function createDockerDB(): Promise<{ url: string; container: Docker.Container }> {
	const docker = new Docker();
	const port = await getPort({ port: 5656 });
	const image = 'geldata/gel:6.0';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
	);

	const gelContainer = await docker.createContainer({
		Image: image,
		Env: [
			'GEL_CLIENT_SECURITY=insecure_dev_mode',
			'GEL_SERVER_SECURITY=insecure_dev_mode',
			'GEL_CLIENT_TLS_SECURITY=no_host_verification',
			'GEL_SERVER_PASSWORD=password',
		],
		name: `drizzle-${uuid()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'5656/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await gelContainer.start();
	return { url: `gel://admin:password@localhost:${port}/main`, container: gelContainer };
}
