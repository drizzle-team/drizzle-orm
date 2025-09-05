import { is, sql } from 'drizzle-orm';
import { Relations } from 'drizzle-orm/_relations';
import type { PgArray, PgDatabase, PgSchema } from 'drizzle-orm/pg-core';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { getSchemaInfo } from '../common.ts';
import { SeedService } from '../SeedService.ts';
import type { RefinementsType } from '../types/seedService.ts';
import type { Column, Table, TableConfigT } from '../types/tables.ts';

// Postgres-----------------------------------------------------------------------------------------------------------
export const resetPostgres = async (
	db: PgDatabase<any, any>,
	pgTables: { [key: string]: PgTable },
) => {
	const tablesToTruncate = Object.entries(pgTables).map(([_, table]) => {
		const config = getTableConfig(table);
		config.schema = config.schema === undefined ? 'public' : config.schema;

		return `"${config.schema}"."${config.name}"`;
	});

	await db.execute(sql.raw(`truncate ${tablesToTruncate.join(',')} cascade;`));
};

export const filterPgSchema = (schema: {
	[key: string]:
		| PgTable
		| PgSchema
		| Relations
		| any;
}) => {
	const pgSchema = Object.fromEntries(
		Object.entries(schema).filter((keyValue): keyValue is [string, PgTable | Relations] =>
			is(keyValue[1], PgTable) || is(keyValue[1], Relations)
		),
	);

	const pgTables = Object.fromEntries(
		Object.entries(schema).filter((keyValue): keyValue is [string, PgTable] => is(keyValue[1], PgTable)),
	);

	return { pgSchema, pgTables };
};

export const seedPostgres = async (
	db: PgDatabase<any, any>,
	schema: {
		[key: string]:
			| PgTable
			| PgSchema
			| Relations
			| any;
	},
	options: { count?: number; seed?: number; version?: number } = {},
	refinements?: RefinementsType,
) => {
	const seedService = new SeedService();

	const { pgSchema, pgTables } = filterPgSchema(schema);

	const { tables, relations } = getSchemaInfo(pgSchema, pgTables, mapPgTable);
	// const { tables, relations } = getPostgresInfo(pgSchema, pgTables);
	const generatedTablesGenerators = seedService.generatePossibleGenerators(
		'postgresql',
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
		pgTables,
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
		pgTables,
		{ ...options, tablesValues, updateDataInDb, tablesUniqueNotNullColumn },
	);
};

export const mapPgTable = (
	tableConfig: TableConfigT,
	dbToTsTableNamesMap: { [key: string]: string },
	dbToTsColumnNamesMap: { [key: string]: string },
): Table => {
	const getAllBaseColumns = (
		baseColumn: PgArray<any, any>['baseColumn'] & { baseColumn?: PgArray<any, any>['baseColumn'] },
	): Column['baseColumn'] => {
		const baseColumnResult: Column['baseColumn'] = {
			name: baseColumn.name,
			columnType: baseColumn.getSQLType(),
			typeParams: getTypeParams(baseColumn.getSQLType()),
			dataType: baseColumn.dataType,
			size: (baseColumn as PgArray<any, any>).length,
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
			|| sqlType.startsWith('bpchar')
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

	return {
		name: dbToTsTableNamesMap[tableConfig.name] as string,
		columns: tableConfig.columns.map((column) => ({
			name: dbToTsColumnNamesMap[column.name] as string,
			columnType: column.getSQLType(),
			typeParams: getTypeParams(column.getSQLType()),
			dataType: column.dataType,
			size: (column as PgArray<any, any>).length,
			hasDefault: column.hasDefault,
			default: column.default,
			enumValues: column.enumValues,
			isUnique: column.isUnique,
			notNull: column.notNull,
			primary: column.primary,
			generatedIdentityType: column.generatedIdentity?.type,
			baseColumn: ((column as PgArray<any, any>).baseColumn === undefined)
				? undefined
				: getAllBaseColumns((column as PgArray<any, any>).baseColumn),
		})),
		primaryKeys: tableConfig.columns
			.filter((column) => column.primary)
			.map((column) => dbToTsColumnNamesMap[column.name] as string),
	};
};
