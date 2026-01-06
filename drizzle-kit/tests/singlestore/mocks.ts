import Docker, { Container } from 'dockerode';
import { is } from 'drizzle-orm';
import { SingleStoreSchema, SingleStoreTable } from 'drizzle-orm/singlestore-core';
import { mkdirSync, writeFileSync } from 'fs';
import getPort from 'get-port';
import { Connection, createConnection } from 'mysql2/promise';
import { suggestions } from 'src/cli/commands/push-mysql';
import { CasingType, configMigrations } from 'src/cli/validations/common';
import { explain } from 'src/cli/views';
import { createDDL, interimToDDL } from 'src/dialects/mysql/ddl';
import { ddlDiff, ddlDiffDry } from 'src/dialects/mysql/diff';
import { fromDatabaseForDrizzle } from 'src/dialects/mysql/introspect';
import { ddlToTypeScript } from 'src/dialects/mysql/typescript';
import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/singlestore/drizzle';
import { DB } from 'src/utils';
import { mockResolver } from 'src/utils/mocks';
import { v4 as uuid } from 'uuid';

export type SinglestoreSchema = Record<string, SingleStoreTable<any> | SingleStoreSchema>;

export const drizzleToDDL = (sch: SinglestoreSchema, casing?: CasingType | undefined) => {
	const tables = Object.values(sch).filter((it) => is(it, SingleStoreTable)) as SingleStoreTable[];
	return interimToDDL(fromDrizzleSchema(tables, casing));
};

export const diff = async (
	left: SinglestoreSchema,
	right: SinglestoreSchema,
	renamesArr: string[],
	casing?: CasingType | undefined,
) => {
	const { ddl: ddl1 } = drizzleToDDL(left, casing);
	const { ddl: ddl2 } = drizzleToDDL(right, casing);

	const renames = new Set(renamesArr);

	const { sqlStatements, statements } = await ddlDiff(
		ddl1,
		ddl2,
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		'default',
	);
	return { sqlStatements, statements };
};

export const pullDiff = async (
	db: DB,
	initSchema: SinglestoreSchema,
	testName: string,
	casing?: CasingType | undefined,
) => {
	mkdirSync('tests/mysql/tmp', { recursive: true });
	const { ddl: initDDL } = drizzleToDDL(initSchema, casing);
	const { sqlStatements: init } = await ddlDiffDry(createDDL(), initDDL);
	for (const st of init) await db.query(st);

	// introspect to schema
	const schema = await fromDatabaseForDrizzle(db, 'drizzle', () => true, () => {}, {
		table: 'drizzle_migrations',
		schema: 'drizzle',
	});
	const { ddl: ddl1, errors: e1 } = interimToDDL(schema);

	const filePath = `tests/singlestore/tmp/${testName}.ts`;
	const file = ddlToTypeScript(ddl1, schema.viewColumns, 'camel', 'singlestore');
	writeFileSync(filePath, file.file);

	const typeCheckResult = await $`pnpm exec tsc --noEmit --skipLibCheck ${filePath}`.nothrow();
	if (typeCheckResult.exitCode !== 0) {
		throw new Error(typeCheckResult.stderr || typeCheckResult.stdout);
	}

	// generate snapshot from ts file
	const response = await prepareFromSchemaFiles([filePath]);

	const interim = fromDrizzleSchema(response.tables, casing);
	const { ddl: ddl2, errors: e3 } = interimToDDL(interim);

	// TODO: handle errors
	const renames = new Set<string>();

	const {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
	} = await ddlDiff(
		ddl1,
		ddl2,
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		'push',
	);

	// rmSync(`tests/mysql/tmp/${testName}.ts`);

	return {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
	};
};

export const diffPush = async (config: {
	db: DB;
	init: SinglestoreSchema;
	destination: SinglestoreSchema;
	renames?: string[];
	casing?: CasingType;
	before?: string[];
	after?: string[];
	apply?: boolean;
	migrationsConfig?: {
		table?: string;
	};
}) => {
	const { db, init: initSchema, destination, casing, before, after, renames: rens } = config;
	const apply = config.apply ?? true;
	const { ddl: initDDL } = drizzleToDDL(initSchema, casing);
	const { sqlStatements: inits } = await ddlDiffDry(createDDL(), initDDL, 'default');

	const migrations = configMigrations.parse(config.migrationsConfig);

	const init = [] as string[];
	if (before) init.push(...before);
	if (apply) init.push(...inits);
	if (after) init.push(...after);

	for (const st of init) {
		await db.query(st);
	}

	// do introspect into PgSchemaInternal
	const introspectedSchema = await fromDatabaseForDrizzle(
		db,
		'drizzle',
		undefined,
		() => {},
		migrations,
	);

	const { ddl: ddl1, errors: err3 } = interimToDDL(introspectedSchema);
	const { ddl: ddl2, errors: err2 } = drizzleToDDL(destination, casing);

	// TODO: handle errors

	const renames = new Set(rens);
	const { sqlStatements, statements, groupedStatements } = await ddlDiff(
		ddl1,
		ddl2,
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		'push',
	);

	const explainMessage = explain('singlestore', groupedStatements, false, []);
	if (explainMessage) console.log(explainMessage);

	return { sqlStatements, statements, hints: [] };
};

async function createDockerDB(): Promise<{ url: string; container: Container }> {
	const docker = new Docker();
	const port = await getPort({ port: 3306 });
	const image = 'ghcr.io/singlestore-labs/singlestoredb-dev:latest';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		docker.modem.followProgress(pullStream, (err) => err ? reject(err) : resolve(err))
	);

	const mysqlContainer = await docker.createContainer({
		Image: image,
		Env: ['MYSQL_ROOT_PASSWORD=mysql', 'MYSQL_DATABASE=drizzle'],
		name: `drizzle-${uuid()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'3306/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await mysqlContainer.start();
	return { url: `singlestore://root:singlestore@localhost:${port}/`, container: mysqlContainer };
}

export type TestDatabase = {
	db: DB;
	close: () => Promise<void>;
	clear: () => Promise<void>;
	client: Connection;
};

export const prepareTestDatabase = async (): Promise<TestDatabase> => {
	const envUrl = process.env.MYSQL_CONNECTION_STRING;
	const { url, container } = envUrl ? { url: envUrl, container: null } : await createDockerDB();

	const sleep = 1000;
	let timeLeft = 20000;
	let connected = false;
	let lastError: unknown | undefined;
	do {
		try {
			const client: Connection = await createConnection(url);
			await client.connect();
			const db = {
				query: async (sql: string, params: any[]) => {
					const [res] = await client.query(sql);
					return res as any[];
				},
			};
			connected = true;
			const close = async () => {
				await client?.end().catch(console.error);
				await container?.stop().catch(console.error);
			};
			const clear = async () => {
				await client.query(`drop database if exists \`drizzle\`;`);
				await client.query(`create database \`drizzle\`;`);
				await client.query(`use \`drizzle\`;`);
			};
			return { db, close, clear, client };
		} catch (e) {
			lastError = e;
			await new Promise((resolve) => setTimeout(resolve, sleep));
			timeLeft -= sleep;
		}
	} while (timeLeft > 0);

	throw new Error();
};
