import { is } from 'drizzle-orm';
import { SQLiteTable, SQLiteView } from 'drizzle-orm/sqlite-core';
import { CasingType } from 'src/cli/validations/common';
import { interimToDDL } from 'src/dialects/sqlite/ddl';
import { applySqliteSnapshotsDiff } from 'src/dialects/sqlite/differ';
import { fromDrizzleSchema } from 'src/dialects/sqlite/drizzle';
import { mockResolver } from 'src/utils/mocks';

export type SqliteSchema = Record<string, SQLiteTable<any> | SQLiteView>;

export const diffTestSchemasSqlite = async (
	left: SqliteSchema,
	right: SqliteSchema,
	renamesArr: string[],
	cli: boolean = false,
	casing?: CasingType | undefined,
) => {
	const leftTables = Object.values(left).filter((it) => is(it, SQLiteTable)) as SQLiteTable[];
	const leftViews = Object.values(left).filter((it) => is(it, SQLiteView)) as SQLiteView[];

	const rightTables = Object.values(right).filter((it) => is(it, SQLiteTable)) as SQLiteTable[];
	const rightViews = Object.values(right).filter((it) => is(it, SQLiteView)) as SQLiteView[];

	const { ddl: ddl1, errors: err1 } = interimToDDL(fromDrizzleSchema(leftTables, leftViews, casing));
	const { ddl: ddl2, errors: err2 } = interimToDDL(fromDrizzleSchema(rightTables, rightViews, casing));

	if (err1.length > 0 || err2.length > 0) {
		console.log('-----');
		console.log(err1.map((it) => it.type).join('\n'));
		console.log('-----');
		console.log(err2.map((it) => it.type).join('\n'));
		console.log('-----');
	}

	const renames = new Set(renamesArr);

	if (!cli) {
		const { sqlStatements, statements } = await applySqliteSnapshotsDiff(
			ddl1,
			ddl2,
			mockResolver(renames),
			mockResolver(renames),
			'generate',
		);
		return { sqlStatements, statements, err1, err2 };
	}

	const { sqlStatements, statements, warnings } = await applySqliteSnapshotsDiff(
		ddl1,
		ddl2,
		mockResolver(renames),
		mockResolver(renames),
		'generate',
	);
	return { sqlStatements, statements, err1, err2 };
};
