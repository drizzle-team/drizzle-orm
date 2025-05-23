import { is } from 'drizzle-orm';
import { MsSqlSchema, MsSqlTable, MsSqlView } from 'drizzle-orm/mssql-core';
import { CasingType } from 'src/cli/validations/common';
import { interimToDDL, MssqlDDL, SchemaError } from 'src/dialects/mssql/ddl';
import { ddlDiff, ddlDiffDry } from 'src/dialects/mssql/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/mssql/drizzle';
import { mockResolver } from 'src/utils/mocks';
import '../../src/@types/utils';
import Docker from 'dockerode';
import { rmSync, writeFileSync } from 'fs';
import getPort from 'get-port';
import mssql from 'mssql';
import { introspect } from 'src/cli/commands/pull-mssql';
import { Entities } from 'src/cli/validations/cli';
import { createDDL } from 'src/dialects/mssql/ddl';
import { fromDatabaseForDrizzle } from 'src/dialects/mssql/introspect';
import { ddlToTypeScript } from 'src/dialects/mssql/typescript';
import { DB } from 'src/utils';
import { v4 as uuid } from 'uuid';

export type MssqlSchema = Record<
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
	schema: MssqlSchema,
	casing?: CasingType | undefined,
) => {
	const tables = Object.values(schema).filter((it) => is(it, MsSqlTable)) as MsSqlTable[];
	const schemas = Object.values(schema).filter((it) => is(it, MsSqlSchema)) as MsSqlSchema[];
	const views = Object.values(schema).filter((it) => is(it, MsSqlView)) as MsSqlView[];

	const res = fromDrizzleSchema(
		{ schemas, tables, views },
		casing,
	);

	// if (errors.length > 0) {
	// 	throw new Error();
	// }

	return interimToDDL(res);
};

// 2 schemas -> 2 ddls -> diff
export const diff = async (
	left: MssqlSchema,
	right: MssqlSchema,
	renamesArr: string[],
	casing?: CasingType | undefined,
) => {
	const { ddl: ddl1, errors: err1 } = drizzleToDDL(left, casing);
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
	return { sqlStatements, statements, groupedStatements };
};

export const diffIntrospect = async (
	db: DB,
	initSchema: MssqlSchema,
	testName: string,
	schemas: string[] = ['dbo'],
	entities?: Entities,
	casing?: CasingType | undefined,
) => {
	const { ddl: initDDL } = drizzleToDDL(initSchema, casing);
	const { sqlStatements: init } = await ddlDiffDry(createDDL(), initDDL, 'default');

	for (const st of init) await db.query(st);

	// introspect to schema
	const schema = await fromDatabaseForDrizzle(db, (_) => true, (it) => schemas.indexOf(it) >= 0, entities);

	console.log('schema: ', schema);

	const { ddl: ddl1, errors: e1 } = interimToDDL(schema);

	const file = ddlToTypeScript(ddl1, schema.viewColumns, 'camel');

	writeFileSync(`tests/mssql/tmp/${testName}.ts`, file.file);

	// generate snapshot from ts file
	const response = await prepareFromSchemaFiles([
		`tests/mssql/tmp/${testName}.ts`,
	]);

	const schema2 = fromDrizzleSchema(response, casing);
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
	to: MssqlSchema | MssqlDDL;
	renames?: string[];
	schemas?: string[];
	casing?: CasingType;
	log?: 'statements' | 'none';
	entities?: Entities;
}) => {
	const { db, to } = config;
	const log = config.log ?? 'none';
	const casing = config.casing ?? 'camelCase';
	const schemas = config.schemas ?? ((_: string) => true);

	const { schema } = await introspect(db, [], schemas, config.entities);

	const { ddl: ddl1, errors: err3 } = interimToDDL(schema);
	const { ddl: ddl2, errors: err2 } = 'entities' in to && '_' in to
		? { ddl: to as MssqlDDL, errors: [] }
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

	if (log === 'statements') {
		// console.dir(ddl1.roles.list());
		// console.dir(ddl2.roles.list());
	}

	// TODO: handle errors

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

	// const { hints, losses } = await suggestions(db, statements);

	for (const sql of sqlStatements) {
		if (log === 'statements') console.log(sql);
		await db.query(sql);
	}

	return { sqlStatements, statements, hints: undefined, losses: undefined };
};

export const diffPush = async (config: {
	db: DB;
	from: MssqlSchema;
	to: MssqlSchema;
	renames?: string[];
	schemas?: string[];
	casing?: CasingType;
	entities?: Entities;
	before?: string[];
	after?: string[];
	apply?: boolean;
}) => {
	const { db, from: initSchema, to: destination, casing, before, after, renames: rens, entities } = config;

	const schemas = config.schemas ?? ['dbo'];
	const apply = typeof config.apply === 'undefined' ? true : config.apply;
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
	const introspectedSchema = await fromDatabaseForDrizzle(db, undefined, (it) => schemas.indexOf(it) >= 0, entities);

	const { ddl: ddl1, errors: err3 } = interimToDDL(introspectedSchema);
	const { ddl: ddl2, errors: err2 } = drizzleToDDL(destination, casing);

	const renames = new Set(rens);
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

	// TODO suggestions
	// const { hints, losses } = await suggestions(
	// 	db,
	// 	statements,
	// );
	return { sqlStatements, statements, hints: undefined, losses: undefined };
};

export type TestDatabase = {
	db: DB;
	close: () => Promise<void>;
	clear: () => Promise<void>;
};

let mssqlContainer: Docker.Container;
export async function createDockerDB(): Promise<
	{ container: Docker.Container; options: mssql.config }
> {
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

	const options: mssql.config = {
		server: 'localhost',
		user: 'SA',
		password: 'drizzle123PASSWORD!',
		pool: {
			max: 1,
		},
		options: {
			requestTimeout: 100_000,
			encrypt: true, // for azure
			trustServerCertificate: true,
		},
	};
	return {
		options,
		container: mssqlContainer,
	};
}

export const prepareTestDatabase = async (): Promise<TestDatabase> => {
	const { container, options } = await createDockerDB();

	const sleep = 1000;
	let timeLeft = 20000;
	do {
		try {
			const client = await mssql.connect(options);
			const db = {
				query: async (sql: string, params: any[]) => {
					const res = await client.query(sql);
					return res.recordset as any[];
				},
			};
			const close = async () => {
				await client?.close().catch(console.error);
				await container?.stop().catch(console.error);
			};
			const clear = async () => {
				await client.query(`use [master];`);
				await client.query(`drop database if exists [drizzle];`);
				await client.query(`create database [drizzle];`);
				await client.query(`use [drizzle];`);
			};
			return { db, close, clear };
		} catch (e) {
			await new Promise((resolve) => setTimeout(resolve, sleep));
			timeLeft -= sleep;
		}
	} while (timeLeft > 0);

	throw new Error();
};
