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
import { CasingType, configMigrations } from 'src/cli/validations/common';
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
import { EmptyProgressView, explain } from 'src/cli/views';
import { defaultToSQL, isSystemRole } from 'src/dialects/cockroach/grammar';
import { fromDatabaseForDrizzle } from 'src/dialects/cockroach/introspect';
import { ddlToTypeScript } from 'src/dialects/cockroach/typescript';
import { DB } from 'src/utils';
import { v4 as uuidV4 } from 'uuid';
import 'zx/globals';
import { randomUUID } from 'crypto';
import { EntitiesFilter, EntitiesFilterConfig } from 'src/cli/validations/cli';
import { hash } from 'src/dialects/common';
import { extractCrdbExisting } from 'src/dialects/drizzle';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import { measure, tsc } from 'tests/utils';
import { expect, test as base } from 'vitest';

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

export const drizzleToDDL = (
	schema: CockroachDBSchema,
	casing: CasingType | undefined,
	filterConfig: EntitiesFilterConfig = {
		schemas: undefined,
		tables: undefined,
		entities: undefined,
		extensions: undefined,
	},
) => {
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

	const existing = extractCrdbExisting(schemas, views, materializedViews);
	const filter = prepareEntityFilter('cockroach', filterConfig, existing);
	const { schema: res, errors, warnings } = fromDrizzleSchema(
		{
			schemas,
			tables,
			enums,
			sequences,
			roles,
			policies,
			views,
			matViews: materializedViews,
		},
		casing,
		filter,
	);

	if (errors.length > 0) {
		throw new Error();
	}

	return { ...interimToDDL(res), existing };
};

// 2 schemas -> 2 ddls -> diff
export const diff = async (
	left: CockroachDBSchema | CockroachDDL,
	right: CockroachDBSchema | CockroachDDL,
	renamesArr: string[],
	casing?: CasingType | undefined,
) => {
	const { ddl: ddl1, errors: err1 } = 'entities' in left && '_' in left
		? { ddl: left as CockroachDDL, errors: [] }
		: drizzleToDDL(left, casing);
	const { ddl: ddl2, errors: err2 } = 'entities' in right && '_' in right
		? { ddl: right as CockroachDDL, errors: [] }
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
	entities?: EntitiesFilter;
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
		entities?: EntitiesFilter;
		ignoreSubsequent?: boolean;
		explain?: true;
		migrationsConfig?: {
			schema?: string;
			table?: string;
		};
	},
) => {
	const { db, to } = config;
	const log = config.log ?? 'none';
	const casing = config.casing;

	const filterConfig: EntitiesFilterConfig = {
		schemas: config.schemas,
		tables: undefined,
		entities: config.entities,
		extensions: [],
	};

	const migrations = configMigrations.parse(config.migrationsConfig);

	const { ddl: ddl2, errors: err3, existing } = 'entities' in to && '_' in to
		? { ddl: to as CockroachDDL, errors: [], existing: [] }
		: drizzleToDDL(to, casing, filterConfig);

	const filter = prepareEntityFilter('cockroach', filterConfig, existing);

	const { schema } = await introspect(
		db,
		filter,
		new EmptyProgressView(),
		() => {},
		migrations,
	);

	const { ddl: ddl1, errors: err2 } = interimToDDL(schema);

	if (err2.length > 0) {
		throw new MockError(err2);
	}

	if (err3.length > 0) {
		throw new MockError(err3);
	}

	// TODO: handle errors

	const renames = new Set(config.renames ?? []);
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
		'push',
	);

	const hints = await suggestions(db, statements);

	if (config.explain) {
		const explainMessage = explain('cockroach', groupedStatements, false, []);
		console.log(explainMessage);
		return { sqlStatements, statements, hints };
	}

	for (const sql of sqlStatements) {
		if (log === 'statements') console.log(sql);
		await db.query(sql);
	}

	// subsequent push
	if (!config.ignoreSubsequent) {
		{
			const { schema } = await introspect(
				db,
				filter,
				new EmptyProgressView(),
				() => {},
				migrations,
			);
			const { ddl: ddl1, errors: err3 } = interimToDDL(schema);

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
				'push',
			);
			if (sqlStatements.length > 0) {
				// const msg = groupedStatements.map((x) => psqlExplain(x.jsonStatement, x.sqlStatements)).join('\n');
				console.error('---- subsequent push is not empty ----');
				// console.error(msg);
				expect(sqlStatements.join('\n')).toBe('');
			}
		}
	}

	return { sqlStatements, statements, hints };
};

