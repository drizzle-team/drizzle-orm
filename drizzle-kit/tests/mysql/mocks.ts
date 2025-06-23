import Docker, { Container } from 'dockerode';
import { is } from 'drizzle-orm';
import {
	int,
	MySqlColumnBuilder,
	MySqlDialect,
	MySqlSchema,
	MySqlTable,
	mysqlTable,
	MySqlView,
} from 'drizzle-orm/mysql-core';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import getPort from 'get-port';
import { Connection, createConnection } from 'mysql2/promise';
import { introspect } from 'src/cli/commands/pull-mysql';
import { suggestions } from 'src/cli/commands/push-mysql';
import { CasingType } from 'src/cli/validations/common';
import { EmptyProgressView } from 'src/cli/views';
import { hash } from 'src/dialects/common';
import { MysqlDDL } from 'src/dialects/mysql/ddl';
import { createDDL, interimToDDL } from 'src/dialects/mysql/ddl';
import { ddlDiff, ddlDiffDry } from 'src/dialects/mysql/diff';
import { defaultFromColumn } from 'src/dialects/mysql/drizzle';
import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/mysql/drizzle';
import { defaultToSQL } from 'src/dialects/mysql/grammar';
import { fromDatabaseForDrizzle } from 'src/dialects/mysql/introspect';
import { ddlToTypeScript } from 'src/dialects/mysql/typescript';
import { DB } from 'src/utils';
import { mockResolver } from 'src/utils/mocks';
import { v4 as uuid } from 'uuid';

mkdirSync('tests/mysql/tmp', { recursive: true });

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

export const diffIntrospect = async (
	db: DB,
	initSchema: MysqlSchema,
	testName: string,
	casing?: CasingType | undefined,
) => {
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

export const push = async (config: {
	db: DB;
	to: MysqlSchema | MysqlDDL;
	renames?: string[];
	casing?: CasingType;
}) => {
	const { db, to } = config;
	const casing = config.casing ?? 'camelCase';

	const { schema } = await introspect({ db, database: 'drizzle', tablesFilter: [], progress: new EmptyProgressView() });
	const { ddl: ddl1, errors: err3 } = interimToDDL(schema);
	const { ddl: ddl2, errors: err2 } = 'entities' in to && '_' in to
		? { ddl: to as MysqlDDL, errors: [] }
		: drizzleToDDL(to, casing);
	if (err2.length > 0) {
		for (const e of err2) {
			console.error(`err2: ${JSON.stringify(e)}`);
		}
		throw new Error();
	}

	if (err3.length > 0) {
		for (const e of err3) {
			console.error(`err3: ${JSON.stringify(e)}`);
		}
		throw new Error();
	}

	// TODO: handle errors
	const renames = new Set(config.renames ?? []);
	const { sqlStatements, statements } = await ddlDiff(
		ddl1,
		ddl2,
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		'push',
	);

	const { hints, truncates } = await suggestions(db, statements);

	for (const sql of sqlStatements) {
		// if (log === 'statements') console.log(sql);
		await db.query(sql);
	}

	return { sqlStatements, statements, hints, truncates };
};

export const diffDefault = async <T extends MySqlColumnBuilder>(
	kit: TestDatabase,
	builder: T,
	expectedDefault: string,
	pre: MysqlSchema | null = null,
	override?: {
		type?: string;
	},
) => {
	await kit.clear();

	const config = (builder as any).config;
	const def = config['default'];
	const column = mysqlTable('table', { column: builder }).column;
	const type = override?.type ?? column.getSQLType().replace(', ', ','); // real(6, 3)->real(6,3)

	const columnDefault = defaultFromColumn(column, 'camelCase');
	const defaultSql = defaultToSQL(columnDefault);

	const res = [] as string[];
	if (defaultSql !== expectedDefault) {
		res.push(`Unexpected sql: \n${defaultSql}\n${expectedDefault}`);
	}

	const init = {
		...pre,
		table: mysqlTable('table', { column: builder }),
	};

	const { db, clear } = kit;
	if (pre) await push({ db, to: pre });
	const { sqlStatements: st1 } = await push({ db, to: init });
	const { sqlStatements: st2 } = await push({ db, to: init });

	const expectedInit = `CREATE TABLE \`table\` (\n\t\`column\` ${type} DEFAULT ${expectedDefault}\n);\n`;
	if (st1.length !== 1 || st1[0] !== expectedInit) res.push(`Unexpected init:\n${st1}\n\n${expectedInit}`);
	if (st2.length > 0) res.push(`Unexpected subsequent init:\n${st2}`);

	// introspect to schema
	const schema = await fromDatabaseForDrizzle(db, 'drizzle');
	const { ddl: ddl1, errors: e1 } = interimToDDL(schema);

	const file = ddlToTypeScript(ddl1, schema.viewColumns, 'camel');
	const path = `tests/mysql/tmp/temp-${hash(String(Math.random()))}.ts`;

	if (existsSync(path)) rmSync(path);
	writeFileSync(path, file.file);

	const response = await prepareFromSchemaFiles([path]);
	const sch = fromDrizzleSchema(response.tables, response.views, 'camelCase');
	const { ddl: ddl2, errors: e3 } = interimToDDL(sch);

	const { sqlStatements: afterFileSqlStatements } = await ddlDiffDry(ddl1, ddl2, 'push');
	if (afterFileSqlStatements.length === 0) {
		// TODO: tsc on temp files, it consumes them with TS errors now
		rmSync(path);
	} else {
		console.log(afterFileSqlStatements);
		console.log(`./${path}`);
	}

	await clear();

	config.hasDefault = false;
	config.default = undefined;
	const schema1 = {
		...pre,
		table: mysqlTable('table', { column: builder }),
	};

	config.hasDefault = true;
	config.default = def;
	const schema2 = {
		...pre,
		table: mysqlTable('table', { column: builder }),
	};

	if (pre) await push({ db, to: pre });
	await push({ db, to: schema1 });
	const { sqlStatements: st3 } = await push({ db, to: schema2 });
	const expectedAlter = `ALTER TABLE \`table\` MODIFY COLUMN \`column\` ${type} DEFAULT ${expectedDefault};`;
	if (st3.length !== 1 || st3[0] !== expectedAlter) res.push(`Unexpected default alter:\n${st3}\n\n${expectedAlter}`);

	await clear();

	const schema3 = {
		...pre,
		table: mysqlTable('table', { id: int() }),
	};

	const schema4 = {
		...pre,
		table: mysqlTable('table', { id: int(), column: builder }),
	};

	if (pre) await push({ db, to: pre });
	await push({ db, to: schema3 });
	const { sqlStatements: st4 } = await push({ db, to: schema4 });

	const expectedAddColumn = `ALTER TABLE \`table\` ADD \`column\` ${type} DEFAULT ${expectedDefault};`;
	if (st4.length !== 1 || st4[0] !== expectedAddColumn) {
		res.push(`Unexpected add column:\n${st4[0]}\n\n${expectedAddColumn}`);
	}

	return res;
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
					const [res] = await client.query(sql).catch((e: Error) => {
						const error = new Error(`query error: ${sql}\n\n${e.message}`);
						throw error;
					});
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
			console.error(e);
			await new Promise((resolve) => setTimeout(resolve, sleep));
			timeLeft -= sleep;
		}
	} while (timeLeft > 0);

	throw new Error();
};
