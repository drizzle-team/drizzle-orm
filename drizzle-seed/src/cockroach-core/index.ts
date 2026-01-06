import { type AnyColumn, is, sql } from 'drizzle-orm';
import { Relations } from 'drizzle-orm/_relations';
import type { CockroachArray, CockroachDatabase, CockroachSchema } from 'drizzle-orm/cockroach-core';
import { CockroachTable, getTableConfig } from 'drizzle-orm/cockroach-core';
import { getSchemaInfo } from '../common.ts';
import { SeedService } from '../SeedService.ts';
import type { RefinementsType } from '../types/seedService.ts';
import type { Column } from '../types/tables.ts';

// Cockroach-----------------------------------------------------------------------------------------------------------
export const resetCockroach = async (
	db: CockroachDatabase<any, any>,
	cockroachTables: { [key: string]: CockroachTable },
) => {
	const tablesToTruncate = Object.entries(cockroachTables).map(([_, table]) => {
		const config = getTableConfig(table);
		config.schema = config.schema === undefined ? 'public' : config.schema;

		return `"${config.schema}"."${config.name}"`;
	});

	await db.execute(sql.raw(`truncate ${tablesToTruncate.join(',')} cascade;`));
};

export const filterCockroachSchema = (schema: {
	[key: string]:
		| CockroachTable
		| CockroachSchema
		| Relations
		| any;
}) => {
	const cockroachSchema = Object.fromEntries(
		Object.entries(schema).filter((keyValue): keyValue is [string, CockroachTable | Relations] =>
			is(keyValue[1], CockroachTable) || is(keyValue[1], Relations)
		),
	);

	const cockroachTables = Object.fromEntries(
		Object.entries(schema).filter((keyValue): keyValue is [string, CockroachTable] => is(keyValue[1], CockroachTable)),
	);

	return { cockroachSchema, cockroachTables };
};

export const seedCockroach = async (
	db: CockroachDatabase<any, any>,
	schema: {
		[key: string]:
			| CockroachTable
			| CockroachSchema
			| Relations
			| any;
	},
	options: { count?: number; seed?: number; version?: number } = {},
	refinements?: RefinementsType,
) => {
	const seedService = new SeedService();

	const { cockroachSchema, cockroachTables } = filterCockroachSchema(schema);
	const { tables, relations } = getSchemaInfo(cockroachSchema, cockroachTables, mapCockroachColumns);

	const generatedTablesGenerators = seedService.generatePossibleGenerators(
		'cockroach',
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
		cockroachTables,
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
		cockroachTables,
		{ ...options, tablesValues, updateDataInDb, tablesUniqueNotNullColumn },
	);
};
const getTypeParams = (sqlType: string) => {
	// get type params
	const typeParams: Column['typeParams'] = {};

	// handle dimensions
	if (sqlType.includes('[')) {
		const match = sqlType.match(/\[\w*]/g);
		if (match) {
			typeParams['dimensions'] = match.length;
		}
	}

	if (
		sqlType.startsWith('numeric')
		|| sqlType.startsWith('decimal')
		|| sqlType.startsWith('double precision')
		|| sqlType.startsWith('real')
	) {
		const match = sqlType.match(/\((\d+), *(\d+)\)/);
		if (match) {
			typeParams['precision'] = Number(match[1]);
			typeParams['scale'] = Number(match[2]);
		}
	} else if (
		sqlType.startsWith('varchar')
		|| sqlType.startsWith('char')
		|| sqlType.startsWith('bit')
		|| sqlType.startsWith('vector')
		|| sqlType.startsWith('time')
		|| sqlType.startsWith('timestamp')
		|| sqlType.startsWith('interval')
	) {
		const match = sqlType.match(/\((\d+)\)/);
		if (match) {
			typeParams['length'] = Number(match[1]);
		}
	}

	return typeParams;
};

const getAllBaseColumns = (
	baseColumn: CockroachArray<any, any>['baseColumn'] & { baseColumn?: CockroachArray<any, any>['baseColumn'] },
): Column['baseColumn'] => {
	const baseColumnResult: Column['baseColumn'] = {
		name: baseColumn.name,
		columnType: baseColumn.getSQLType(),
		typeParams: getTypeParams(baseColumn.getSQLType()),
		dataType: baseColumn.dataType.split(' ')[0]!,
		size: (baseColumn as CockroachArray<any, any>).length,
		hasDefault: baseColumn.hasDefault,
		enumValues: baseColumn.enumValues,
		default: baseColumn.default,
		isUnique: baseColumn.isUnique,
		notNull: baseColumn.notNull,
		primary: baseColumn.primary,
		baseColumn: baseColumn.baseColumn === undefined ? undefined : getAllBaseColumns(baseColumn.baseColumn),
	};

	return baseColumnResult;
};

export const mapCockroachColumns = (
	columns: AnyColumn[],
	dbToTsColumnNamesMap: { [key: string]: string },
): Column[] => {
	const mappedColumns = columns.map((column) => ({
		name: dbToTsColumnNamesMap[column.name] as string,
		columnType: column.getSQLType(),
		typeParams: getTypeParams(column.getSQLType()),
		dataType: column.dataType.split(' ')[0]!,
		size: (column as CockroachArray<any, any>).length,
		hasDefault: column.hasDefault,
		default: column.default,
		enumValues: column.enumValues,
		isUnique: column.isUnique,
		notNull: column.notNull,
		primary: column.primary,
		generatedIdentityType: column.generatedIdentity?.type,
		baseColumn: ((column as CockroachArray<any, any>).baseColumn === undefined)
			? undefined
			: getAllBaseColumns((column as CockroachArray<any, any>).baseColumn),
	}));

	return mappedColumns;
};
