import { type AnyColumn, getTableName, is, sql } from 'drizzle-orm';
import { Relations } from 'drizzle-orm/_relations';
import type { SQLiteAsyncDatabase } from 'drizzle-orm/sqlite-core';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { getSchemaInfo } from '../common.ts';
import { seedDialect } from '../seedPlan.ts';
import type { RefinementsType } from '../types/seedService.ts';
import type { Column, SeedRelations } from '../types/tables.ts';

// Sqlite------------------------------------------------------------------------------------------------------------------------
export const resetSqlite = async (
	db: SQLiteAsyncDatabase<any, any>,
	schema: { [key: string]: SQLiteTable },
) => {
	const tablesToTruncate = Object.entries(schema).map(([_tsTableName, table]) => {
		const dbTableName = getTableName(table);
		return dbTableName;
	});

	await db.run(sql.raw('PRAGMA foreign_keys = OFF'));

	for (const tableName of tablesToTruncate) {
		const sqlQuery = `delete from \`${tableName}\`;`;
		await db.run(sql.raw(sqlQuery));
	}

	await db.run(sql.raw('PRAGMA foreign_keys = ON'));
};

export const filterSqliteTables = (schema: {
	[key: string]:
		| SQLiteTable
		| Relations
		| any;
}) => {
	const sqliteSchema = Object.fromEntries(
		Object.entries(schema).filter(
			(keyValue): keyValue is [string, SQLiteTable | Relations] =>
				is(keyValue[1], SQLiteTable) || is(keyValue[1], Relations),
		),
	);

	const sqliteTables = Object.fromEntries(
		Object.entries(schema).filter(
			(keyValue): keyValue is [string, SQLiteTable] => is(keyValue[1], SQLiteTable),
		),
	);

	return { sqliteSchema, sqliteTables };
};

export const seedSqlite = async (
	db: SQLiteAsyncDatabase<any, any>,
	schema: {
		[key: string]:
			| SQLiteTable
			| Relations
			| any;
	},
	options: { count?: number; seed?: number; version?: number; relations?: SeedRelations; dryRun?: boolean } = {},
	refinements?: RefinementsType,
) => {
	const { sqliteSchema, sqliteTables } = filterSqliteTables(schema);
	const { tables, relations } = getSchemaInfo(sqliteSchema, sqliteTables, mapSqliteColumns, options.relations);

	return await seedDialect({
		connectionType: 'sqlite',
		db,
		drizzleTables: sqliteTables,
		tables,
		relations,
		options,
		refinements,
	});
};

const getTypeParams = (sqlType: string) => {
	// get type params and set only type
	const typeParams: Column['typeParams'] = {};

	if (
		sqlType.startsWith('decimal')
	) {
		const match = sqlType.match(/\((\d+), *(\d+)\)/);
		if (match) {
			typeParams['precision'] = Number(match[1]);
			typeParams['scale'] = Number(match[2]);
		}
	} else if (
		sqlType.startsWith('char')
		|| sqlType.startsWith('varchar')
		|| sqlType.startsWith('text')
	) {
		const match = sqlType.match(/\((\d+)\)/);
		if (match) {
			typeParams['length'] = Number(match[1]);
		}
	}

	return typeParams;
};

export const mapSqliteColumns = (
	columns: AnyColumn[],
	dbToTsColumnNamesMap: { [key: string]: string },
): Column[] => {
	const mappedColumns = columns.map((column) => ({
		name: dbToTsColumnNamesMap[column.name] as string,
		columnType: column.getSQLType(),
		typeParams: getTypeParams(column.getSQLType()),
		dataType: column.dataType.split(' ')[0]!,
		hasDefault: column.hasDefault,
		default: column.default,
		enumValues: column.enumValues,
		isUnique: column.isUnique,
		notNull: column.notNull,
		primary: column.primary,
	}));

	return mappedColumns;
};
