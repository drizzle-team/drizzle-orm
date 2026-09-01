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
import { transformFromDrizzleRelationsV2 } from './relationsV2.ts';
import type {
	Column,
	DrizzleTable,
	RelationWithReferences,
	SeedRelations,
	Table,
	TableConfigT,
} from './types/tables.ts';
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
	relationsV2?: SeedRelations,
) => {
	let tableConfig: ReturnType<typeof getTableConfig>;
	let dbToTsColumnNamesMap: { [key: string]: string };
	const tsTableNames = new Map<DrizzleTable, string>(
		Object.entries(drizzleTables).map(([key, value]) => [value, key]),
	);
	const tsTableNamesByDbName = new Map<string, string | undefined>();
	for (const [key, value] of Object.entries(drizzleTables)) {
		const dbName = getTableName(value);
		tsTableNamesByDbName.set(dbName, tsTableNamesByDbName.has(dbName) ? undefined : key);
	}

	const tsTableNameOf = (table: DrizzleTable | undefined) =>
		table === undefined ? undefined : tsTableNames.get(table) ?? tsTableNamesByDbName.get(getTableName(table));

	const tables: Table[] = [];
	const relations: RelationWithReferences[] = [];
	const dbToTsColumnNamesMapGlobal = new Map<DrizzleTable, { [dbColumnName: string]: string }>();
	const tableRelations: { [tableName: string]: RelationWithReferences[] } = {};

	const getDbToTsColumnNamesMap = (table: DrizzleTable) => {
		const cached = dbToTsColumnNamesMapGlobal.get(table);
		if (cached !== undefined) return cached;

		const dbToTsColumnNamesMap: { [dbColName: string]: string } = {};

		const tableConfig = getTableConfig(table);
		for (const [tsCol, col] of Object.entries(getColumnTable(tableConfig.columns[0]!))) {
			if (is(col, DrizzleColumn)) dbToTsColumnNamesMap[col.name] = tsCol;
		}
		dbToTsColumnNamesMapGlobal.set(table, dbToTsColumnNamesMap);

		return dbToTsColumnNamesMap;
	};

	for (const table of Object.values(drizzleTables)) {
		tableConfig = getTableConfig(table);
		const tsTableName = tsTableNameOf(table) as string;

		dbToTsColumnNamesMap = getDbToTsColumnNamesMap(table);

		const newRelations = tableConfig.foreignKeys === undefined ? [] : tableConfig.foreignKeys.map((fk) => {
			const table = tsTableName;
			const refTable = tsTableNameOf(fk.reference().foreignTable as DrizzleTable) as string;

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

		if (tableRelations[tsTableName] === undefined) {
			tableRelations[tsTableName] = [];
		}
		tableRelations[tsTableName]!.push(...newRelations);

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
			name: tsTableName,
			uniqueConstraints,
			primaryKeys: tableConfig.columns
				.filter((column) => column.primary)
				.map((column) => dbToTsColumnNamesMap[column.name] as string),
			compositePrimaryKeys: (tableConfig.primaryKeys ?? []).map((primaryKey) =>
				primaryKey.columns.map((column) => dbToTsColumnNamesMap[column.name] as string)
			),
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

	if (relationsV2 !== undefined) {
		relations.push(
			...transformFromDrizzleRelationsV2({
				relationsConfig: relationsV2,
				drizzleTables,
				tables,
				getDbToTsColumnNamesMap,
				tableRelations,
				knownRelations: relations,
			}),
		);
	}

	const isCyclicRelations = relations.map(
		(relI) => {
			const sameLink = (relJ: RelationWithReferences) =>
				relJ.refTable === relI.refTable
				&& relJ.columns.length === relI.columns.length
				&& relJ.columns.every((column, idx) => column === relI.columns[idx]);
			const tableRel = tableRelations[relI.table]?.find(sameLink)
				?? tableRelations[relI.table]?.find((relJ) => relJ.refTable === relI.refTable);

			const isCyclic = isRelationCyclic(relI);
			if (tableRel !== undefined) tableRel['isCyclic'] = isCyclic;
			return { ...relI, isCyclic };
		},
	);

	return { tables, relations: isCyclicRelations, tableRelations };
};