// init schema to db -> pull from db to file -> ddl from files -> compare ddl from db with ddl from file
export const diffIntrospect = async (
	db: DB,
	initSchema: CockroachDBSchema,
	testName: string,
	schemas: string[] = [],
	entities?: EntitiesFilter,
	casing?: CasingType | undefined,
) => {
	const filterConfig: EntitiesFilterConfig = {
		schemas,
		entities,
		tables: [],
		extensions: [],
	};
	const { ddl: initDDL, existing } = drizzleToDDL(initSchema, casing, filterConfig);
	const { sqlStatements: init } = await ddlDiffDry(createDDL(), initDDL, 'default');

	for (const st of init) await db.query(st);
	const filter = prepareEntityFilter('cockroach', filterConfig, existing);
	// introspect to schema
	const schema = await fromDatabaseForDrizzle(db, filter, () => {}, { table: 'drizzle_migrations', schema: 'drizzle' });

	const { ddl: ddl1, errors: e1 } = interimToDDL(schema);

	const filePath = `tests/cockroach/tmp/${testName}.ts`;

	const file = ddlToTypeScript(ddl1, schema.viewColumns, 'camel');
	writeFileSync(filePath, file.file);

	await tsc(file.file);

	// generate snapshot from ts file
	const response = await prepareFromSchemaFiles([filePath]);

	const { schema: schema2, errors: e2, warnings } = fromDrizzleSchema(response, casing, filter);
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
		schema2,
	};
};

export const diffDefault = async <T extends CockroachColumnBuilder>(
	db: TestDatabase,
	builder: T,
	expectedDefault: string,
	override?: {
		expectError?: boolean;
		ignoreSubsequent?: boolean;
		pre?: CockroachDBSchema;
	},
) => {
	await db.clear();

	const config = (builder as any).config;

	const expectError = override?.expectError ?? false;
	const ignoreSubsequent = typeof override?.ignoreSubsequent === 'undefined' ? true : override.ignoreSubsequent;
	const pre: CockroachDBSchema | null = override?.pre ?? null;
	const def = config['default'];

	const column = cockroachTable('table', { column: builder }).column;
	const { dimensions, typeSchema, sqlType: sqlt } = unwrapColumn(column);
	const type = sqlt.replaceAll('[]', '');

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

	if (pre) await push({ db, to: pre, ignoreSubsequent });
	const { sqlStatements: st1 } = await push({ db, to: init, ignoreSubsequent });
	const { sqlStatements: st2 } = await push({ db, to: init, ignoreSubsequent });

	const typeSchemaPrefix = typeSchema && typeSchema !== 'public' ? `"${typeSchema}".` : '';
	const typeValue = typeSchema ? `"${type}"` : type;
	const sqlType = `${typeSchemaPrefix}${typeValue}${'[]'.repeat(dimensions)}`;
	const expectedInit = `CREATE TABLE "table" (\n\t"column" ${sqlType} DEFAULT ${expectedDefault}\n);\n`;

	if (st1.length !== 1 || st1[0] !== expectedInit) res.push(`Unexpected init:\n${st1}\n\n${expectedInit}`);
	if (st2.length > 0) res.push(`Unexpected subsequent init:\n${st2}`);

	try {
		await db.query('INSERT INTO "table" ("column") VALUES (default);');
	} catch (error) {
		if (!expectError) throw error;
		res.push(`Insert default failed`);
	}

	const filter = () => true;
	// introspect to schema
	const schema = await fromDatabaseForDrizzle(db, filter, () => {}, { table: 'drizzle_migrations', schema: 'drizzle' });
	const { ddl: ddl1, errors: e1 } = interimToDDL(schema);

	const file = ddlToTypeScript(ddl1, schema.viewColumns, 'camel');
	const path = `tests/cockroach/tmp/temp-${randomUUID()}.ts`;

	if (existsSync(path)) rmSync(path);
	writeFileSync(path, file.file);
	await tsc(file.file);

	const response = await prepareFromSchemaFiles([path]);

	const { schema: sch } = fromDrizzleSchema(response, 'camelCase', () => true);
	const { ddl: ddl2, errors: e3 } = interimToDDL(sch);

	const { sqlStatements: afterFileSqlStatements } = await ddlDiffDry(ddl1, ddl2, 'push');

	if (afterFileSqlStatements.length === 0) {
		rmSync(path);
	} else {
		console.log(afterFileSqlStatements);
		console.log(`./${path}`);
		res.push(`Default type mismatch after diff:\n${`./${path}`}`);
	}

	await db.clear();

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

	if (pre) await push({ db, to: pre, ignoreSubsequent });
	await push({ db, to: schema1, ignoreSubsequent });
	const { sqlStatements: st3 } = await push({ db, to: schema2, ignoreSubsequent });
	const expectedAlter = `ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT ${expectedDefault};`;
	if (st3.length !== 1 || st3[0] !== expectedAlter) res.push(`Unexpected default alter:\n${st3}\n\n${expectedAlter}`);

	await db.clear();

	const schema3 = {
		...pre,
		table: cockroachTable('table', { id: int4() }),
	};

	const schema4 = {
		...pre,
		table: cockroachTable('table', { id: int4(), column: builder }),
	};

	if (pre) await push({ db, to: pre, ignoreSubsequent });
	await push({ db, to: schema3, ignoreSubsequent });
	const { sqlStatements: st4 } = await push({ db, to: schema4, ignoreSubsequent });

	const expectedAddColumn = `ALTER TABLE "table" ADD COLUMN "column" ${sqlType} DEFAULT ${expectedDefault};`;
	if (st4.length !== 1 || st4[0] !== expectedAddColumn) {
		res.push(`Unexpected add column:\n${st4[0]}\n\n${expectedAddColumn}`);
	}

	return res;
};

