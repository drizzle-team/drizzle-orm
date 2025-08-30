import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	getTableName,
	is,
	One,
	Relations,
	sql,
} from 'drizzle-orm';
import type { MsSqlDatabase, MsSqlInt, MsSqlSchema } from 'drizzle-orm/mssql-core';
import { getTableConfig, MsSqlTable } from 'drizzle-orm/mssql-core';
import { SeedService } from '../SeedService.ts';
import type { RefinementsType } from '../types/seedService.ts';
import type { Column, RelationWithReferences, Table } from '../types/tables.ts';
import { isRelationCyclic } from '../utils.ts';

type TableRelatedFkConstraintsT = {
	[fkName: string]: {
		fkName: string;
		parentSchema: string;
		parentTable: string;
		referencedSchema: string;
		referencedTable: string;
		parentColumns: string[];
		referencedColumns: string[];
		onDeleteAction: string;
		onUpdateAction: string;
		relation: 'inbound' | 'outbound';
	};
};

type AllFkConstraintsT = {
	[tableIdentifier: string]: TableRelatedFkConstraintsT;
};

// MySql-----------------------------------------------------------------------------------------------------
export const resetMsSql = async (
	db: MsSqlDatabase<any, any>,
	schema: { [key: string]: MsSqlTable },
) => {
	const tablesToTruncate = Object.entries(schema).map(([_tsTableName, table]) => {
		const tableConfig = getTableConfig(table);
		return { dbName: tableConfig.name, dbSchema: tableConfig.schema ?? 'dbo' };
	});

	const allFkConstraints: AllFkConstraintsT = {};

	for (const table of tablesToTruncate) {
		const gatherTableRelatedFkConstraints = `
			DECLARE @objectId INT
  			= OBJECT_ID( QUOTENAME('${table.dbSchema}') + '.' + QUOTENAME('${table.dbName}') );

			SELECT
			    fk.name                             AS fkName,
			    OBJECT_SCHEMA_NAME(fk.parent_object_id)   AS parentSchema,
			    OBJECT_NAME(fk.parent_object_id)         AS parentTable,
			    OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS referencedSchema,
			    OBJECT_NAME(fk.referenced_object_id)       AS referencedTable,
			--     fkc.constraint_column_id       AS Column_Ordinal,
			    pc.name                        AS parentColumn,
			    rc.name                        AS referencedColumn,
			    fk.delete_referential_action_desc AS onDeleteAction,
			    fk.update_referential_action_desc AS onUpdateAction,
			    CASE
			        WHEN fk.parent_object_id     = @objectId THEN 'outbound'  -- your table → another table
			        ELSE 'inbound'                                           -- another table → your table
			    END                                 AS relation
			FROM sys.foreign_keys AS fk
			JOIN sys.foreign_key_columns fkc
			  ON fk.object_id = fkc.constraint_object_id
			JOIN sys.columns             pc
			  ON fkc.parent_object_id   = pc.object_id
			 AND fkc.parent_column_id   = pc.column_id
			JOIN sys.columns             rc
			  ON fkc.referenced_object_id = rc.object_id
			 AND fkc.referenced_column_id = rc.column_id
			WHERE fk.parent_object_id     = @objectId
			   OR fk.referenced_object_id = @objectId
			ORDER BY relation, fkName;
		`;
		const rawRes = await db.execute(sql.raw(gatherTableRelatedFkConstraints));
		const res: {
			fkName: string;
			parentSchema: string;
			parentTable: string;
			referencedSchema: string;
			referencedTable: string;
			parentColumn: string;
			referencedColumn: string;
			onDeleteAction: string;
			onUpdateAction: string;
			relation: 'inbound' | 'outbound';
		}[] = rawRes.recordset;

		const tableRelatedFkConstraints: TableRelatedFkConstraintsT = {};
		for (const fkInfo of res) {
			if (tableRelatedFkConstraints[fkInfo.fkName] === undefined) {
				const { parentColumn: _, referencedColumn: __, ...filteredFkInfo } = fkInfo;
				tableRelatedFkConstraints[fkInfo.fkName] = {
					...filteredFkInfo,
					parentColumns: res.filter(({ fkName }) => fkName === fkInfo.fkName).map(({ parentColumn }) => parentColumn),
					referencedColumns: res.filter(({ fkName }) => fkName === fkInfo.fkName).map(({ referencedColumn }) =>
						referencedColumn
					),
				};
			}
		}

		allFkConstraints[`${table.dbSchema}.${table.dbName}`] = tableRelatedFkConstraints;

		// drop all table related fk constraints
		for (const fkInfo of Object.values(tableRelatedFkConstraints)) {
			const dropFkConstraints =
				`ALTER TABLE [${fkInfo.parentSchema}].[${fkInfo.parentTable}] DROP CONSTRAINT [${fkInfo.fkName}];`;
			await db.execute(sql.raw(dropFkConstraints));
		}

		// truncating
		const truncateTable = `truncate table [${table.dbSchema}].[${table.dbName}];`;
		await db.execute(sql.raw(truncateTable));
	}

	// add all table related fk constraints
	for (const table of tablesToTruncate) {
		const tableRelatedFkConstraints = allFkConstraints[`${table.dbSchema}.${table.dbName}`]!;

		for (const fkInfo of Object.values(tableRelatedFkConstraints)) {
			const addFkConstraints = `
				ALTER TABLE [${fkInfo.parentSchema}].[${fkInfo.parentTable}] 
				ADD CONSTRAINT [${fkInfo.fkName}] 
				FOREIGN KEY(${fkInfo.parentColumns.map((colName) => `[${colName}]`).join(',')})
				REFERENCES [${fkInfo.referencedSchema}].[${fkInfo.referencedTable}] (${
				fkInfo.referencedColumns.map((colName) => `[${colName}]`).join(',')
			})
				ON DELETE ${fkInfo.onDeleteAction.split('_').join(' ')}
				ON UPDATE ${fkInfo.onUpdateAction.split('_').join(' ')};
				`;
			await db.execute(sql.raw(addFkConstraints));
		}
	}
};

