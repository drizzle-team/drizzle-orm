import { is } from 'drizzle-orm';
import {
	AnyCockroachColumn,
	CockroachColumnBuilder,
	CockroachDialect,
	CockroachEnum,
	CockroachEnumObject,
	CockroachMaterializedView,
	CockroachPolicy,
	CockroachRole,
	CockroachSchema,
	CockroachSequence,
	CockroachTable,
	cockroachTable,
	CockroachView,
	int4,
	isCockroachEnum,
	isCockroachMaterializedView,
	isCockroachSequence,
	isCockroachView,
} from 'drizzle-orm/cockroach-core';
import { CasingType } from 'src/cli/validations/common';
import { CockroachDDL, Column, createDDL, interimToDDL, SchemaError } from 'src/dialects/cockroach/ddl';
import { ddlDiff, ddlDiffDry } from 'src/dialects/cockroach/diff';
import {
	defaultFromColumn,
	fromDrizzleSchema,
	prepareFromSchemaFiles,
	unwrapColumn,
} from 'src/dialects/cockroach/drizzle';
import { mockResolver } from 'src/utils/mocks';
import '../../src/@types/utils';
import Docker from 'dockerode';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import getPort from 'get-port';
import { Pool, PoolClient } from 'pg';
import { introspect } from 'src/cli/commands/pull-cockroach';
import { suggestions } from 'src/cli/commands/push-cockroach';
import { Entities } from 'src/cli/validations/cli';
import { EmptyProgressView } from 'src/cli/views';
import { defaultToSQL, isSystemRole } from 'src/dialects/cockroach/grammar';
import { fromDatabaseForDrizzle } from 'src/dialects/cockroach/introspect';
import { ddlToTypeScript } from 'src/dialects/cockroach/typescript';
import { hash } from 'src/dialects/common';
import { DB } from 'src/utils';
import { v4 as uuidV4 } from 'uuid';
import 'zx/globals';
import { measure } from 'tests/utils';

mkdirSync('tests/cockroach/tmp', { recursive: true });

export type CockroachDBSchema = Record<
	string,
	| CockroachTable<any>
	| CockroachEnum<any>
	| CockroachEnumObject<any>
	| CockroachSchema
	| CockroachSequence
	| CockroachView
	| CockroachMaterializedView
	| CockroachRole
	| CockroachPolicy
>;

class MockError extends Error {
	constructor(readonly errors: SchemaError[]) {
		super();
	}
}

export const drizzleToDDL = (schema: CockroachDBSchema, casing?: CasingType | undefined) => {
	const tables = Object.values(schema).filter((it) => is(it, CockroachTable)) as CockroachTable[];
	const schemas = Object.values(schema).filter((it) => is(it, CockroachSchema)) as CockroachSchema[];
	const enums = Object.values(schema).filter((it) => isCockroachEnum(it)) as CockroachEnum<any>[];
	const sequences = Object.values(schema).filter((it) => isCockroachSequence(it)) as CockroachSequence[];
	const roles = Object.values(schema).filter((it) => is(it, CockroachRole)) as CockroachRole[];
	const policies = Object.values(schema).filter((it) => is(it, CockroachPolicy)) as CockroachPolicy[];
	const views = Object.values(schema).filter((it) => isCockroachView(it)) as CockroachView[];
	const materializedViews = Object.values(schema).filter((it) =>
		isCockroachMaterializedView(it)
	) as CockroachMaterializedView[];

	const { schema: res, errors, warnings } = fromDrizzleSchema({
		schemas,
		tables,
		enums,
		sequences,
		roles,
		policies,
		views,
		matViews: materializedViews,
	}, casing);

	if (errors.length > 0) {
		throw new Error();
	}

	return interimToDDL(res);
};

