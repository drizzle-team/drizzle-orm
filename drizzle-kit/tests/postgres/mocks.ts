import { ColumnBuilder, is, SQL } from 'drizzle-orm';
import {
	AnyPgColumn,
	isPgEnum,
	isPgMaterializedView,
	isPgSequence,
	isPgView,
	PgColumnBuilder,
	PgDialect,
	PgEnum,
	PgEnumObject,
	PgMaterializedView,
	PgPolicy,
	PgRole,
	PgSchema,
	PgSequence,
	PgTable,
	pgTable,
	PgView,
	serial,
} from 'drizzle-orm/pg-core';
import { CasingType } from 'src/cli/validations/common';
import { createDDL, fromEntities, interimToDDL, PostgresDDL, SchemaError } from 'src/dialects/postgres/ddl';
import { ddlDiff, ddlDiffDry } from 'src/dialects/postgres/diff';
import {
	defaultFromColumn,
	fromDrizzleSchema,
	prepareFromSchemaFiles,
	unwrapColumn,
} from 'src/dialects/postgres/drizzle';
import { mockResolver } from 'src/utils/mocks';
import '../../src/@types/utils';
import { PGlite } from '@electric-sql/pglite';
// @ts-expect-error
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
// @ts-expect-error
import { vector } from '@electric-sql/pglite/vector';
import Docker from 'dockerode';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import getPort from 'get-port';
import crypto from 'node:crypto';
import { type Client as ClientT } from 'pg';
import pg from 'pg';
import { introspect } from 'src/cli/commands/pull-postgres';
import { suggestions } from 'src/cli/commands/push-postgres';
import { Entities } from 'src/cli/validations/cli';
import { EmptyProgressView } from 'src/cli/views';
import { hash } from 'src/dialects/common';
import { defaultToSQL, isSystemNamespace, isSystemRole } from 'src/dialects/postgres/grammar';
import { fromDatabaseForDrizzle } from 'src/dialects/postgres/introspect';
import { ddlToTypeScript } from 'src/dialects/postgres/typescript';
import { DB } from 'src/utils';
import 'zx/globals';
import { upToV8 } from 'src/cli/commands/up-postgres';
import { serializePg } from 'src/legacy/postgres-v7/serializer';
import { diff as legacyDiff } from 'src/legacy/postgres-v7/snapshotsDiffer';
import { tsc } from 'tests/utils';

mkdirSync(`tests/postgres/tmp/`, { recursive: true });

const { Client } = pg;

export type PostgresSchema = Record<
	string,
	| PgTable<any>
	| PgEnum<any>
	| PgEnumObject<any>
	| PgSchema
	| PgSequence
	| PgView
	| PgMaterializedView
	| PgRole
	| PgPolicy
	| unknown
>;

class MockError extends Error {
	constructor(readonly errors: SchemaError[]) {
		super();
	}
}

