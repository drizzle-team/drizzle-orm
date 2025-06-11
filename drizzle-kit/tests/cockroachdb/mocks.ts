import { is } from 'drizzle-orm';
import {
	AnyCockroachDbColumn,
	CockroachDbColumnBuilder,
	CockroachDbDialect,
	CockroachDbEnum,
	CockroachDbEnumObject,
	CockroachDbMaterializedView,
	CockroachDbPolicy,
	CockroachDbRole,
	CockroachDbSchema,
	CockroachDbSequence,
	CockroachDbTable,
	cockroachdbTable,
	CockroachDbView,
	int4,
	isCockroachDbEnum,
	isCockroachDbMaterializedView,
	isCockroachDbSequence,
	isCockroachDbView,
} from 'drizzle-orm/cockroachdb-core';
import { CasingType } from 'src/cli/validations/common';
import { CockroachDbDDL, Column, createDDL, interimToDDL, SchemaError } from 'src/dialects/cockroachdb/ddl';
import { ddlDiff, ddlDiffDry } from 'src/dialects/cockroachdb/diff';
import {
	defaultFromColumn,
	fromDrizzleSchema,
	prepareFromSchemaFiles,
	unwrapColumn,
} from 'src/dialects/cockroachdb/drizzle';
import { mockResolver } from 'src/utils/mocks';
import '../../src/@types/utils';
import Docker from 'dockerode';
import { existsSync, rmSync, writeFileSync } from 'fs';
import getPort from 'get-port';
import { Pool, PoolClient } from 'pg';
import { introspect } from 'src/cli/commands/pull-cockroachdb';

import { suggestions } from 'src/cli/commands/push-cockroachdb';
import { Entities } from 'src/cli/validations/cli';
import { EmptyProgressView } from 'src/cli/views';
import { defaultToSQL, isSystemRole } from 'src/dialects/cockroachdb/grammar';
import { fromDatabaseForDrizzle } from 'src/dialects/cockroachdb/introspect';
import { ddlToTypeScript } from 'src/dialects/cockroachdb/typescript';
import { hash } from 'src/dialects/common';
import { DB } from 'src/utils';
import { v4 as uuidV4 } from 'uuid';

export type CockroachDBSchema = Record<
	string,
	| CockroachDbTable<any>
	| CockroachDbEnum<any>
	| CockroachDbEnumObject<any>
	| CockroachDbSchema
	| CockroachDbSequence
	| CockroachDbView
	| CockroachDbMaterializedView
	| CockroachDbRole
	| CockroachDbPolicy
>;

class MockError extends Error {
	constructor(readonly errors: SchemaError[]) {
		super();
	}
}

export const drizzleToDDL = (
	schema: CockroachDBSchema,
	casing?: CasingType | undefined,
) => {
	const tables = Object.values(schema).filter((it) => is(it, CockroachDbTable)) as CockroachDbTable[];
	const schemas = Object.values(schema).filter((it) => is(it, CockroachDbSchema)) as CockroachDbSchema[];
	const enums = Object.values(schema).filter((it) => isCockroachDbEnum(it)) as CockroachDbEnum<any>[];
	const sequences = Object.values(schema).filter((it) => isCockroachDbSequence(it)) as CockroachDbSequence[];
	const roles = Object.values(schema).filter((it) => is(it, CockroachDbRole)) as CockroachDbRole[];
	const policies = Object.values(schema).filter((it) => is(it, CockroachDbPolicy)) as CockroachDbPolicy[];
	const views = Object.values(schema).filter((it) => isCockroachDbView(it)) as CockroachDbView[];
	const materializedViews = Object.values(schema).filter((it) =>
		isCockroachDbMaterializedView(it)
	) as CockroachDbMaterializedView[];

	const {
		schema: res,
		errors,
		warnings,
	} = fromDrizzleSchema(
		{ schemas, tables, enums, sequences, roles, policies, views, matViews: materializedViews },
		casing,
	);

	if (errors.length > 0) {
		throw new Error();
	}

	return interimToDDL(res);
};

// 2 schemas -> 2 ddls -> diff
export const diff = async (
	left: CockroachDBSchema | CockroachDbDDL,
	right: CockroachDBSchema,
	renamesArr: string[],
	casing?: CasingType | undefined,
) => {
	const { ddl: ddl1, errors: err1 } = 'entities' in left && '_' in left
		? { ddl: left as CockroachDbDDL, errors: [] }
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
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		'default',
	);
	return { sqlStatements, statements, groupedStatements, next: ddl2 };
};

