import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	getTableName,
	is,
	One,
	Relations,
	sql,
} from 'drizzle-orm';
import type { SingleStoreDatabase, SingleStoreSchema } from 'drizzle-orm/singlestore-core';
import { getTableConfig, SingleStoreTable } from 'drizzle-orm/singlestore-core';
import { SeedService } from '../SeedService.ts';
import type { RefinementsType } from '../types/seedService.ts';
import type { Column, RelationWithReferences, Table } from '../types/tables.ts';
import { isRelationCyclic } from '../utils.ts';

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
	const { tables, relations } = getSingleStoreInfo(singleStoreSchema, singleStoreTables);

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

const getSingleStoreInfo = (
	singleStoreSchema: { [key: string]: SingleStoreTable | Relations },
	singleStoreTables: { [key: string]: SingleStoreTable },
) => {
	let tableConfig: ReturnType<typeof getTableConfig>;
	let dbToTsColumnNamesMap: { [key: string]: string };

	const dbToTsTableNamesMap: { [key: string]: string } = Object.fromEntries(
		Object.entries(singleStoreTables).map(([key, value]) => [getTableName(value), key]),
	);

	const tables: Table[] = [];
	const relations: RelationWithReferences[] = [];
	const dbToTsColumnNamesMapGlobal: {
		[tableName: string]: { [dbColumnName: string]: string };
	} = {};
	const tableRelations: { [tableName: string]: RelationWithReferences[] } = {};

	const getDbToTsColumnNamesMap = (table: SingleStoreTable) => {
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
		schema: Record<string, SingleStoreTable | Relations>,
		getDbToTsColumnNamesMap: (table: SingleStoreTable) => {
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

				const tableConfig = getTableConfig(drizzleRel.sourceTable as SingleStoreTable);
				const tableDbSchema = tableConfig.schema ?? 'public';
				const tableDbName = tableConfig.name;
				const tableTsName = schemaConfig.tableNamesMap[`${tableDbSchema}.${tableDbName}`] ?? tableDbName;

				const dbToTsColumnNamesMap = getDbToTsColumnNamesMap(drizzleRel.sourceTable as SingleStoreTable);
				const columns = drizzleRel.config?.fields.map((field) => dbToTsColumnNamesMap[field.name] as string)
					?? [];

				const refTableConfig = getTableConfig(drizzleRel.referencedTable as SingleStoreTable);
				const refTableDbSchema = refTableConfig.schema ?? 'public';
				const refTableDbName = refTableConfig.name;
				const refTableTsName = schemaConfig.tableNamesMap[`${refTableDbSchema}.${refTableDbName}`]
					?? refTableDbName;

				const dbToTsColumnNamesMapForRefTable = getDbToTsColumnNamesMap(drizzleRel.referencedTable as SingleStoreTable);
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

	for (const table of Object.values(singleStoreTables)) {
		tableConfig = getTableConfig(table);

		dbToTsColumnNamesMap = {};
		for (const [tsCol, col] of Object.entries(tableConfig.columns[0]!.table)) {
			dbToTsColumnNamesMap[col.name] = tsCol;
		}

		// const newRelations = tableConfig.foreignKeys.map((fk) => {
		// 	const table = dbToTsTableNamesMap[tableConfig.name] as string;
		// 	const refTable = dbToTsTableNamesMap[getTableName(fk.reference().foreignTable)] as string;
		// 	const dbToTsColumnNamesMapForRefTable = getDbToTsColumnNamesMap(
		// 		fk.reference().foreignTable,
		// 	);

		// 	if (tableRelations[refTable] === undefined) {
		// 		tableRelations[refTable] = [];
		// 	}
		// 	return {
		// 		table,
		// 		columns: fk
		// 			.reference()
		// 			.columns.map((col) => dbToTsColumnNamesMap[col.name] as string),
		// 		refTable,
		// 		refColumns: fk
		// 			.reference()
		// 			.foreignColumns.map(
		// 				(fCol) => dbToTsColumnNamesMapForRefTable[fCol.name] as string,
		// 			),
		// 		refTableRels: tableRelations[refTable],
		// 	};
		// });
		// relations.push(
		// 	...newRelations,
		// );

		if (tableRelations[dbToTsTableNamesMap[tableConfig.name] as string] === undefined) {
			tableRelations[dbToTsTableNamesMap[tableConfig.name] as string] = [];
		}
		// tableRelations[dbToTsTableNamesMap[tableConfig.name] as string]!.push(...newRelations);

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
			} else if (sqlType.startsWith('vector')) {
				const match = sqlType.match(/\((\d+),? ?((F|I)\d{1,2})?\)/);
				if (match) {
					typeParams['length'] = Number(match[1]);
					typeParams['vectorValueType'] = match[2] as typeof typeParams['vectorValueType'];
				}
			}

			return typeParams;
		};

		tables.push({
			name: dbToTsTableNamesMap[tableConfig.name] as string,
			columns: tableConfig.columns.map((column) => ({
				name: dbToTsColumnNamesMap[column.name] as string,
				columnType: column.getSQLType(),
				typeParams: getTypeParams(column.getSQLType()),
				dataType: column.dataType,
				hasDefault: column.hasDefault,
				default: column.default,
				enumValues: column.enumValues,
				isUnique: column.isUnique,
				notNull: column.notNull,
				primary: column.primary,
			})),
			primaryKeys: tableConfig.columns
				.filter((column) => column.primary)
				.map((column) => dbToTsColumnNamesMap[column.name] as string),
		});
	}

	const transformedDrizzleRelations = transformFromDrizzleRelation(
		singleStoreSchema,
		getDbToTsColumnNamesMap,
		tableRelations,
	);
	relations.push(
		...transformedDrizzleRelations,
	);

	const isCyclicRelations = relations.map(
		(relI) => {
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