export const drizzleToDDL = (
	schema: PostgresSchema,
	casing?: CasingType | undefined,
) => {
	const tables = Object.values(schema).filter((it) => is(it, PgTable)) as PgTable[];
	const schemas = Object.values(schema).filter((it) => is(it, PgSchema)) as PgSchema[];
	const enums = Object.values(schema).filter((it) => isPgEnum(it)) as PgEnum<any>[];
	const sequences = Object.values(schema).filter((it) => isPgSequence(it)) as PgSequence[];
	const roles = Object.values(schema).filter((it) => is(it, PgRole)) as PgRole[];
	const policies = Object.values(schema).filter((it) => is(it, PgPolicy)) as PgPolicy[];
	const views = Object.values(schema).filter((it) => isPgView(it)) as PgView[];
	const materializedViews = Object.values(schema).filter((it) => isPgMaterializedView(it)) as PgMaterializedView[];

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
	left: PostgresSchema | PostgresDDL,
	right: PostgresSchema | PostgresDDL,
	renamesArr: string[],
	casing?: CasingType | undefined,
) => {
	const { ddl: ddl1, errors: err1 } = 'entities' in left && '_' in left
		? { ddl: left as PostgresDDL, errors: [] }
		: drizzleToDDL(left, casing);
	const { ddl: ddl2, errors: err2 } = 'entities' in right && '_' in right
		? { ddl: right as PostgresDDL, errors: [] }
		: drizzleToDDL(right, casing);

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
	to: PostgresSchema | PostgresDDL;
	renames?: string[];
	schemas?: string[];
	tables?: string[];
	casing?: CasingType;
	log?: 'statements' | 'none';
	entities?: Entities;
}) => {
	const { db, to, tables } = config;

	const log = config.log ?? 'none';
	const casing = config.casing ?? 'camelCase';
	const schemas = config.schemas ?? ((_: string) => true);

	const { schema } = await introspect(db, tables ?? [], schemas, config.entities, new EmptyProgressView());
	const { ddl: ddl1, errors: err3 } = interimToDDL(schema);
	const { ddl: ddl2, errors: err2 } = 'entities' in to && '_' in to
		? { ddl: to as PostgresDDL, errors: [] }
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

// init schema to db -> pull from db to file -> ddl from files -> compare ddl from db with ddl from file
export const diffIntrospect = async (
	db: DB,
	initSchema: PostgresSchema,
	testName: string,
	schemas: string[] = ['public'],
	entities?: Entities,
	casing?: CasingType | undefined,
) => {
	const { ddl: initDDL } = drizzleToDDL(initSchema, casing);
	const { sqlStatements: init } = await ddlDiffDry(createDDL(), initDDL, 'default');
	for (const st of init) await db.query(st);

	// introspect to schema
	const schema = await fromDatabaseForDrizzle(db, undefined, (it) => schemas.indexOf(it) >= 0, entities);
	const { ddl: ddl1, errors: e1 } = interimToDDL(schema);

	const filePath = `tests/postgres/tmp/${testName}.ts`;
	const file = ddlToTypeScript(ddl1, schema.viewColumns, 'camel', 'pg');
	writeFileSync(filePath, file.file);

	const typeCheckResult = await $`pnpm exec tsc --noEmit --skipLibCheck ${filePath}`.nothrow();
	if (typeCheckResult.exitCode !== 0) {
		throw new Error(typeCheckResult.stderr || typeCheckResult.stdout);
	}

	// generate snapshot from ts file
	const response = await prepareFromSchemaFiles([
		filePath,
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

	rmSync(`tests/postgres/tmp/${testName}.ts`);

	return {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
		ddlAfterPull: ddl1,
	};
};

export const diffDefault = async <T extends PgColumnBuilder>(
	kit: TestDatabase<any>,
	builder: T,
	expectedDefault: string,
	pre: PostgresSchema | null = null,
	override?: {
		type?: string;
		default?: string;
	},
	filter?: true,
) => {
	await kit.clear();

	let schemas: string[] | undefined;
	let tables: string[] | undefined;
	if (filter) {
		schemas = ['public'];
		tables = ['table'];
	}

	const config = (builder as any).config;
	const def = config['default'];
	const column = pgTable('table', { column: builder }).column;
	const { dimensions, typeSchema, sqlType: sqlt } = unwrapColumn(column);

	const type = override?.type ?? sqlt.replace(', ', ','); // real(6, 3)->real(6,3)

	const columnDefault = defaultFromColumn(column, column.default, dimensions, new PgDialect());

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
		table: pgTable('table', { column: builder }),
	};

	const { db, clear } = kit;
	if (pre) await push({ db, to: pre });
	const { sqlStatements: st1 } = await push({ db, to: init, tables, schemas });
	const { sqlStatements: st2 } = await push({ db, to: init, tables, schemas });
	const typeSchemaPrefix = typeSchema && typeSchema !== 'public' ? `"${typeSchema}".` : '';
	const typeValue = typeSchema ? `"${type.replaceAll('[]', '')}"${'[]'.repeat(dimensions)}` : type;
	const sqlType = `${typeSchemaPrefix}${typeValue}`;
	const expectedInit = `CREATE TABLE "table" (\n\t"column" ${sqlType} DEFAULT ${expectedDefault}\n);\n`;
	if (st1.length !== 1 || st1[0] !== expectedInit) res.push(`Unexpected init:\n${st1}\n\n${expectedInit}`);
	if (st2.length > 0) res.push(`Unexpected subsequent init:\n${st2}`);

	await db.query('INSERT INTO "table" ("column") VALUES (default);');

	// introspect to schema
	const schema = await fromDatabaseForDrizzle(
		db,
		tables ? (_, it) => tables.indexOf(it) >= 0 : () => true,
		schemas ? (it) => schemas.indexOf(it) >= 0 : () => true,
	);
	const { ddl: ddl1, errors: e1 } = interimToDDL(schema);

	const file = ddlToTypeScript(ddl1, schema.viewColumns, 'camel', 'pg');
	const path = `tests/postgres/tmp/temp-${hash(String(Math.random()))}.ts`;

	if (existsSync(path)) rmSync(path);
	writeFileSync(path, file.file);
	await tsc(path);

	const response = await prepareFromSchemaFiles([path]);
	const { schema: sch } = fromDrizzleSchema(response, 'camelCase');
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
		table: pgTable('table', { column: builder }),
	};

	config.hasDefault = true;
	config.default = def;
	const schema2 = {
		...pre,
		table: pgTable('table', { column: builder }),
	};

	if (pre) await push({ db, to: pre, tables, schemas });
	await push({ db, to: schema1, tables, schemas });
	const { sqlStatements: st3 } = await push({ db, to: schema2, tables, schemas });
	const expectedAlter = `ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT ${expectedDefault};`;
	if (st3.length !== 1 || st3[0] !== expectedAlter) res.push(`Unexpected default alter:\n${st3}\n\n${expectedAlter}`);

	await clear();

	const schema3 = {
		...pre,
		table: pgTable('table', { id: serial() }),
	};

	const schema4 = {
		...pre,
		table: pgTable('table', { id: serial(), column: builder }),
	};

	if (pre) await push({ db, to: pre, tables, schemas });
	await push({ db, to: schema3, tables, schemas });
	const { sqlStatements: st4 } = await push({ db, to: schema4, tables, schemas });

	const expectedAddColumn = `ALTER TABLE "table" ADD COLUMN "column" ${sqlType} DEFAULT ${expectedDefault};`;
	if (st4.length !== 1 || st4[0] !== expectedAddColumn) {
		res.push(`Unexpected add column:\n${st4[0]}\n\n${expectedAddColumn}`);
	}

	return res;
};

export const diffSnapshotV7 = async (db: DB, schema: PostgresSchema) => {
	const res = await serializePg(schema, 'camelCase');
	const { sqlStatements } = await legacyDiff({ right: res });

	for (const st of sqlStatements) {
		await db.query(st);
	}

	const { snapshot, hints } = upToV8(res);
	const ddl = fromEntities(snapshot.ddl);

	const { sqlStatements: st, next } = await diff(ddl, schema, []);
	const { sqlStatements: pst } = await push({ db, to: schema });
	const { sqlStatements: st1 } = await diff(next, schema, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema });

	return {
		step1: st,
		step2: pst,
		step3: st1,
		step4: pst1,
		all: [...st, ...pst, ...st1, ...pst1],
	};
};