// init schema flush to db -> introspect db to ddl -> compare ddl with destination schema
export const push = async (config: {
	db: DB;
	to: CockroachDBSchema | CockroachDbDDL;
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

	const { schema } = await introspect(db, [], schemas, config.entities, new EmptyProgressView());

	const { ddl: ddl1, errors: err3 } = interimToDDL(schema);
	const { ddl: ddl2, errors: err2 } = 'entities' in to && '_' in to
		? { ddl: to as CockroachDbDDL, errors: [] }
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

	// writeFileSync("./ddl1.json", JSON.stringify(ddl1.entities.list()))
	// writeFileSync("./ddl2.json", JSON.stringify(ddl2.entities.list()))

	// TODO: handle errors

	const renames = new Set(config.renames ?? []);
	const { sqlStatements, statements } = await ddlDiff(
		ddl1,
		ddl2,
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		'push',
	);

	const { hints, losses } = await suggestions(db, statements);

	for (const sql of sqlStatements) {
		if (log === 'statements') console.log(sql);
		await db.query(sql);
	}

	return { sqlStatements, statements, hints, losses };
};

export const diffPush = async (config: {
	db: DB;
	from: CockroachDBSchema;
	to: CockroachDBSchema;
	renames?: string[];
	schemas?: string[];
	casing?: CasingType;
	entities?: Entities;
	before?: string[];
	after?: string[];
	apply?: boolean;
}) => {
	const { db, from: initSchema, to: destination, casing, before, after, renames: rens, entities } = config;

	const schemas = config.schemas ?? ['public'];
	const apply = typeof config.apply === 'undefined' ? true : config.apply;
	const { ddl: initDDL } = drizzleToDDL(initSchema, casing);
	const { sqlStatements: inits } = await ddlDiffDry(createDDL(), initDDL, 'default');

	const init = [] as string[];
	if (before) init.push(...before);
	if (apply) init.push(...inits);
	if (after) init.push(...after);
	const mViewsRefreshes = initDDL.views.list({ materialized: true }).map((it) =>
		`REFRESH MATERIALIZED VIEW "${it.schema}"."${it.name}"${it.withNoData ? ' WITH NO DATA;' : ';'};`
	);
	init.push(...mViewsRefreshes);

	for (const st of init) {
		await db.query(st);
	}

	// do introspect into CockroachDbSchemaInternal
	const introspectedSchema = await fromDatabaseForDrizzle(db, undefined, (it) => schemas.indexOf(it) >= 0, entities);

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
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		'push',
	);

	const { hints, losses } = await suggestions(
		db,
		statements,
	);
	return { sqlStatements, statements, hints, losses };
};

// init schema to db -> pull from db to file -> ddl from files -> compare ddl from db with ddl from file
export const diffIntrospect = async (
	db: DB,
	initSchema: CockroachDBSchema,
	testName: string,
	schemas: string[] = ['public'],
	entities?: Entities,
	casing?: CasingType | undefined,
) => {
	const { ddl: initDDL } = drizzleToDDL(initSchema, casing);
	const { sqlStatements: init } = await ddlDiffDry(createDDL(), initDDL, 'default');

	for (const st of init) await db.query(st);

	// introspect to schema
	const schema = await fromDatabaseForDrizzle(db, (_) => true, (it) => schemas.indexOf(it) >= 0, entities);

	const { ddl: ddl1, errors: e1 } = interimToDDL(schema);

	const file = ddlToTypeScript(ddl1, schema.viewColumns, 'camel', 'cockroachdb');
	writeFileSync(`tests/cockroachdb/tmp/${testName}.ts`, file.file);

	// generate snapshot from ts file
	const response = await prepareFromSchemaFiles([
		`tests/cockroachdb/tmp/${testName}.ts`,
	]);

	const {
		schema: schema2,
		errors: e2,
		warnings,
	} = fromDrizzleSchema(response, casing);
	const { ddl: ddl2, errors: e3 } = interimToDDL(schema2);
	// TODO: handle errors

	const {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
	} = await ddlDiffDry(ddl1, ddl2, 'push');

	rmSync(`tests/cockroachdb/tmp/${testName}.ts`);

	return {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
	};
};