// 2 schemas -> 2 ddls -> diff
export const diff = async (
	left: CockroachDBSchema | CockroachDDL,
	right: CockroachDBSchema,
	renamesArr: string[],
	casing?: CasingType | undefined,
) => {
	const { ddl: ddl1, errors: err1 } = 'entities' in left && '_' in left
		? { ddl: left as CockroachDDL, errors: [] }
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

export const pushM = async (config: {
	db: DB;
	to: CockroachDBSchema | CockroachDDL;
	renames?: string[];
	schemas?: string[];
	casing?: CasingType;
	log?: 'statements' | 'none';
	entities?: Entities;
}) => {
	return measure(push(config), 'push');
};
// init schema flush to db -> introspect db to ddl -> compare ddl with destination schema
export const push = async (
	config: {
		db: DB;
		to: CockroachDBSchema | CockroachDDL;
		renames?: string[];
		schemas?: string[];
		casing?: CasingType;
		log?: 'statements' | 'none';
		entities?: Entities;
	},
) => {
	const { db, to } = config;
	const log = config.log ?? 'none';
	const casing = config.casing ?? 'camelCase';
	const schemas = config.schemas ?? ((_: string) => true);

	const { schema } = await introspect(db, [], schemas, config.entities, new EmptyProgressView());

	const { ddl: ddl1, errors: err2 } = interimToDDL(schema);
	const { ddl: ddl2, errors: err3 } = 'entities' in to && '_' in to
		? { ddl: to as CockroachDDL, errors: [] }
		: drizzleToDDL(to, casing);

	if (err2.length > 0) {
		throw new MockError(err2);
	}

	if (err3.length > 0) {
		throw new MockError(err3);
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

	// do introspect into CockroachSchemaInternal
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

	const { hints, losses } = await suggestions(db, statements);
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
	const schema = await fromDatabaseForDrizzle(
		db,
		(_) => true,
		(it) => schemas.indexOf(it) >= 0,
		entities,
	);

	const { ddl: ddl1, errors: e1 } = interimToDDL(schema);

	const filePath = `tests/cockroach/tmp/${testName}.ts`;

	const file = ddlToTypeScript(ddl1, schema.viewColumns, 'camel');
	writeFileSync(filePath, file.file);

	const typeCheckResult = await $`pnpm exec tsc --noEmit --skipLibCheck ${filePath}`.nothrow();
	if (typeCheckResult.exitCode !== 0) {
		throw new Error(typeCheckResult.stderr || typeCheckResult.stdout);
	}

	// generate snapshot from ts file
	const response = await prepareFromSchemaFiles([filePath]);

	const { schema: schema2, errors: e2, warnings } = fromDrizzleSchema(response, casing);
	const { ddl: ddl2, errors: e3 } = interimToDDL(schema2);

	const { sqlStatements: afterFileSqlStatements, statements: afterFileStatements } = await ddlDiffDry(
		ddl1,
		ddl2,
		'push',
	);

	rmSync(`tests/cockroach/tmp/${testName}.ts`);

	return {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
	};
};

export const diffDefault = async <T extends CockroachColumnBuilder>(
	kit: TestDatabase,
	builder: T,
	expectedDefault: string,
	expectError: boolean = false,
	pre: CockroachDBSchema | null = null,
) => {
	await kit.clear();

	const config = (builder as any).config;
	const def = config['default'];
	const column = cockroachTable('table', { column: builder }).column;

	const { dimensions, baseType, options, typeSchema, sqlType: type } = unwrapColumn(column);
	const columnDefault = defaultFromColumn(column, column.default, dimensions, new CockroachDialect());

	const defaultSql = defaultToSQL({
		default: columnDefault,
		type,
		dimensions,
		typeSchema: typeSchema,
	});

	const res = [] as string[];
	if (defaultSql !== expectedDefault) {
		res.push(`Unexpected sql: \n${defaultSql}\n${expectedDefault}`);
	}

	const init = {
		...pre,
		table: cockroachTable('table', { column: builder }),
	};

	const { db, clear } = kit;
	if (pre) await push({ db, to: pre });
	const { sqlStatements: st1 } = await push({ db, to: init });
	const { sqlStatements: st2 } = await push({ db, to: init });

	const typeSchemaPrefix = typeSchema && typeSchema !== 'public' ? `"${typeSchema}".` : '';
	const typeValue = typeSchema ? `"${baseType}"` : baseType;
	const sqlType = `${typeSchemaPrefix}${typeValue}${options ? `(${options})` : ''}${'[]'.repeat(dimensions)}`;
	const expectedInit = `CREATE TABLE "table" (\n\t"column" ${sqlType} DEFAULT ${expectedDefault}\n);\n`;

	if (st1.length !== 1 || st1[0] !== expectedInit) res.push(`Unexpected init:\n${st1}\n\n${expectedInit}`);
	if (st2.length > 0) res.push(`Unexpected subsequent init:\n${st2}`);

	await db.query('INSERT INTO "table" ("column") VALUES (default);').catch((error) => {
		if (!expectError) throw error;
		res.push(`Insert default failed`);
	});

	// introspect to schema
	// console.time();
	const schema = await fromDatabaseForDrizzle(db);

	const { ddl: ddl1, errors: e1 } = interimToDDL(schema);

	const file = ddlToTypeScript(ddl1, schema.viewColumns, 'camel');
	const path = `tests/cockroach/tmp/temp-${hash(String(Math.random()))}.ts`;

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

	// console.timeEnd();

	await clear();

	config.hasDefault = false;
	config.default = undefined;
	const schema1 = {
		...pre,
		table: cockroachTable('table', { column: builder }),
	};

	config.hasDefault = true;
	config.default = def;
	const schema2 = {
		...pre,
		table: cockroachTable('table', { column: builder }),
	};

	if (pre) await push({ db, to: pre });
	await push({ db, to: schema1 });
	const { sqlStatements: st3 } = await push({ db, to: schema2 });
	const expectedAlter = `ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT ${expectedDefault};`;
	if (st3.length !== 1 || st3[0] !== expectedAlter) res.push(`Unexpected default alter:\n${st3}\n\n${expectedAlter}`);

	await clear();

	const schema3 = {
		...pre,
		table: cockroachTable('table', { id: int4() }),
	};

	const schema4 = {
		...pre,
		table: cockroachTable('table', { id: int4(), column: builder }),
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

export async function createDockerDB() {
	const docker = new Docker();
	const port = await getPort({ port: 26257 });
	const image = 'cockroachdb/cockroach:v25.2.0';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
	);

	const container = await docker.createContainer({
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

	await container.start();

	return {
		url: `postgresql://root@127.0.0.1:${port}/defaultdb?sslmode=disable`,
		container,
	};
}

export const prepareTestDatabase = async (tx: boolean = true): Promise<TestDatabase> => {
	const envUrl = process.env.COCKROACH_URL;
	const { url, container } = envUrl ? { url: envUrl, container: null } : await createDockerDB();

	let client: PoolClient;
	const sleep = 1000;
	let timeLeft = 20000;
	do {
		try {
			client = await new Pool({ connectionString: url }).connect();

			await client.query('DROP DATABASE defaultdb;');
			await client.query('CREATE DATABASE defaultdb;');

			await client.query('SET autocommit_before_ddl = OFF;'); // for transactions to work
			await client.query(`SET CLUSTER SETTING feature.vector_index.enabled = true;`);

			if (tx) {
				await client.query('BEGIN');
			}

			const clear = async () => {
				if (tx) {
					await client.query('ROLLBACK;');
					await client.query('BEGIN;');
					return;
				}

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
					return client
						.query(sql, params)
						.then((it) => it.rows as any[])
						.catch((e: Error) => {
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
					await container?.stop();
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
