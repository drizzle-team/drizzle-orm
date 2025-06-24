import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	getTableName,
	is,
	One,
	Relations,
	sql,
} from 'drizzle-orm';
import type { CockroachArray, CockroachDatabase, CockroachSchema } from 'drizzle-orm/cockroach-core';
import { CockroachTable, getTableConfig } from 'drizzle-orm/cockroach-core';
import { SeedService } from '../SeedService.ts';
import type { RefinementsType } from '../types/seedService.ts';
import type { Column, RelationWithReferences, Table } from '../types/tables.ts';
import { isRelationCyclic } from '../utils.ts';

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

	const { tables, relations } = getCockroachInfo(cockroachSchema, cockroachTables);
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

const getCockroachInfo = (
	cockroachSchema: { [key: string]: CockroachTable | Relations },
	cockroachTables: { [key: string]: CockroachTable },
) => {
	let tableConfig: ReturnType<typeof getTableConfig>;
	let dbToTsColumnNamesMap: { [key: string]: string };
	const dbToTsTableNamesMap: { [key: string]: string } = Object.fromEntries(
		Object.entries(cockroachTables).map(([key, value]) => [getTableName(value), key]),
	);

	const tables: Table[] = [];
	const relations: RelationWithReferences[] = [];
	const dbToTsColumnNamesMapGlobal: {
		[tableName: string]: { [dbColumnName: string]: string };
	} = {};
	const tableRelations: { [tableName: string]: RelationWithReferences[] } = {};

	const getDbToTsColumnNamesMap = (table: CockroachTable) => {
		let dbToTsColumnNamesMap: { [dbColName: string]: string } = {};

		const tableName = getTableName(table);
		if (Object.hasOwn(dbToTsColumnNamesMapGlobal, tableName)) {
			dbToTsColumnNamesMap = dbToTsColumnNamesMapGlobal[tableName]!;
			return dbToTsColumnNamesMap;
		}

		const tableConfig = getTableConfig(table);
		for (const [tsCol, col] of Object.entries(tableConfig.columns[0]!.table)) {
			dbToTsColumnNamesMap[col.name] = tsCol;
		}
		dbToTsColumnNamesMapGlobal[tableName] = dbToTsColumnNamesMap;

		return dbToTsColumnNamesMap;
	};

	const transformFromDrizzleRelation = (
		schema: Record<string, CockroachTable | Relations>,
		getDbToTsColumnNamesMap: (table: CockroachTable) => {
			[dbColName: string]: string;
		},
		tableRelations: {
			[tableName: string]: RelationWithReferences[];
		},
	) => {
		const schemaConfig = extractTablesRelationalConfig(schema, createTableRelationsHelpers);
		const relations: RelationWithReferences[] = [];
		for (const table of Object.values(schemaConfig.tables)) {
			if (table.relations === undefined) continue;

			for (const drizzleRel of Object.values(table.relations)) {
				if (!is(drizzleRel, One)) continue;

				const tableConfig = getTableConfig(drizzleRel.sourceTable as CockroachTable);
				const tableDbSchema = tableConfig.schema ?? 'public';
				const tableDbName = tableConfig.name;
				const tableTsName = schemaConfig.tableNamesMap[`${tableDbSchema}.${tableDbName}`] ?? tableDbName;

				const dbToTsColumnNamesMap = getDbToTsColumnNamesMap(drizzleRel.sourceTable);
				const columns = drizzleRel.config?.fields.map((field) => dbToTsColumnNamesMap[field.name] as string)
					?? [];

				const refTableConfig = getTableConfig(drizzleRel.referencedTable as CockroachTable);
				const refTableDbSchema = refTableConfig.schema ?? 'public';
				const refTableDbName = refTableConfig.name;
				const refTableTsName = schemaConfig.tableNamesMap[`${refTableDbSchema}.${refTableDbName}`]
					?? refTableDbName;

				const dbToTsColumnNamesMapForRefTable = getDbToTsColumnNamesMap(drizzleRel.referencedTable);
				const refColumns = drizzleRel.config?.references.map((ref) =>
					dbToTsColumnNamesMapForRefTable[ref.name] as string
				)
					?? [];

				if (tableRelations[refTableTsName] === undefined) {
					tableRelations[refTableTsName] = [];
				}

				const relation: RelationWithReferences = {
					table: tableTsName,
					columns,
					refTable: refTableTsName,
					refColumns,
					refTableRels: tableRelations[refTableTsName],
					type: 'one',
				};

				// do not add duplicate relation
				if (
					tableRelations[tableTsName]?.some((rel) =>
						rel.table === relation.table
						&& rel.refTable === relation.refTable
					)
				) {
					console.warn(
						`You are providing a one-to-many relation between the '${relation.refTable}' and '${relation.table}' tables,\n`
							+ `while the '${relation.table}' table object already has foreign key constraint in the schema referencing '${relation.refTable}' table.\n`
							+ `In this case, the foreign key constraint will be used.\n`,
					);
					continue;
				}

				relations.push(relation);
				tableRelations[tableTsName]!.push(relation);
			}
		}
		return relations;
	};

	for (const table of Object.values(cockroachTables)) {
		tableConfig = getTableConfig(table);

		dbToTsColumnNamesMap = {};
		for (const [tsCol, col] of Object.entries(tableConfig.columns[0]!.table)) {
			dbToTsColumnNamesMap[col.name] = tsCol;
		}

		// might be empty list
		const newRelations = tableConfig.foreignKeys.map((fk) => {
			const table = dbToTsTableNamesMap[tableConfig.name] as string;
			const refTable = dbToTsTableNamesMap[getTableName(fk.reference().foreignTable)] as string;

			const dbToTsColumnNamesMapForRefTable = getDbToTsColumnNamesMap(
				fk.reference().foreignTable,
			);

			if (tableRelations[refTable] === undefined) {
				tableRelations[refTable] = [];
			}
			return {
				table,
				columns: fk
					.reference()
					.columns.map((col) => dbToTsColumnNamesMap[col.name] as string),
				refTable,
				refColumns: fk
					.reference()
					.foreignColumns.map(
						(fCol) => dbToTsColumnNamesMapForRefTable[fCol.name] as string,
					),
				refTableRels: tableRelations[refTable],
			};
		});

		relations.push(
			...newRelations,
		);

		if (tableRelations[dbToTsTableNamesMap[tableConfig.name] as string] === undefined) {
			tableRelations[dbToTsTableNamesMap[tableConfig.name] as string] = [];
		}
		tableRelations[dbToTsTableNamesMap[tableConfig.name] as string]!.push(...newRelations);

		const getAllBaseColumns = (
			baseColumn: CockroachArray<any, any>['baseColumn'] & { baseColumn?: CockroachArray<any, any>['baseColumn'] },
		): Column['baseColumn'] => {
			const baseColumnResult: Column['baseColumn'] = {
				name: baseColumn.name,
				columnType: baseColumn.getSQLType(),
				typeParams: getTypeParams(baseColumn.getSQLType()),
				dataType: baseColumn.dataType,
				size: (baseColumn as CockroachArray<any, any>).size,
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
				|| sqlType.startsWith('char')
				|| sqlType.startsWith('bit')
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

		// console.log(tableConfig.columns);
		tables.push({
			name: dbToTsTableNamesMap[tableConfig.name] as string,
			columns: tableConfig.columns.map((column) => ({
				name: dbToTsColumnNamesMap[column.name] as string,
				columnType: column.getSQLType(),
				typeParams: getTypeParams(column.getSQLType()),
				dataType: column.dataType,
				size: (column as CockroachArray<any, any>).size,
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
			})),
			primaryKeys: tableConfig.columns
				.filter((column) => column.primary)
				.map((column) => dbToTsColumnNamesMap[column.name] as string),
		});
	}

	const transformedDrizzleRelations = transformFromDrizzleRelation(
		cockroachSchema,
		getDbToTsColumnNamesMap,
		tableRelations,
	);
	relations.push(
		...transformedDrizzleRelations,
	);

	const isCyclicRelations = relations.map(
		(relI) => {
			// if (relations.some((relj) => relI.table === relj.refTable && relI.refTable === relj.table)) {
			const tableRel = tableRelations[relI.table]!.find((relJ) => relJ.refTable === relI.refTable)!;
			if (isRelationCyclic(relI)) {
				tableRel['isCyclic'] = true;
				return { ...relI, isCyclic: true };
			}
			tableRel['isCyclic'] = false;
			return { ...relI, isCyclic: false };
		},
	);

	return { tables, relations: isCyclicRelations, tableRelations };
};
