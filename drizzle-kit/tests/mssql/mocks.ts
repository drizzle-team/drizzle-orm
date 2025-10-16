import { is } from 'drizzle-orm';
import {
	int,
	MsSqlColumnBuilder,
	MsSqlDialect,
	MsSqlSchema,
	MsSqlTable,
	mssqlTable,
	MsSqlView,
} from 'drizzle-orm/mssql-core';
import { CasingType } from 'src/cli/validations/common';
import { interimToDDL, MssqlDDL, SchemaError } from 'src/dialects/mssql/ddl';
import { ddlDiff, ddlDiffDry } from 'src/dialects/mssql/diff';
import { defaultFromColumn, fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/mssql/drizzle';
import { mockResolver } from 'src/utils/mocks';
import '../../src/@types/utils';
import Docker from 'dockerode';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import getPort from 'get-port';
import mssql from 'mssql';
import { introspect } from 'src/cli/commands/pull-mssql';
import { Entities } from 'src/cli/validations/cli';
import { EmptyProgressView } from 'src/cli/views';
import { createDDL } from 'src/dialects/mssql/ddl';
import { defaultNameForDefault } from 'src/dialects/mssql/grammar';
import { fromDatabaseForDrizzle } from 'src/dialects/mssql/introspect';
import { ddlToTypeScript } from 'src/dialects/mssql/typescript';
import { hash } from 'src/dialects/mssql/utils';
import { DB } from 'src/utils';
import { v4 as uuid } from 'uuid';
import 'zx/globals';
import { suggestions } from 'src/cli/commands/push-mssql';
import { tsc } from 'tests/utils';

export type MssqlDBSchema = Record<
	string,
	| MsSqlTable<any>
	| MsSqlSchema
	| MsSqlView
>;

class MockError extends Error {
	constructor(readonly errors: SchemaError[]) {
		super();
	}
}

export const drizzleToDDL = (
	schema: MssqlDBSchema,
	casing?: CasingType | undefined,
) => {
	const tables = Object.values(schema).filter((it) => is(it, MsSqlTable)) as MsSqlTable[];
	const schemas = Object.values(schema).filter((it) => is(it, MsSqlSchema)) as MsSqlSchema[];
	const views = Object.values(schema).filter((it) => is(it, MsSqlView)) as MsSqlView[];

	const { schema: res, errors } = fromDrizzleSchema(
		{ schemas, tables, views },
		casing,
	);

	if (errors.length > 0) {
		throw new Error();
	}

	return interimToDDL(res);
};

// 2 schemas -> 2 ddls -> diff
export const diff = async (
	left: MssqlDBSchema | MssqlDDL,
	right: MssqlDBSchema,
	renamesArr: string[],
	casing?: CasingType | undefined,
) => {
	const { ddl: ddl1, errors: err1 } = 'entities' in left && '_' in left
		? { ddl: left as MssqlDDL, errors: [] }
		: drizzleToDDL(left, casing);
	const { ddl: ddl2, errors: err2 } = drizzleToDDL(right, casing);

	if (err1.length > 0 || err2.length > 0) {
		throw new MockError([...err1, ...err2]);
	}

	const renames = new Set(renamesArr);

	const { sqlStatements, statements, groupedStatements } = await ddlDiff(
		ddl1,
		ddl2,
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames), // uniques
		mockResolver(renames), // indexes
		mockResolver(renames), // checks
		mockResolver(renames), // pks
		mockResolver(renames), // fks
		mockResolver(renames), // defaults
		'default',
	);

	return { sqlStatements, statements, groupedStatements, next: ddl2 };
};

export const diffIntrospect = async (
	db: DB,
	initSchema: MssqlDBSchema,
	testName: string,
	schemas: string[] = ['dbo'],
	entities?: Entities,
	casing?: CasingType | undefined,
) => {
	const { ddl: initDDL } = drizzleToDDL(initSchema, casing);
	const { sqlStatements: init } = await ddlDiffDry(createDDL(), initDDL, 'default');

	for (const st of init) await db.query(st);

	// introspect to schema
	const schema = await fromDatabaseForDrizzle(db, undefined, (it) => schemas.indexOf(it) >= 0);

	const { ddl: ddl1, errors: e1 } = interimToDDL(schema);

	const file = ddlToTypeScript(ddl1, schema.viewColumns, 'camel');

	const filePath = `tests/mssql/tmp/${testName}.ts`;

	writeFileSync(filePath, file.file);
	await tsc(file.file);

	const typeCheckResult = await $`pnpm exec tsc --noEmit --skipLibCheck ${filePath}`.nothrow();
	if (typeCheckResult.exitCode !== 0) {
		throw new Error(typeCheckResult.stderr || typeCheckResult.stdout);
	}

	// generate snapshot from ts file
	const response = await prepareFromSchemaFiles([
		filePath,
	]);

	const { schema: schema2, errors: e2 } = fromDrizzleSchema(response, casing);
	const { ddl: ddl2, errors: e3 } = interimToDDL(schema2);

	const {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
	} = await ddlDiffDry(ddl1, ddl2, 'push');

	rmSync(`tests/mssql/tmp/${testName}.ts`);

	return {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
	};
};