export const diffDefault = async <T extends CockroachDbColumnBuilder>(
	kit: TestDatabase,
	builder: T,
	expectedDefault: string,
	pre: CockroachDBSchema | null = null,
) => {
	await kit.clear();

	const config = (builder as any).config;
	const def = config['default'];
	const column = cockroachdbTable('table', { column: builder }).column;

	const { baseColumn, dimensions, baseType, options, typeSchema } = unwrapColumn(column);
	const columnDefault = defaultFromColumn(baseColumn, column.default, dimensions, new CockroachDbDialect(), options);
	const defaultSql = defaultToSQL({
		default: columnDefault,
		type: baseType,
		dimensions,
		typeSchema: typeSchema,
		options: options,
	} as Column);

	const res = [] as string[];
	if (defaultSql !== expectedDefault) {
		res.push(`Unexpected sql: \n${defaultSql}\n${expectedDefault}`);
	}

	const init = {
		...pre,
		table: cockroachdbTable('table', { column: builder }),
	};

	const { db, clear } = kit;
	if (pre) await push({ db, to: pre });
	const { sqlStatements: st1 } = await push({ db, to: init, log: 'statements' });
	const { sqlStatements: st2 } = await push({ db, to: init });

	const typeSchemaPrefix = typeSchema && typeSchema !== 'public' ? `"${typeSchema}".` : '';
	const typeValue = typeSchema ? `"${baseType}"` : baseType;
	let sqlType;
	if (baseType.includes('with time zone')) {
		const [type, ...rest] = typeValue.split(' ');

		sqlType = `${typeSchemaPrefix}${type}${options ? `(${options})` : ''} ${rest.join(' ')}${'[]'.repeat(dimensions)}`;
	} else {
		sqlType = `${typeSchemaPrefix}${typeValue}${options ? `(${options})` : ''}${'[]'.repeat(dimensions)}`;
	}

	const expectedInit = `CREATE TABLE "table" (\n\t"column" ${sqlType} DEFAULT ${expectedDefault}\n);\n`;
	if (st1.length !== 1 || st1[0] !== expectedInit) res.push(`Unexpected init:\n${st1}\n\n${expectedInit}`);
	if (st2.length > 0) res.push(`Unexpected subsequent init:\n${st2}`);

	// introspect to schema
	const schema = await fromDatabaseForDrizzle(db);
	const { ddl: ddl1, errors: e1 } = interimToDDL(schema);

	const file = ddlToTypeScript(ddl1, schema.viewColumns, 'camel', 'cockroachdb');
	const path = `tests/cockroachdb/tmp/temp-${hash(String(Math.random()))}.ts`;

	if (existsSync(path)) rmSync(path);
	writeFileSync(path, file.file);

	const response = await prepareFromSchemaFiles([path]);
	const { schema: sch } = fromDrizzleSchema(response, 'camelCase');
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
		table: cockroachdbTable('table', { column: builder }),
	};

	config.hasDefault = true;
	config.default = def;
	const schema2 = {
		...pre,
		table: cockroachdbTable('table', { column: builder }),
	};

	if (pre) await push({ db, to: pre });
	await push({ db, to: schema1 });
	const { sqlStatements: st3 } = await push({ db, to: schema2 });
	const expectedAlter = `ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT ${expectedDefault};`;
	if (st3.length !== 1 || st3[0] !== expectedAlter) res.push(`Unexpected default alter:\n${st3}\n\n${expectedAlter}`);

	await clear();

	const schema3 = {
		...pre,
		table: cockroachdbTable('table', { id: int4().generatedAlwaysAsIdentity() }),
	};

	const schema4 = {
		...pre,
		table: cockroachdbTable('table', { id: int4().generatedAlwaysAsIdentity(), column: builder }),
	};

	if (pre) await push({ db, to: pre });
	await push({ db, to: schema3 });
	const { sqlStatements: st4 } = await push({ db, to: schema4 });

	const expectedAddColumn = `ALTER TABLE "table" ADD COLUMN "column" ${sqlType} DEFAULT ${expectedDefault};`;
	if (st4.length !== 1 || st4[0] !== expectedAddColumn) {
		res.push(`Unexpected add column:\n${st4[0]}\n\n${expectedAddColumn}`);
	}

	return res;
};

export type TestDatabase = {
	db: DB & { batch: (sql: string[]) => Promise<void> };
	close: () => Promise<void>;
	clear: () => Promise<void>;
};

let cockroachdbContainer: Docker.Container;
export async function createDockerDB(): Promise<{ connectionString: string; container: Docker.Container }> {
	const docker = new Docker();
	const port = await getPort({ port: 26257 });
	const image = 'cockroachdb/cockroach:v25.2.0';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
	);

	cockroachdbContainer = await docker.createContainer({
		Image: image,
		Cmd: ['start-single-node', '--insecure'],
		name: `drizzle-integration-tests-${uuidV4()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'26257/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await cockroachdbContainer.start();

	return {
		connectionString: `postgresql://root@127.0.0.1:${port}/defaultdb?sslmode=disable`,
		container: cockroachdbContainer,
	};
}

export const prepareTestDatabase = async (): Promise<TestDatabase> => {
	const { connectionString, container } = await createDockerDB();

	let client: PoolClient;
	const sleep = 1000;
	let timeLeft = 20000;
	do {
		try {
			client = await (new Pool({ connectionString })).connect();

			await client.query('CREATE EXTENSION IF NOT EXISTS postgis;');
			await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
			await client.query(`SET CLUSTER SETTING feature.vector_index.enabled = true;`);

			const clear = async () => {
				await client.query('DROP DATABASE defaultdb;');
				await client.query('CREATE DATABASE defaultdb;');

				const roles = await client.query<{ rolname: string }>(
					`SELECT rolname, rolinherit, rolcreatedb, rolcreaterole FROM pg_roles;`,
				).then((it) => it.rows.filter((it) => !isSystemRole(it.rolname)));

				for (const role of roles) {
					await client.query(`DROP ROLE "${role.rolname}"`);
				}
			};

			const db: TestDatabase['db'] = {
				query: async (sql, params) => {
					return client.query(sql, params).then((it) => it.rows as any[]).catch((e: Error) => {
						const error = new Error(`query error: ${sql}\n\n${e.message}`);
						throw error;
					});
				},
				batch: async (sqls) => {
					for (const sql of sqls) {
						await client.query(sql);
					}
				},
			};
			return {
				db,
				close: async () => {
					client.release();
					await container.stop();
				},
				clear,
			};
		} catch (e) {
			await new Promise((resolve) => setTimeout(resolve, sleep));
			timeLeft -= sleep;
		}
	} while (timeLeft > 0);
	throw Error();
};