export type TestDatabase<TClient = any> = {
	db: DB & { batch: (sql: string[]) => Promise<void> };
	client: TClient;
	close: () => Promise<void>;
	clear: () => Promise<void>;
};

const client = new PGlite({ extensions: { vector, pg_trgm } });

export const prepareTestDatabase = async (tx: boolean = true): Promise<TestDatabase<PGlite>> => {
	await client.query(`CREATE ACCESS METHOD drizzle_heap TYPE TABLE HANDLER heap_tableam_handler;`);
	await client.query(`CREATE EXTENSION vector;`);
	await client.query(`CREATE EXTENSION pg_trgm;`);
	if (tx) {
		await client.query('BEGIN');
		await client.query('SAVEPOINT drizzle');
	}

	const clear = async () => {
		if (tx) {
			await client.query('ROLLBACK TO SAVEPOINT drizzle');
			await client.query('BEGIN');
			await client.query('SAVEPOINT drizzle');
			return;
		}

		const namespaces = await client.query<{ name: string }>('select oid, nspname as name from pg_namespace').then((
			res,
		) => res.rows.filter((r) => !isSystemNamespace(r.name)));

		const roles = await client.query<{ rolname: string }>(
			`SELECT rolname, rolinherit, rolcreatedb, rolcreaterole FROM pg_roles;`,
		).then((it) => it.rows.filter((it) => !isSystemRole(it.rolname)));

		for (const namespace of namespaces) {
			await client.query(`DROP SCHEMA "${namespace.name}" cascade`);
		}

		await client.query('CREATE SCHEMA public;');

		for (const role of roles) {
			await client.query(`DROP ROLE "${role.rolname}"`);
		}

		await client.query(`CREATE EXTENSION vector;`);
		await client.query(`CREATE EXTENSION pg_trgm;`);
	};

	const db: TestDatabase<any>['db'] = {
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
	return { db, close: async () => {}, clear, client };
};

export const createDockerPostgis = async () => {
	const docker = new Docker();
	const port = await getPort();
	const image = 'postgis/postgis:16-3.4';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err: any) => err ? reject(err) : resolve(err))
	);

	const user = 'postgres', password = 'postgres', database = 'postgres';
	const pgContainer = await docker.createContainer({
		Image: image,
		Env: [`POSTGRES_USER=${user}`, `POSTGRES_PASSWORD=${password}`, `POSTGRES_DATABASE=${database}`],
		name: `drizzle-integration-tests-${crypto.randomUUID()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'5432/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await pgContainer.start();

	return {
		url: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`,
		container: pgContainer,
	};
};