// init schema flush to db -> introspect db to ddl -> compare ddl with destination schema
export const push = async (config: {
	db: DB;
	to: MssqlDBSchema | MssqlDDL;
	renames?: string[];
	schemas?: string[];
	casing?: CasingType;
	log?: 'statements' | 'none';
	force?: boolean;
	expectError?: boolean;
}) => {
	const { db, to, force, expectError, log } = config;
	const casing = config.casing ?? 'camelCase';
	const schemas = config.schemas ?? ((_: string) => true);

	const { schema } = await introspect(db, [], schemas, new EmptyProgressView());

	const { ddl: ddl1, errors: err3 } = interimToDDL(schema);
	const { ddl: ddl2, errors: err2 } = 'entities' in to && '_' in to
		? { ddl: to as MssqlDDL, errors: [] }
		: drizzleToDDL(to, casing);

	if (err2.length > 0) {
		throw new MockError(err2);
	}

	if (err3.length > 0) {
		throw new MockError(err3);
	}

	const renames = new Set(config.renames ?? []);

	const { sqlStatements, statements } = await ddlDiff(
		ddl1,
		ddl2,
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames), // views
		mockResolver(renames), // uniques
		mockResolver(renames), // indexes
		mockResolver(renames), // checks
		mockResolver(renames), // pks
		mockResolver(renames), // fks
		mockResolver(renames), // defaults
		'push',
	);

	const { hints, losses } = await suggestions(db, statements, ddl2);

	if (force) {
		for (const st of losses) {
			await db.query(st);
		}
	}

	let error: Error | null = null;
	for (const sql of sqlStatements) {
		if (log === 'statements') console.log(sql);
		try {
			await db.query(sql);
		} catch (e) {
			if (!expectError) throw e;
			error = e as Error;
			break;
		}
	}

	return { sqlStatements, statements, hints, losses, error };
};

export type TestDatabase = {
	db: DB;
	close: () => Promise<void>;
	clear: () => Promise<void>;
};

export const diffDefault = async <T extends MsSqlColumnBuilder>(
	kit: TestDatabase,
	builder: T,
	expectedDefault: string,
	pre: MssqlDBSchema | null = null,
) => {
	await kit.clear();

	const config = (builder as any).config;
	const def = config['default'];
	const tableName = 'table';
	const column = mssqlTable(tableName, { column: builder }).column;
	const sqlType = column.getSQLType();

	const columnDefault = defaultFromColumn(column, 'camelCase');

	const res = [] as string[];
	if (columnDefault !== expectedDefault) {
		res.push(`Unexpected sql: \n${columnDefault}\n${expectedDefault}`);
	}

	const init = {
		...pre,
		table: mssqlTable(tableName, { column: builder }),
	};

	const { db, clear } = kit;
	if (pre) await push({ db, to: pre });
	const { sqlStatements: st1 } = await push({ db, to: init });
	const { sqlStatements: st2 } = await push({ db, to: init });

	const expectedInit = `CREATE TABLE [${tableName}] (\n\t[${column.name}] ${sqlType} CONSTRAINT [${
		defaultNameForDefault(tableName, column.name)
	}] DEFAULT ${expectedDefault}\n);\n`;
	if (st1.length !== 1 || st1[0] !== expectedInit) res.push(`Unexpected init:\n${st1}\n\n${expectedInit}`);
	if (st2.length > 0) res.push(`Unexpected subsequent init:\n${st2}`);

	await db.query('INSERT INTO [table] ([column]) VALUES (default);');

	// introspect to schema
	const schema = await fromDatabaseForDrizzle(db);
	const { ddl: ddl1, errors: e1 } = interimToDDL(schema);

	const file = ddlToTypeScript(ddl1, schema.viewColumns, 'camel');
	mkdirSync(`tests/mssql/tmp`, { recursive: true });
	const path = `tests/mssql/tmp/temp-${hash(String(Math.random()))}.ts`;

	if (existsSync(path)) rmSync(path);
	writeFileSync(path, file.file);
	await tsc(file.file);

	const response = await prepareFromSchemaFiles([path]);
	const { schema: sch, errors: e2 } = fromDrizzleSchema(response, 'camelCase');
	const { ddl: ddl2, errors: e3 } = interimToDDL(sch);

	const { sqlStatements: afterFileSqlStatements } = await ddlDiffDry(ddl1, ddl2, 'push');
	if (afterFileSqlStatements.length === 0) {
		rmSync(path);
	} else {
		console.log(afterFileSqlStatements);
		console.log(`./${path}`);
		res.push(`Default type mismatch after diff:\n${`./${path}`}`);
	}

	await clear();

	config.hasDefault = false;
	config.default = undefined;
	const schema1 = {
		...pre,
		table: mssqlTable('table', { column: builder }),
	};

	config.hasDefault = true;
	config.default = def;
	const schema2 = {
		...pre,
		table: mssqlTable('table', { column: builder }),
	};

	if (pre) await push({ db, to: pre });
	await push({ db, to: schema1 });
	const { sqlStatements: st3 } = await push({ db, to: schema2 });

	const expectedAlter = `ALTER TABLE [${tableName}] ADD CONSTRAINT [${
		defaultNameForDefault(tableName, column.name)
	}] DEFAULT ${expectedDefault} FOR [${column.name}];`;
	if (st3.length !== 1 || st3[0] !== expectedAlter) res.push(`Unexpected default alter:\n${st3}\n\n${expectedAlter}`);

	await clear();

	const schema3 = {
		...pre,
		table: mssqlTable('table', { id: int().identity() }),
	};

	const schema4 = {
		...pre,
		table: mssqlTable('table', { id: int().identity(), column: builder }),
	};

	if (pre) await push({ db, to: pre });
	await push({ db, to: schema3 });
	const { sqlStatements: st4 } = await push({ db, to: schema4 });

	const expectedAddColumn = `ALTER TABLE [${tableName}] ADD [${column.name}] ${sqlType} CONSTRAINT [${
		defaultNameForDefault(tableName, column.name)
	}] DEFAULT ${expectedDefault};`;
	if (st4.length !== 1 || st4[0] !== expectedAddColumn) {
		res.push(`Unexpected add column:\n${st4[0]}\n\n${expectedAddColumn}`);
	}

	return res;
};

