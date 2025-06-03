import Docker, { Container } from 'dockerode';
import { is } from 'drizzle-orm';
import { MySqlSchema, MySqlTable, MySqlView } from 'drizzle-orm/mysql-core';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import getPort from 'get-port';
import { Connection, createConnection } from 'mysql2/promise';
import { suggestions } from 'src/cli/commands/push-mysql';
import { CasingType } from 'src/cli/validations/common';
import { createDDL, interimToDDL } from 'src/dialects/mysql/ddl';
import { ddlDiffDry, ddlDiff } from 'src/dialects/mysql/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/mysql/drizzle';
import { fromDatabaseForDrizzle } from 'src/dialects/mysql/introspect';
import { ddlToTypeScript } from 'src/dialects/mysql/typescript';
import { DB } from 'src/utils';
import { mockResolver } from 'src/utils/mocks';
import { v4 as uuid } from 'uuid';

export type MysqlSchema = Record<
	string,
	MySqlTable<any> | MySqlSchema | MySqlView
>;

export const drizzleToDDL = (sch: MysqlSchema, casing?: CasingType | undefined) => {
	const tables = Object.values(sch).filter((it) => is(it, MySqlTable)) as MySqlTable[];
	const views = Object.values(sch).filter((it) => is(it, MySqlView)) as MySqlView[];
	return interimToDDL(fromDrizzleSchema(tables, views, casing));
};

export const diff = async (
	left: MysqlSchema,
	right: MysqlSchema,
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

export const introspect = async (
	db: DB,
	initSchema: MysqlSchema,
	testName: string,
	casing?: CasingType | undefined,
) => {
	mkdirSync('tests/mysql/tmp', { recursive: true });
	const { ddl: initDDL } = drizzleToDDL(initSchema, casing);
	const { sqlStatements: init } = await ddlDiffDry(createDDL(), initDDL);
	for (const st of init) await db.query(st);

	// introspect to schema
	const schema = await fromDatabaseForDrizzle(db, 'drizzle');
	const { ddl: ddl1, errors: e1 } = interimToDDL(schema);

	const file = ddlToTypeScript(ddl1, schema.viewColumns, 'camel');
	writeFileSync(`tests/mysql/tmp/${testName}.ts`, file.file);

	// generate snapshot from ts file
	const response = await prepareFromSchemaFiles([
		`tests/mysql/tmp/${testName}.ts`,
	]);

	const interim = fromDrizzleSchema(
		response.tables,
		response.views,
		casing,
	);
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

	rmSync(`tests/mysql/tmp/${testName}.ts`);

	return {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
	};
};

export const diffPush = async (config: {
	db: DB;
	init: MysqlSchema;
	destination: MysqlSchema;
	renames?: string[];
	casing?: CasingType;
	before?: string[];
	after?: string[];
	apply?: boolean;
}) => {
	const { db, init: initSchema, destination, casing, before, after, renames: rens } = config;
	const apply = config.apply ?? true;
	const { ddl: initDDL } = drizzleToDDL(initSchema, casing);
	const { sqlStatements: inits } = await ddlDiffDry(createDDL(), initDDL, 'default');

	const init = [] as string[];
	if (before) init.push(...before);
	if (apply) init.push(...inits);
	if (after) init.push(...after);

	for (const st of init) {
		await db.query(st);
	}

	// do introspect into PgSchemaInternal
	const introspectedSchema = await fromDatabaseForDrizzle(db, 'drizzle');

	const { ddl: ddl1, errors: err3 } = interimToDDL(introspectedSchema);
	const { ddl: ddl2, errors: err2 } = drizzleToDDL(destination, casing);

	// TODO: handle errors

	const renames = new Set(rens);
	const { sqlStatements, statements } = await ddlDiff(
		ddl1,
		ddl2,
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		'push',
	);

	const { hints, truncates } = await suggestions(db, statements);
	return { sqlStatements, statements, hints, truncates };
};

export const createDockerDB = async (): Promise<{ url: string; container: Container }> => {
	const docker = new Docker();
	const port = await getPort({ port: 3306 });
	const image = 'mysql:8';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		docker.modem.followProgress(pullStream, (err) => err ? reject(err) : resolve(err))
	);

	const mysqlContainer = await docker.createContainer({
		Image: image,
		Env: ['MYSQL_ROOT_PASSWORD=mysql', 'MYSQL_DATABASE=drizzle'],
		name: `drizzle-integration-tests-${uuid()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'3306/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await mysqlContainer.start();

	return { url: `mysql://root:mysql@127.0.0.1:${port}/drizzle`, container: mysqlContainer };
};

export type TestDatabase = {
	db: DB;
	close: () => Promise<void>;
	clear: () => Promise<void>;
};

export const prepareTestDatabase = async (): Promise<TestDatabase> => {
	const envUrl = process.env.MYSQL_CONNECTION_STRING;
	const { url, container } = envUrl ? { url: envUrl, container: null } : await createDockerDB();

	const sleep = 1000;
	let timeLeft = 20000;
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
			const close = async () => {
				await client?.end().catch(console.error);
				await container?.stop().catch(console.error);
			};
			const clear = async () => {
				await client.query(`drop database if exists \`drizzle\`;`);
				await client.query(`create database \`drizzle\`;`);
				await client.query(`use \`drizzle\`;`);
			};
			return { db, close, clear };
		} catch (e) {
			await new Promise((resolve) => setTimeout(resolve, sleep));
			timeLeft -= sleep;
		}
	} while (timeLeft > 0);

	throw new Error();
};