export const preparePostgisTestDatabase = async (tx: boolean = true): Promise<TestDatabase<any>> => {
	const envURL = process.env.POSTGIS_URL;
	const { url, container } = envURL ? { url: envURL, container: null } : await createDockerPostgis();
	const sleep = 1000;
	let timeLeft = 40000;
	let connected = false;
	let lastError;

	let pgClient: ClientT;
	do {
		try {
			pgClient = new Client({ connectionString: url });
			await pgClient.connect();
			connected = true;
			break;
		} catch (e) {
			lastError = e;
			await new Promise((resolve) => setTimeout(resolve, sleep));
			timeLeft -= sleep;
		}
	} while (timeLeft > 0);
	if (!connected) {
		console.error('Cannot connect to Postgres');
		await pgClient!.end().catch(console.error);
		await container?.stop().catch(console.error);
		throw lastError;
	}

	await pgClient!.query(`DROP ACCESS METHOD IF EXISTS drizzle_heap;`);
	await pgClient!.query(`CREATE ACCESS METHOD drizzle_heap TYPE TABLE HANDLER heap_tableam_handler;`);
	await pgClient!.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);
	if (tx) {
		await pgClient!.query('BEGIN').catch();
		await pgClient!.query('SAVEPOINT drizzle');
	}

	const clear = async () => {
		if (tx) {
			await pgClient.query('ROLLBACK TO SAVEPOINT drizzle');
			await pgClient.query('BEGIN');
			await pgClient.query('SAVEPOINT drizzle');
			return;
		}

		const namespaces = await pgClient.query<{ name: string }>('select oid, nspname as name from pg_namespace').then((
			res,
		) => res.rows.filter((r) => !isSystemNamespace(r.name)));

		const roles = await pgClient.query<{ rolname: string }>(
			`SELECT rolname, rolinherit, rolcreatedb, rolcreaterole FROM pg_roles;`,
		).then((it) => it.rows.filter((it) => !isSystemRole(it.rolname)));

		for (const namespace of namespaces) {
			await pgClient.query(`DROP SCHEMA "${namespace.name}" cascade`);
		}

		await pgClient.query('CREATE SCHEMA public;');

		for (const role of roles) {
			await pgClient.query(`DROP ROLE "${role.rolname}"`);
		}

		await pgClient.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);
	};

	const close = async () => {
		await pgClient.end().catch(console.error);
		await container?.stop().catch(console.error);
	};

	const db: TestDatabase['db'] = {
		query: async (sql, params) => {
			return pgClient.query(sql, params).then((it) => it.rows as any[]).catch((e: Error) => {
				const error = new Error(`query error: ${sql}\n\n${e.message}`);
				throw error;
			});
		},
		batch: async (sqls) => {
			for (const sql of sqls) {
				await pgClient.query(sql);
			}
		},
	};
	return { db, close, clear, client };
};
