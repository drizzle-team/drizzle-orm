import { is } from 'drizzle-orm';
import { MySqlSchema, MySqlTable, MySqlView } from 'drizzle-orm/mysql-core';
import { rmSync, writeFileSync } from 'fs';
import { CasingType } from 'src/cli/validations/common';
import { createDDL, interimToDDL } from 'src/dialects/mysql/ddl';
import { ddlDiffDry, diffDDL } from 'src/dialects/mysql/diff';
import { fromDrizzleSchema } from 'src/dialects/mysql/drizzle';
import { fromDatabase } from 'src/dialects/mysql/introspect';
import { DB } from 'src/utils';
import { mockResolver } from 'src/utils/mocks';

export type MysqlSchema = Record<
	string,
	MySqlTable<any> | MySqlSchema | MySqlView
>;

const drizzleToDDL = (sch: MysqlSchema, casing?: CasingType | undefined) => {
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

	const { sqlStatements, statements } = await diffDDL(
		ddl1,
		ddl2,
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		'default',
	);
	return { sqlStatements, statements };
};
export const pushPullDiff = async (
	db: DB,
	initSchema: MysqlSchema,
	testName: string,
	casing?: CasingType | undefined,
) => {
	const { ddl: initDDL } = drizzleToDDL(initSchema, casing);
	const { sqlStatements: init } = await ddlDiffDry(initDDL);
	for (const st of init) await db.query(st);

	// introspect to schema
	const schema = await fromDatabase(db, "drizzle");
	const { ddl: ddl1, errors: e1 } = interimToDDL(schema);

	const file = ddlToTypeScript(ddl1, schema.viewColumns, 'camel');
	writeFileSync(`tests/postgres/tmp/${testName}.ts`, file.file);

	// generate snapshot from ts file
	const response = await prepareFromSchemaFiles([
		`tests/postgres/tmp/${testName}.ts`,
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
	} = await diffDDL(
		ddl1,
		ddl2,
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		'push',
	);

	rmSync(`tests/postgres/tmp/${testName}.ts`);

	return {
		sqlStatements: afterFileSqlStatements,
		statements: afterFileStatements,
	};
};
