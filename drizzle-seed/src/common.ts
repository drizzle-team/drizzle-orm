import { type AnyColumn, Column as DrizzleColumn, getColumnTable, getTableName, is } from 'drizzle-orm';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	One,
	type Relations,
} from 'drizzle-orm/_relations';
import { CockroachTable, getTableConfig as getCockroachTableConfig } from 'drizzle-orm/cockroach-core';
import { getTableConfig as getMsSqlTableConfig, MsSqlTable } from 'drizzle-orm/mssql-core';
import { getTableConfig as getMySqlTableConfig, MySqlTable } from 'drizzle-orm/mysql-core';
import { getTableConfig as getPgTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { getTableConfig as getSingleStoreTableConfig } from 'drizzle-orm/singlestore-core';
import { getTableConfig as getSQLiteTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { Column, DrizzleTable, RelationWithReferences, Table, TableConfigT } from './types/tables.ts';
import { isRelationCyclic } from './utils.ts';

const getTableConfig = (
	table: DrizzleTable,
): TableConfigT => {
	if (is(table, PgTable)) return getPgTableConfig(table);
	else if (is(table, MySqlTable)) return getMySqlTableConfig(table);
	else if (is(table, SQLiteTable)) return getSQLiteTableConfig(table);
	else if (is(table, CockroachTable)) return getCockroachTableConfig(table);
	else if (is(table, MsSqlTable)) return getMsSqlTableConfig(table);
	else return getSingleStoreTableConfig(table); // if (is(table, SingleStoreTable))
};

const transformFromDrizzleRelation = (
	schema: Record<string, DrizzleTable | Relations>,
	getDbToTsColumnNamesMap: (table: DrizzleTable) => {
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

			const tableConfig = getTableConfig(drizzleRel.sourceTable as DrizzleTable);
			const tableDbSchema = tableConfig.schema ?? 'public';
			const tableDbName = tableConfig.name;
			const tableTsName = schemaConfig.tableNamesMap[`${tableDbSchema}.${tableDbName}`] ?? tableDbName;

			const dbToTsColumnNamesMap = getDbToTsColumnNamesMap(drizzleRel.sourceTable);
			const columns = drizzleRel.config?.fields.map((field) => dbToTsColumnNamesMap[field.name] as string)
				?? [];

			const refTableConfig = getTableConfig(drizzleRel.referencedTable as DrizzleTable);
			const refTableDbSchema = refTableConfig.schema ?? 'public';
			const refTableDbName = refTableConfig.name;
			const refTableTsName = schemaConfig.tableNamesMap[`${refTableDbSchema}.${refTableDbName}`]
				?? refTableDbName;

			const dbToTsColumnNamesMapForRefTable = getDbToTsColumnNamesMap(drizzleRel.referencedTable);
			const refColumns = drizzleRel.config?.references.map((ref) => dbToTsColumnNamesMapForRefTable[ref.name] as string)
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

export const getSchemaInfo = (
	drizzleTablesAndRelations: { [key: string]: DrizzleTable | Relations },
	drizzleTables: { [key: string]: DrizzleTable },
	mapColumns: (
		tableConfig: AnyColumn[],
		dbToTsColumnNamesMap: { [key: string]: string },
	) => Column[],
) => {
	let tableConfig: ReturnType<typeof getTableConfig>;
	let dbToTsColumnNamesMap: { [key: string]: string };
	const dbToTsTableNamesMap: { [key: string]: string } = Object.fromEntries(
		Object.entries(drizzleTables).map(([key, value]) => [getTableName(value), key]),
	);

	const tables: Table[] = [];
	const relations: RelationWithReferences[] = [];
	const dbToTsColumnNamesMapGlobal: {
		[tableName: string]: { [dbColumnName: string]: string };
	} = {};
	const tableRelations: { [tableName: string]: RelationWithReferences[] } = {};

	const getDbToTsColumnNamesMap = (table: DrizzleTable) => {
		let dbToTsColumnNamesMap: { [dbColName: string]: string } = {};

		const tableName = getTableName(table);
		if (Object.hasOwn(dbToTsColumnNamesMapGlobal, tableName)) {
			dbToTsColumnNamesMap = dbToTsColumnNamesMapGlobal[tableName]!;
			return dbToTsColumnNamesMap;
		}

		const tableConfig = getTableConfig(table);
		for (const [tsCol, col] of Object.entries(getColumnTable(tableConfig.columns[0]!))) {
			if (is(col, DrizzleColumn)) dbToTsColumnNamesMap[col.name] = tsCol;
		}
		dbToTsColumnNamesMapGlobal[tableName] = dbToTsColumnNamesMap;

		return dbToTsColumnNamesMap;
	};

	for (const table of Object.values(drizzleTables)) {
		tableConfig = getTableConfig(table);

		dbToTsColumnNamesMap = getDbToTsColumnNamesMap(table);

		// might be empty list
		const newRelations = tableConfig.foreignKeys === undefined ? [] : tableConfig.foreignKeys.map((fk) => {
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

		const stringsSet: string[] = [];
		const uniqueConstraints: string[][] = [];
		for (const uniCon of tableConfig.uniqueConstraints) {
			const uniConColumns = uniCon.columns.map((col) => dbToTsColumnNamesMap[col.name] as string);
			const uniConColumnsStr = JSON.stringify(uniConColumns);

			if (!stringsSet.includes(uniConColumnsStr)) {
				stringsSet.push(uniConColumnsStr);
				uniqueConstraints.push(uniConColumns);
			}
		}

		const mappedTable: Table = {
			name: dbToTsTableNamesMap[tableConfig.name] as string,
			uniqueConstraints,
			primaryKeys: tableConfig.columns
				.filter((column) => column.primary)
				.map((column) => dbToTsColumnNamesMap[column.name] as string),
			columns: mapColumns(tableConfig.columns, dbToTsColumnNamesMap),
		};
		tables.push(mappedTable);
	}

	const transformedDrizzleRelations = transformFromDrizzleRelation(
		drizzleTablesAndRelations,
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
