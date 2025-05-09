import { Database } from 'better-sqlite3';
import { is } from 'drizzle-orm';
import { SQLiteTable, SQLiteView } from 'drizzle-orm/sqlite-core';
import { rmSync, writeFileSync } from 'fs';
import { suggestions } from 'src/cli/commands/push-sqlite';
import { CasingType } from 'src/cli/validations/common';
import { interimToDDL } from 'src/dialects/sqlite/ddl';
import { ddlDiff, ddlDiffDry } from 'src/dialects/sqlite/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/sqlite/drizzle';
import { fromDatabaseForDrizzle } from 'src/dialects/sqlite/introspect';
import { ddlToTypescript } from 'src/dialects/sqlite/typescript';
import { mockResolver } from 'src/utils/mocks';

export type SqliteSchema = Record<string, SQLiteTable<any> | SQLiteView>;

const schemaToDDL = (schema: SqliteSchema, casing?: CasingType) => {
	const tables = Object.values(schema).filter((it) => is(it, SQLiteTable)) as SQLiteTable[];
	const views = Object.values(schema).filter((it) => is(it, SQLiteView)) as SQLiteView[];

	return interimToDDL(fromDrizzleSchema(tables, views, casing));
};
export const diff = async (
	left: SqliteSchema,
	right: SqliteSchema,
	renamesArr: string[],
	casing?: CasingType | undefined,
) => {
	const { ddl: ddl1, errors: err1 } = schemaToDDL(left, casing);
	const { ddl: ddl2, errors: err2 } = schemaToDDL(right, casing);

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
		'generate',
	);
	return { sqlStatements, statements, err1, err2 };
};

const dbFrom = (client: Database) => {
	return {
		query: async <T>(sql: string, params: any[] = []) => {
			return client.prepare(sql).bind(params).all() as T[];
		},
		run: async (query: string) => {
			client.prepare(query).run();
		},
	};
};

export const diff2 = async (config: {
	client: Database;
	left: SqliteSchema;
	right: SqliteSchema;
	renames?: string[];
	seed?: string[];
	casing?: CasingType;
}) => {
	const { client, left, right, casing } = config;

	const { ddl: initDDL, errors: err1 } = schemaToDDL(left, casing);
	const { sqlStatements: initStatements } = await ddlDiffDry(initDDL, 'push');

	if (config.seed) initStatements.push(...config.seed);
	for (const st of initStatements) {
		client.exec(st);
	}

	const db = dbFrom(client);

	const schema = await fromDatabaseForDrizzle(db);

	const { ddl: ddl1, errors: err2 } = interimToDDL(schema);
	const { ddl: ddl2, errors: err3 } = schemaToDDL(right, casing);

	// console.log(ddl1.entities.list())
	// console.log("-----")
	// console.log(ddl2.entities.list())
	// console.log("-----")

	const rens = new Set<string>(config.renames || []);

	const { sqlStatements, statements, renames } = await ddlDiff(
		ddl1,
		ddl2,
		mockResolver(rens),
		mockResolver(rens),
		'push',
	);

	const { statements: truncates, hints } = await suggestions(db, statements);
	return { sqlStatements, statements, truncates, hints };
};

export const diffAfterPull = async (
	client: Database,
	initSchema: SqliteSchema,
	testName: string,
	casing?: CasingType | undefined,
) => {
	const db = dbFrom(client);

	const { ddl: initDDL, errors: e1 } = schemaToDDL(initSchema, casing);
	const { sqlStatements: inits } = await ddlDiffDry(initDDL, 'push');
	for (const st of inits) {
		client.exec(st);
	}

	const path = `tests/sqlite/tmp/${testName}.ts`;

	const schema = await fromDatabaseForDrizzle(db);
	const { ddl: ddl2, errors: err1 } = interimToDDL(schema);
	const file = ddlToTypescript(ddl2, 'camel', schema.viewsToColumns, 'sqlite');

	writeFileSync(path, file.file);

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

	return { sqlStatements, statements };
};
