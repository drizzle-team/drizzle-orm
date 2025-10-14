import Docker, { Container } from 'dockerode';
import { is } from 'drizzle-orm';
import { int, MySqlColumnBuilder, MySqlSchema, MySqlTable, mysqlTable, MySqlView } from 'drizzle-orm/mysql-core';

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import getPort from 'get-port';
import { Connection, createConnection } from 'mysql2/promise';
import {
	MySqlSchema as MySqlSchemaOld,
	MySqlTable as MysqlTableOld,
	MySqlView as MysqlViewOld,
} from 'orm044/mysql-core';
import { introspect } from 'src/cli/commands/pull-mysql';
import { suggestions } from 'src/cli/commands/push-mysql';
import { upToV6 } from 'src/cli/commands/up-mysql';
import { CasingType } from 'src/cli/validations/common';
import { EmptyProgressView } from 'src/cli/views';
import { hash } from 'src/dialects/common';
import { MysqlDDL, MysqlEntity } from 'src/dialects/mysql/ddl';
import { createDDL, interimToDDL } from 'src/dialects/mysql/ddl';
import { ddlDiff, ddlDiffDry } from 'src/dialects/mysql/diff';
import { defaultFromColumn } from 'src/dialects/mysql/drizzle';
import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/mysql/drizzle';
import { fromDatabaseForDrizzle } from 'src/dialects/mysql/introspect';
import { ddlToTypeScript } from 'src/dialects/mysql/typescript';
import { diff as legacyDiff } from 'src/legacy/mysql-v5/mysqlDiff';
import { serializeMysql } from 'src/legacy/mysql-v5/serializer';
import { DB } from 'src/utils';
import { mockResolver } from 'src/utils/mocks';
import { tsc } from 'tests/utils';
import { v4 as uuid } from 'uuid';
import 'zx/globals';

mkdirSync('tests/mysql/tmp', { recursive: true });

export type MysqlSchema = Record<
	string,
	MySqlTable<any> | MySqlSchema | MySqlView
>;

export type MysqlSchemaOld = Record<
	string,
	MysqlTableOld<any> | MySqlSchemaOld | MysqlViewOld
>;

export const fromEntities = (entities: MysqlEntity[]) => {
	const ddl = createDDL();
	for (const it of entities) {
		ddl.entities.push(it);
	}
	return ddl;
};

export const drizzleToDDL = (sch: MysqlSchema, casing?: CasingType | undefined) => {
	const tables = Object.values(sch).filter((it) => is(it, MySqlTable)) as MySqlTable[];
	const views = Object.values(sch).filter((it) => is(it, MySqlView)) as MySqlView[];
	return interimToDDL(fromDrizzleSchema(tables, views, casing));
};

