import { type AnyColumn, is, sql } from 'drizzle-orm';
import { Relations } from 'drizzle-orm/_relations';
import type { PgAsyncDatabase, PgColumn, PgSchema } from 'drizzle-orm/pg-core';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { getSchemaInfo } from '../common.ts';
import { SeedService } from '../SeedService.ts';
import type { RefinementsType } from '../types/seedService.ts';
import type { Column } from '../types/tables.ts';

// Postgres-----------------------------------------------------------------------------------------------------------
export const resetPostgres = async (
	db: PgAsyncDatabase<any, any>,
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
	db: PgAsyncDatabase<any, any>,
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

	const { tables, relations } = getSchemaInfo(pgSchema, pgTables, mapPgColumns);
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

const getTypeParams = (sqlType: string) => {
	// get type params
	const typeParams: Column['typeParams'] = {};

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

export const mapPgColumns = (
	columns: AnyColumn[],
	dbToTsColumnNamesMap: { [key: string]: string },
): Column[] => {
	return columns.map((column) => {
		const pgCol = column as PgColumn;
		const sqlType = column.getSQLType();

		return {
			name: dbToTsColumnNamesMap[column.name] as string,
			columnType: sqlType,
			typeParams: { ...getTypeParams(sqlType), dimensions: pgCol.dimensions },
			dataType: column.dataType.split(' ')[0]!,
			size: undefined, // we no longer support length for arrays
			hasDefault: column.hasDefault,
			default: column.default,
			enumValues: column.enumValues,
			isUnique: column.isUnique,
			notNull: column.notNull,
			primary: column.primary,
			generatedIdentityType: column.generatedIdentity?.type,
		} satisfies Column;
	});
};

// const t = pgTable('a', { id: point('id', {mode: "xy"}).array() });
// const config = getTableConfig(t);

// const columns = mapPgColumns(config.columns, {});
// console.log(columns)
// const gen = selectGeneratorForPostgresColumn(columns[0]!, false);
// gen.init({ count: 10, seed: 0 });

// console.log(gen.generate({ i: 0 }));