export const filterMsSqlTables = (schema: {
	[key: string]:
		| MsSqlTable
		| MsSqlSchema
		| Relations
		| any;
}) => {
	const mssqlSchema = Object.fromEntries(
		Object.entries(schema).filter(
			(keyValue): keyValue is [string, MsSqlTable | Relations] =>
				is(keyValue[1], MsSqlTable) || is(keyValue[1], Relations),
		),
	);

	const mssqlTables = Object.fromEntries(
		Object.entries(schema).filter(
			(keyValue): keyValue is [string, MsSqlTable] => is(keyValue[1], MsSqlTable),
		),
	);

	return { mssqlSchema, mssqlTables };
};

export const seedMsSql = async (
	db: MsSqlDatabase<any, any>,
	schema: {
		[key: string]:
			| MsSqlTable
			| MsSqlSchema
			| Relations
			| any;
	},
	options: { count?: number; seed?: number; version?: number } = {},
	refinements?: RefinementsType,
) => {
	const { mssqlSchema, mssqlTables } = filterMsSqlTables(schema);
	const { tables, relations } = getMsSqlInfo(mssqlSchema, mssqlTables);

	const seedService = new SeedService();

	const generatedTablesGenerators = seedService.generatePossibleGenerators(
		'mssql',
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
		mssqlTables,
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
		mssqlTables,
		{ ...options, tablesValues, updateDataInDb, tablesUniqueNotNullColumn },
	);
};

const getMsSqlInfo = (
	mssqlSchema: { [key: string]: MsSqlTable | Relations },
	mssqlTables: { [key: string]: MsSqlTable },
) => {
	let tableConfig: ReturnType<typeof getTableConfig>;
	let dbToTsColumnNamesMap: { [key: string]: string };

	const dbToTsTableNamesMap: { [key: string]: string } = Object.fromEntries(
		Object.entries(mssqlTables).map(([key, value]) => [getTableName(value), key]),
	);

	const tables: Table[] = [];
	const relations: RelationWithReferences[] = [];
	const dbToTsColumnNamesMapGlobal: {
		[tableName: string]: { [dbColumnName: string]: string };
	} = {};
	const tableRelations: { [tableName: string]: RelationWithReferences[] } = {};

	const getDbToTsColumnNamesMap = (table: MsSqlTable) => {
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
		schema: Record<string, MsSqlTable | Relations>,
		getDbToTsColumnNamesMap: (table: MsSqlTable) => {
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

				const tableConfig = getTableConfig(drizzleRel.sourceTable as MsSqlTable);
				const tableDbSchema = tableConfig.schema ?? 'public';
				const tableDbName = tableConfig.name;
				const tableTsName = schemaConfig.tableNamesMap[`${tableDbSchema}.${tableDbName}`] ?? tableDbName;

				const dbToTsColumnNamesMap = getDbToTsColumnNamesMap(drizzleRel.sourceTable as MsSqlTable);
				const columns = drizzleRel.config?.fields.map((field) => dbToTsColumnNamesMap[field.name] as string)
					?? [];

				const refTableConfig = getTableConfig(drizzleRel.referencedTable as MsSqlTable);
				const refTableDbSchema = refTableConfig.schema ?? 'public';
				const refTableDbName = refTableConfig.name;
				const refTableTsName = schemaConfig.tableNamesMap[`${refTableDbSchema}.${refTableDbName}`]
					?? refTableDbName;

				const dbToTsColumnNamesMapForRefTable = getDbToTsColumnNamesMap(drizzleRel.referencedTable as MsSqlTable);
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

	for (const table of Object.values(mssqlTables)) {
		tableConfig = getTableConfig(table);

		dbToTsColumnNamesMap = {};
		for (const [tsCol, col] of Object.entries(tableConfig.columns[0]!.table)) {
			dbToTsColumnNamesMap[col.name] = tsCol;
		}

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

		// TODO: rewrite
		const getTypeParams = (sqlType: string) => {
			// get type params and set only type
			const typeParams: Column['typeParams'] = {};

			if (
				sqlType.startsWith('decimal')
				|| sqlType.startsWith('real')
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
				identity: (column as MsSqlInt<any>).identity ? true : false,
			})),
			primaryKeys: tableConfig.columns
				.filter((column) => column.primary)
				.map((column) => dbToTsColumnNamesMap[column.name] as string),
		});
	}

	const transformedDrizzleRelations = transformFromDrizzleRelation(
		mssqlSchema,
		getDbToTsColumnNamesMap,
		tableRelations,
	);
	relations.push(
		...transformedDrizzleRelations,
	);

	const modifiedRelations = relations.map(
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

	return { tables, relations: modifiedRelations, tableRelations };
};