export const diff = async (
	left: MysqlSchema | MysqlDDL,
	right: MysqlSchema | MysqlDDL,
	renamesArr: string[],
	casing?: CasingType | undefined,
) => {
	const { ddl: ddl1, errors: err1 } = 'entities' in left && '_' in left
		? { ddl: left as MysqlDDL, errors: [] }
		: drizzleToDDL(left, casing);
	const { ddl: ddl2, errors: err2 } = 'entities' in right && '_' in right
		? { ddl: right as MysqlDDL, errors: [] }
		: drizzleToDDL(right, casing);

	const renames = new Set(renamesArr);

	const { sqlStatements, statements } = await ddlDiff(
		ddl1,
		ddl2,
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		'default',
	);

	return { sqlStatements, statements, next: ddl2 };
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

	const filePath = `tests/mysql/tmp/${testName}.ts`;
	const file = ddlToTypeScript(ddl1, schema.viewColumns, 'camel', 'mysql');

	writeFileSync(filePath, file.file);
	await tsc(file.file);

	// generate snapshot from ts file
	const response = await prepareFromSchemaFiles([
		filePath,
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
	log?: 'statements';
	ignoreSubsequent?: boolean;
}) => {
	const { db, to, log } = config;
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
		if (log === 'statements') console.log(sql);
		await db.query(sql);
	}

	// subsequent push
	if (!config.ignoreSubsequent) {
		{
			const { schema } = await introspect({
				db,
				database: 'drizzle',
				tablesFilter: [],
				progress: new EmptyProgressView(),
			});
			const { ddl: ddl1, errors: err3 } = interimToDDL(schema);
			const { sqlStatements, statements } = await ddlDiff(
				ddl1,
				ddl2,
				mockResolver(renames),
				mockResolver(renames),
				mockResolver(renames),
				'push',
			);
			if (sqlStatements.length > 0) {
				console.error('---- subsequent push is not empty ----');
				console.log(sqlStatements.join('\n'));
				throw new Error();
			}
		}
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
		default?: string;
		ignoreSubsequent?: boolean;
	},
) => {
	await kit.clear();

	const config = (builder as any).config;
	const def = config['default'];
	const column = mysqlTable('table', { column: builder }).column;
	const type = override?.type ?? column.getSQLType().replace(', ', ','); // real(6, 3)->real(6,3)
	const ignoreSubsequent = override?.ignoreSubsequent ?? false;

	const columnDefault = defaultFromColumn(column, 'camelCase');
	const defaultSql = override?.default ?? columnDefault;

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
	const { sqlStatements: st1 } = await push({ db, to: init, ignoreSubsequent });
	const { sqlStatements: st2 } = await push({ db, to: init, ignoreSubsequent });

	const expectedInit = `CREATE TABLE \`table\` (\n\t\`column\` ${type} DEFAULT ${expectedDefault}\n);\n`;
	if (st1.length !== 1 || st1[0] !== expectedInit) res.push(`Unexpected init:\n${st1}\n\n${expectedInit}`);
	if (st2.length > 0) res.push(`Unexpected subsequent init:\n${st2}`);

	// introspect to schema
	const schema = await fromDatabaseForDrizzle(db, 'drizzle');
	const { ddl: ddl1, errors: e1 } = interimToDDL(schema);

	const file = ddlToTypeScript(ddl1, schema.viewColumns, 'camel', 'mysql');
	const path = `tests/mysql/tmp/temp-${hash(String(Math.random()))}.ts`;

	if (existsSync(path)) rmSync(path);
	writeFileSync(path, file.file);
	await tsc(file.file);

	const response = await prepareFromSchemaFiles([path]);
	const sch = fromDrizzleSchema(response.tables, response.views, 'camelCase');
	const { ddl: ddl2, errors: e3 } = interimToDDL(sch);

	const { sqlStatements: afterFileSqlStatements } = await ddlDiffDry(ddl1, ddl2, 'push');
	if (afterFileSqlStatements.length === 0) {
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

	if (pre) await push({ db, to: pre, ignoreSubsequent });
	await push({ db, to: schema1, ignoreSubsequent });
	const { sqlStatements: st3 } = await push({ db, to: schema2, ignoreSubsequent });
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

	if (pre) await push({ db, to: pre, ignoreSubsequent });
	await push({ db, to: schema3, ignoreSubsequent });
	const { sqlStatements: st4 } = await push({ db, to: schema4, ignoreSubsequent });

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

export const diffSnapshotV5 = async (db: DB, schema: MysqlSchema, oldSchema: MysqlSchemaOld) => {
	const res = await serializeMysql(oldSchema, 'camelCase');
	const { sqlStatements } = await legacyDiff({ right: res });

	for (const st of sqlStatements) {
		await db.query(st);
	}

	const snapshot = upToV6(res);
	const ddl = fromEntities(snapshot.ddl);

	const { sqlStatements: st, next } = await diff(ddl, schema, []);
	const { sqlStatements: pst } = await push({ db, to: schema });
	const { sqlStatements: st1 } = await diff(next, ddl, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema });

	return {
		step1: st,
		step2: pst,
		step3: st1,
		step4: pst1,
		all: [...st, ...pst, ...st1, ...pst1],
	};
};