export function parseMssqlUrl(urlString: string) {
	const url = new URL(urlString);
	return {
		user: url.username,
		password: url.password,
		server: url.hostname,
		port: parseInt(url.port, 10),
		database: url.pathname.replace(/^\//, ''),
		options: {
			encrypt: url.searchParams.get('encrypt') === 'true',
			trustServerCertificate: url.searchParams.get('trustServerCertificate') === 'true',
		},
	};
}

export const prepareTestDatabase = async (): Promise<TestDatabase> => {
	const envUrl = process.env.MSSQL_CONNECTION_STRING;
	const { url, container } = envUrl ? { url: envUrl, container: null } : await createDockerDB();
	const params = parseMssqlUrl(url);

	const sleep = 1000;
	let timeLeft = 20000;
	do {
		try {
			const client = await mssql.connect({
				...params,
				pool: { max: 1 },
				requestTimeout: 30_000,
			});

			await client.query(`use [master];`);
			await client.query(`drop database if exists [drizzle];`);
			await client.query(`create database [drizzle];`);
			await client.query(`use [drizzle];`);

			let tx = client.transaction();
			let req = new mssql.Request(tx);
			await tx.begin();

			const db = {
				query: async (sql: string, params: any[] = []) => {
					const error = new Error();
					try {
						const res = await req.query(sql);
						return res.recordset as any[];
					} catch (err) {
						error.cause = err;
						throw error;
					}
				},
			};
			const close = async () => {
				await tx.rollback().catch((e) => {});
				await client?.close().catch(console.error);
				await container?.stop().catch(console.error);
			};

			const clear = async () => {
				try {
					await tx.rollback();
					await tx.begin();
				} catch {
					tx = client.transaction();
					await tx.begin();
					req = new mssql.Request(tx);
				}
			};
			return { db, close, clear };
		} catch (e) {
			console.error(e);
			throw e;
			// await new Promise((resolve) => setTimeout(resolve, sleep));
			// timeLeft -= sleep;
		}
	} while (timeLeft > 0);

	throw new Error();
};

export async function createDockerDB(): Promise<
	{ container: Docker.Container; url: string }
> {
	let mssqlContainer: Docker.Container;

	const docker = new Docker();
	const port = await getPort({ port: 1433 });
	const image = 'mcr.microsoft.com/azure-sql-edge';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
	);

	mssqlContainer = await docker.createContainer({
		Image: image,
		Env: ['ACCEPT_EULA=1', 'MSSQL_SA_PASSWORD=drizzle123PASSWORD!'],
		name: `drizzle-integration-tests-${uuid()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'1433/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await mssqlContainer.start();
	return {
		url: 'mssql://SA:drizzle123PASSWORD!@127.0.0.1:1433?encrypt=true&trustServerCertificate=true',
		container: mssqlContainer,
	};
}