export type TestDatabase = DB & {
	batch: (sql: string[]) => Promise<void>;
	close: () => void;
	clear: () => Promise<void>;
	client: PoolClient;
};

export type TestDatabaseKit = {
	acquire: () => Promise<{ db: TestDatabase; release: () => void }>;
	acquireTx: () => Promise<{ db: TestDatabase; release: () => void }>;
	close: () => Promise<void>;
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

const prepareClient = async (url: string, n: string, tx: boolean) => {
	const name = `${n}${hash(String(Math.random()), 10)}`;

	const client = await new Pool({ connectionString: url, max: 1 }).connect();

	await client.query(`DROP DATABASE IF EXISTS ${name};`);
	await client.query(`CREATE DATABASE IF NOT EXISTS ${name};`);
	await client.query(`USE ${name}`);

	await client.query('SET autocommit_before_ddl = OFF;'); // for transactions to work
	await client.query(`SET CLUSTER SETTING feature.vector_index.enabled = true;`);

	// await client.query(`SET TIME ZONE '+01';`);

	if (tx) {
		await client.query('BEGIN');
	}

	const clear = async () => {
		if (tx) {
			await client.query('ROLLBACK');
			await client.query('BEGIN');
		} else {
			await client.query(`DROP DATABASE IF EXISTS ${name};`);
			await client.query(`CREATE DATABASE ${name};`);
			await client.query(`USE ${name};`);
			const roles = await client.query<{ rolname: string }>(
				`SELECT rolname, rolinherit, rolcreatedb, rolcreaterole FROM pg_roles;`,
			).then((it) => it.rows.filter((it) => !isSystemRole(it.rolname)));

			for (const role of roles) {
				await client.query(`DROP ROLE "${role.rolname}"`);
			}
		}
	};

	const db: TestDatabase = {
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
		clear: clear,
		close: async () => {
			client.release();
		},
		client,
	};
	return db;
};

export const prepareTestDatabase = async (): Promise<TestDatabaseKit> => {
	const envUrl = process.env.COCKROACH_CONNECTION_STRING;

	let url: string;
	let container: Docker.Container | null = null;

	if (envUrl) {
		// Support multiple connection strings separated by ';'
		const urls = envUrl.split(';').filter(Boolean);
		if (urls.length > 1) {
			// Use VITEST_POOL_ID to distribute workers across containers
			const poolId = parseInt(process.env.VITEST_POOL_ID || '1', 10);
			url = urls[poolId % urls.length]!;
		} else {
			url = urls[0]!;
		}
	} else {
		const dockerResult = await createDockerDB();
		url = dockerResult.url;
		container = dockerResult.container;
	}

	const clients = [
		await prepareClient(url, 'db0', false),
		await prepareClient(url, 'db1', false),
		await prepareClient(url, 'db2', false),
		await prepareClient(url, 'db3', false),
		await prepareClient(url, 'db4', false),
	];

	const clientsTxs = [
		await prepareClient(url, 'dbc0', true),
		await prepareClient(url, 'dbc1', true),
		await prepareClient(url, 'dbc2', true),
		await prepareClient(url, 'dbc3', true),
		await prepareClient(url, 'dbc4', true),
	];

	const closureTxs = async () => {
		while (true) {
			const c = clientsTxs.shift();
			if (!c) {
				await sleep(50);
				continue;
			}
			return {
				db: c,
				release: () => {
					clientsTxs.push(c);
				},
			};
		}
	};

	const closure = async () => {
		while (true) {
			const c = clients.shift();
			if (!c) {
				await sleep(50);
				continue;
			}
			return {
				db: c,
				release: () => {
					clients.push(c);
				},
			};
		}
	};

	return {
		acquire: closure,
		acquireTx: closureTxs,
		close: async () => {
			for (const c of clients) {
				c.close();
			}
			await container?.stop();
		},
	};
};

export const test = base.extend<{ kit: TestDatabaseKit; db: TestDatabase; dbc: TestDatabase }>({
	kit: [
		async ({}, use) => { // oxlint-disable-line no-empty-pattern
			const kit = await prepareTestDatabase();
			try {
				await use(kit);
			} finally {
				await kit.close();
			}
		},
		{ scope: 'worker' },
	],
	// concurrent no transactions
	db: [
		async ({ kit }, use) => {
			const { db, release } = await kit.acquire();
			await use(db);
			await db.clear();
			release();
		},
		{ scope: 'test' },
	],

	// concurrent with transactions
	dbc: [
		async ({ kit }, use) => {
			const { db, release } = await kit.acquireTx();
			await use(db);
			await db.clear();
			release();
		},
		{ scope: 'test' },
	],
});
