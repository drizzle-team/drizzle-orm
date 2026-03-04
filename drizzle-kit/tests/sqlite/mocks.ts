import type { Database } from 'better-sqlite3';
import BetterSqlite3 from 'better-sqlite3';
import { is } from 'drizzle-orm';
import { int, SQLiteColumnBuilder, SQLiteTable, sqliteTable, SQLiteView } from 'drizzle-orm/sqlite-core';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import type { SQLiteTable as SQLiteTableOld, SQLiteView as SQLiteViewOld } from 'orm044/sqlite-core';
import { introspect } from 'src/cli/commands/pull-sqlite';
import { suggestions } from 'src/cli/commands/push-sqlite';
import { CasingType, configMigrations } from 'src/cli/validations/common';
import { EmptyProgressView } from 'src/cli/views';
import { hash } from 'src/dialects/common';
import { createDDL, fromEntities, interimToDDL, SQLiteDDL } from 'src/dialects/sqlite/ddl';
import { ddlDiff, ddlDiffDry } from 'src/dialects/sqlite/diff';
import { defaultFromColumn, fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/sqlite/drizzle';
import { fromDatabaseForDrizzle } from 'src/dialects/sqlite/introspect';
import { ddlToTypeScript } from 'src/dialects/sqlite/typescript';
import { SQLiteDB } from 'src/utils';
import { mockResolver } from 'src/utils/mocks';
import { tsc } from 'tests/utils';
import 'zx/globals';
import { updateToV7 } from 'src/cli/commands/up-sqlite';
import { serializeSQLite } from 'src/legacy/sqlite-v6/serializer';
import { diff as legacyDiff } from 'src/legacy/sqlite-v6/sqliteDiff';

mkdirSync('tests/sqlite/tmp/', { recursive: true });

export type SqliteSchema = Record<string, SQLiteTable | SQLiteView | unknown>;
export type SqliteSchemaOld = Record<string, SQLiteTableOld | SQLiteViewOld | unknown>;

export const drizzleToDDL = (schema: SqliteSchema, casing?: CasingType) => {
	const tables = Object.values(schema).filter((it) => is(it, SQLiteTable)) as SQLiteTable[];
	const views = Object.values(schema).filter((it) => is(it, SQLiteView)) as SQLiteView[];

	return interimToDDL(fromDrizzleSchema(tables, views, casing));
};

export const diff = async (
	left: SqliteSchema | SQLiteDDL,
	right: SqliteSchema | SQLiteDDL,
	renamesArr: string[],
	casing?: CasingType | undefined,
) => {
	const { ddl: ddl1, errors: err1 } = 'entities' in left && '_' in left
		? { ddl: left as SQLiteDDL, errors: [] }
		: drizzleToDDL(left, casing);
	const { ddl: ddl2, errors: err2 } = 'entities' in right && '_' in right
		? { ddl: right as SQLiteDDL, errors: [] }
		: drizzleToDDL(right, casing);

	if (err1.length > 0 || err2.length > 0) {
		console.log('-----');
		console.log(err1.map((it) => it.type).join('\n'));
		console.log('-----');
		console.log(err2.map((it) => it.type).join('\n'));
		console.log('-----');
	}

	const renames = new Set(renamesArr);

	const { sqlStatements, statements } = await ddlDiff(
		ddl1,
		ddl2,
		mockResolver(renames),
		mockResolver(renames),
		'default',
	);
	return { sqlStatements, statements, err1, err2, next: ddl2 };
};

export const dbFrom = (client: Database) => {
	return {
		query: async <T>(sql: string, params: any[] = []) => {
			return client.prepare(sql).bind(params).all() as T[];
		},
		run: async (query: string) => {
			client.prepare(query).run();
		},
	};
};

export const diffAfterPull = async (
	client: Database,
	initSchema: SqliteSchema,
	testName: string,
	casing?: CasingType | undefined,
) => {
	const db = dbFrom(client);

	const { ddl: initDDL, errors: e1 } = drizzleToDDL(initSchema, casing);
	const { sqlStatements: inits } = await ddlDiffDry(createDDL(), initDDL, 'push');
	for (const st of inits) {
		client.exec(st);
	}

	const path = `tests/sqlite/tmp/${testName}.ts`;

	const schema = await fromDatabaseForDrizzle(db, () => true, () => {}, {
		schema: 'drizzle',
		table: '__drizzle_migrations',
	});
	const { ddl: ddl2, errors: err1 } = interimToDDL(schema);
	const file = ddlToTypeScript(ddl2, 'camel', schema.viewsToColumns, 'sqlite');

	writeFileSync(path, file.file);
	await tsc(file.file);

	const res = await prepareFromSchemaFiles([path]);
	const { ddl: ddl1, errors: err2 } = interimToDDL(fromDrizzleSchema(res.tables, res.views, casing));

	const { sqlStatements, statements } = await ddlDiff(
		ddl1,
		ddl2,
		mockResolver(new Set()),
		mockResolver(new Set()),
		'push',
	);

	rmSync(path);

	return { sqlStatements, statements, initDDL, ddlAfterPull: ddl1, resultDdl: ddl2 };
};

export const push = async (config: {
	db: SQLiteDB;
	to: SqliteSchema | SQLiteDDL;
	renames?: string[];
	casing?: CasingType;
	force?: boolean;
	expectError?: boolean;
	log?: 'statements';
	ignoreSubsequent?: boolean;
	migrationsConfig?: { table?: string };
}) => {
	const { db, to, expectError, force, log } = config;
	const casing = config.casing ?? 'camelCase';

	const migrations = configMigrations.parse(config.migrationsConfig);
	const { ddl: ddl1, errors: err1, viewColumns } = await introspect(
		db,
		() => true,
		new EmptyProgressView(),
		() => {},
		migrations,
	);
	const { ddl: ddl2, errors: err2 } = 'entities' in to && '_' in to
		? { ddl: to as SQLiteDDL, errors: [] }
		: drizzleToDDL(to, casing);

	if (err2.length > 0) {
		for (const e of err2) {
			console.error(`err2: ${JSON.stringify(e)}`);
		}
		throw new Error();
	}

	if (err1.length > 0) {
		for (const e of err1) {
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
		'push',
	);

	const hints = await suggestions(db, statements);

	if (force) {
		for (const st of hints) {
			if (!st.statement) continue;
			await db.run(st.statement);
		}
	}

	let error: Error | null = null;
	for (const sql of sqlStatements) {
		if (log === 'statements') console.log(sql);
		try {
			await db.run(sql);
		} catch (e) {
			if (!expectError) throw e;
			error = e as Error;
			break;
		}
	}

	// subsequent push
	if (!config.ignoreSubsequent) {
		const { ddl: ddl1, errors, viewColumns } = await introspect(
			db,
			() => true,
			new EmptyProgressView(),
			() => {},
			migrations,
		);

		const { sqlStatements, statements } = await ddlDiff(
			ddl1,
			ddl2,
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

	return { sqlStatements, statements, hints, error, next: ddl2 };
};

export const diffDefault = async <T extends SQLiteColumnBuilder>(
	kit: TestDatabase,
	builder: T,
	expectedDefault: string,
	pre: SqliteSchema | null = null,
) => {
	await kit.clear();

	const config = (builder as any).config;
	const def = config['default'];
	const column = sqliteTable('table', { column: builder }).column;
	const type = column.getSQLType();
	const columnDefault = defaultFromColumn(column, 'camelCase');
	const defaultSql = columnDefault ?? '';

	const res = [] as string[];
	if (defaultSql !== expectedDefault) {
		res.push(`Unexpected sql: \n${defaultSql}\n${expectedDefault}`);
	}

	const init = {
		...pre,
		table: sqliteTable('table', { column: builder }),
	};

	const { db, clear } = kit;
	if (pre) await push({ db, to: pre });
	const { sqlStatements: st1 } = await push({ db, to: init });
	const { sqlStatements: st2 } = await push({ db, to: init });

	const expectedInit = `CREATE TABLE \`table\` (\n\t\`column\` ${type} DEFAULT ${expectedDefault}\n);\n`;
	if (st1.length !== 1 || st1[0] !== expectedInit) res.push(`Unexpected init:\n${st1}\n\n${expectedInit}`);
	if (st2.length > 0) res.push(`Unexpected subsequent init:\n${st2.join('\n')}`);

	// introspect to schema
	const schema = await fromDatabaseForDrizzle(db, () => true, () => {}, {
		schema: 'drizzle',
		table: '__drizzle_migrations',
	});
	const { ddl: ddl1, errors: e1 } = interimToDDL(schema);

	const file = ddlToTypeScript(ddl1, 'camel', schema.viewsToColumns, 'sqlite');
	const path = `tests/sqlite/tmp/temp-${hash(String(Math.random()))}.ts`;

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
		table: sqliteTable('table', { column: builder }),
	};

	config.hasDefault = true;
	config.default = def;
	const schema2 = {
		...pre,
		table: sqliteTable('table', { column: builder }),
	};

	if (pre) await push({ db, to: pre });
	await push({ db, to: schema1 });
	const { sqlStatements: st3 } = await push({ db, to: schema2 });

	const expectedAlter =
		`CREATE TABLE \`__new_table\` (\n\t\`column\` ${column.getSQLType()} DEFAULT ${expectedDefault}\n);\n`;
	if (st3.length !== 6 || st3[1] !== expectedAlter) {
		res.push(`Unexpected default alter:\n${st3.join('\n')}\n\n${expectedAlter}`);
	}

	await clear();

	const schema3 = {
		...pre,
		table: sqliteTable('table', { id: int() }),
	};

	const schema4 = {
		...pre,
		table: sqliteTable('table', { id: int(), column: builder }),
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

export type TestDatabase = {
	db: SQLiteDB;
	close: () => Promise<void>;
	clear: () => Promise<void>;
	getClient: () => Database;
};

export const prepareTestDatabase = () => {
	let client = new BetterSqlite3(':memory:');

	const db = {
		query: async (sql: string, params?: any[]) => {
			try {
				const stmt = client.prepare(sql);
				const res = stmt.all(...(params ?? [])) as any;
				return res;
			} catch (error) {
				const newError = new Error(`query error: ${sql}\n\n${(error as Error).message}`);
				throw newError;
			}
		},
		run: async (sql: string) => {
			try {
				const stmt = client.prepare(sql);
				stmt.run();
				return;
			} catch (error) {
				const newError = new Error(`query error: ${sql}\n\n${(error as Error).message}`);
				throw newError;
			}
		},
	};
	const close = async () => {
		client.close();
	};
	const clear = async () => {
		client.close();
		client = new BetterSqlite3(':memory:');
	};
	const getClient = () => client;
	return { db, close, clear, getClient };
};

export const diffSnapshotV6 = async (
	db: SQLiteDB,
	schema: SqliteSchema,
	schemaOld: SqliteSchemaOld,
	command?: 'push' | 'generate',
) => {
	const res = await serializeSQLite(schemaOld, 'camelCase');

	const { sqlStatements } = await legacyDiff({ right: res });

	for (const st of sqlStatements) {
		await db.run(st);
	}

	const snapshot = updateToV7(res);

	const ddl = fromEntities(snapshot.ddl);

	let st: string[] = [];
	let st1: string[] = [];
	let pst: string[] = [];
	let pst1: string[] = [];
	if (!command || command === 'generate') {
		const { sqlStatements: sqlStatements1, next } = await diff(ddl, schema, []);
		const { sqlStatements: sqlStatements2 } = await diff(next, schema, []);

		st = sqlStatements1;
		st1 = sqlStatements2;
	}
	if (!command || command === 'push') {
		({ sqlStatements: pst } = await push({ db, to: schema }));
		({ sqlStatements: pst1 } = await push({ db, to: schema }));
	}
	return {
		step1: st,
		step2: pst,
		step3: st1,
		step4: pst1,
		all: [
			...st,
			...pst,
			...st1,
			...pst1,
		],
	};
};
