import { type AnyColumn, getTableName, is, sql } from 'drizzle-orm';
import { Relations } from 'drizzle-orm/_relations';
import type { MySqlDatabase, MySqlSchema } from 'drizzle-orm/mysql-core';
import { MySqlTable } from 'drizzle-orm/mysql-core';
import { getSchemaInfo } from '../common.ts';
import { SeedService } from '../SeedService.ts';
import type { RefinementsType } from '../types/seedService.ts';
import type { Column } from '../types/tables.ts';

// MySql-----------------------------------------------------------------------------------------------------
export const resetMySql = async (
	db: MySqlDatabase<any, any>,
	schema: { [key: string]: MySqlTable },
) => {
	const tablesToTruncate = Object.entries(schema).map(([_tsTableName, table]) => {
		const dbTableName = getTableName(table);
		return dbTableName;
	});

	await db.execute(sql.raw('SET FOREIGN_KEY_CHECKS = 0;'));

	for (const tableName of tablesToTruncate) {
		const sqlQuery = `truncate \`${tableName}\`;`;
		await db.execute(sql.raw(sqlQuery));
	}

	await db.execute(sql.raw('SET FOREIGN_KEY_CHECKS = 1;'));
};

export const filterMysqlTables = (schema: {
	[key: string]:
		| MySqlTable
		| MySqlSchema
		| Relations
		| any;
}) => {
	const mysqlSchema = Object.fromEntries(
		Object.entries(schema).filter(
			(keyValue): keyValue is [string, MySqlTable | Relations] =>
				is(keyValue[1], MySqlTable) || is(keyValue[1], Relations),
		),
	);

	const mysqlTables = Object.fromEntries(
		Object.entries(schema).filter(
			(keyValue): keyValue is [string, MySqlTable] => is(keyValue[1], MySqlTable),
		),
	);

	return { mysqlSchema, mysqlTables };
};

export const seedMySql = async (
	db: MySqlDatabase<any, any>,
	schema: {
		[key: string]:
			| MySqlTable
			| MySqlSchema
			| Relations
			| any;
	},
	options: { count?: number; seed?: number; version?: number } = {},
	refinements?: RefinementsType,
) => {
	const { mysqlSchema, mysqlTables } = filterMysqlTables(schema);
	const { tables, relations } = getSchemaInfo(mysqlSchema, mysqlTables, mapMySqlColumns);

	const seedService = new SeedService();

	const generatedTablesGenerators = seedService.generatePossibleGenerators(
		'mysql',
		tables,
		relations,
		refinements,
		options,
	);

	const preserveCyclicTablesData = relations.some((rel) => rel.isCyclic === true);

	const tablesValues = await seedService.generateTablesValues(
		relations,
		generatedTablesGenerators,
		db,
		mysqlTables,
		{ ...options, preserveCyclicTablesData },
	);

	const { filteredTablesGenerators, tablesUniqueNotNullColumn } = seedService.filterCyclicTables(
		generatedTablesGenerators,
	);
	const updateDataInDb = filteredTablesGenerators.length === 0 ? false : true;

	await seedService.generateTablesValues(
		relations,
		filteredTablesGenerators,
		db,
		mysqlTables,
		{ ...options, tablesValues, updateDataInDb, tablesUniqueNotNullColumn },
	);
};
const getTypeParams = (sqlType: string) => {
	// get type params and set only type
	const typeParams: Column['typeParams'] = {};

	if (
		sqlType.startsWith('decimal')
		|| sqlType.startsWith('real')
		|| sqlType.startsWith('double')
		|| sqlType.startsWith('float')
	) {
		const match = sqlType.match(/\((\d+), *(\d+)\)/);
		if (match) {
			typeParams['precision'] = Number(match[1]);
			typeParams['scale'] = Number(match[2]);
		}
	} else if (
		sqlType.startsWith('char')
		|| sqlType.startsWith('varchar')
		|| sqlType.startsWith('binary')
		|| sqlType.startsWith('varbinary')
	) {
		const match = sqlType.match(/\((\d+)\)/);
		if (match) {
			typeParams['length'] = Number(match[1]);
		}
	}

	return typeParams;
};

export const mapMySqlColumns = (
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
