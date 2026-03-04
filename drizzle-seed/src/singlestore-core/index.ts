import { type AnyColumn, getTableName, is, sql } from 'drizzle-orm';
import { Relations } from 'drizzle-orm/_relations';
import type { SingleStoreDatabase, SingleStoreSchema } from 'drizzle-orm/singlestore-core';
import { SingleStoreTable } from 'drizzle-orm/singlestore-core';
import { getSchemaInfo } from '../common.ts';
import { SeedService } from '../SeedService.ts';
import type { RefinementsType } from '../types/seedService.ts';
import type { Column } from '../types/tables.ts';

// SingleStore-----------------------------------------------------------------------------------------------------
export const resetSingleStore = async (
	db: SingleStoreDatabase<any, any>,
	schema: { [key: string]: SingleStoreTable },
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

export const filterSingleStoreTables = (schema: {
	[key: string]:
		| SingleStoreTable
		| SingleStoreSchema
		| Relations
		| any;
}) => {
	const singleStoreSchema = Object.fromEntries(
		Object.entries(schema).filter(
			(keyValue): keyValue is [string, SingleStoreTable | Relations] =>
				is(keyValue[1], SingleStoreTable) || is(keyValue[1], Relations),
		),
	);

	const singleStoreTables = Object.fromEntries(
		Object.entries(schema).filter(
			(keyValue): keyValue is [string, SingleStoreTable] => is(keyValue[1], SingleStoreTable),
		),
	);

	return { singleStoreSchema, singleStoreTables };
};

export const seedSingleStore = async (
	db: SingleStoreDatabase<any, any>,
	schema: {
		[key: string]:
			| SingleStoreTable
			| SingleStoreSchema
			| Relations
			| any;
	},
	options: { count?: number; seed?: number; version?: number } = {},
	refinements?: RefinementsType,
) => {
	const { singleStoreSchema, singleStoreTables } = filterSingleStoreTables(schema);
	const { tables, relations } = getSchemaInfo(singleStoreSchema, singleStoreTables, mapSingleStoreColumns);

	const seedService = new SeedService();

	const generatedTablesGenerators = seedService.generatePossibleGenerators(
		'singlestore',
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
		singleStoreTables,
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
		singleStoreTables,
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
		|| sqlType.startsWith('text')
		|| sqlType.startsWith('binary')
		|| sqlType.startsWith('varbinary')
	) {
		const match = sqlType.match(/\((\d+)\)/);
		if (match) {
			typeParams['length'] = Number(match[1]);
		}
	} else if (sqlType.startsWith('vector')) {
		const match = sqlType.match(/\((\d+),? ?((F|I)\d{1,2})?\)/);
		if (match) {
			typeParams['length'] = Number(match[1]);
			typeParams['vectorValueType'] = match[2] as typeof typeParams['vectorValueType'];
		}
	}

	return typeParams;
};

export const mapSingleStoreColumns = (
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
