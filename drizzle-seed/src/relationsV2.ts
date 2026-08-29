/* eslint-disable drizzle-internal/require-entity-kind */
import { Column, getTableName, is, Table as DrizzleTableEntity } from 'drizzle-orm';
import { Relation } from 'drizzle-orm/relations';
import type {
	Column as SeedColumn,
	DrizzleTable,
	RelationWithReferences,
	SeedRelations,
	Table,
} from './types/tables.ts';

type Side = { tableName: string; columns: string[] };

type Candidate = {
	source: Side;
	target: Side;
	relationType: 'one' | 'many';
	printName: string;
};

type Keyness = 'pk' | 'unique' | 'none';

const sameColumns = (columns1: string[], columns2: string[]) =>
	columns1.length === columns2.length && columns1.every((column) => columns2.includes(column));

const linkKey = (side1: Side, side2: Side) =>
	side1.columns
		.map((column, idx) => {
			const end1 = `${side1.tableName}.${column}`;
			const end2 = `${side2.tableName}.${side2.columns[idx] ?? ''}`;
			return end1 < end2 ? `${end1}~${end2}` : `${end2}~${end1}`;
		})
		.sort()
		.join('|');

export const transformFromDrizzleRelationsV2 = (
	{
		relationsConfig,
		drizzleTables,
		tables,
		getDbToTsColumnNamesMap,
		tableRelations,
		knownRelations,
	}: {
		relationsConfig: SeedRelations;
		drizzleTables: { [tsTableName: string]: DrizzleTable };
		tables: Table[];
		getDbToTsColumnNamesMap: (table: DrizzleTable) => { [dbColName: string]: string };
		tableRelations: { [tableName: string]: RelationWithReferences[] };
		knownRelations: RelationWithReferences[];
	},
) => {
	const tableByName: { [tsTableName: string]: Table } = Object.fromEntries(
		tables.map((table) => [table.name, table]),
	);

	const tsNameByTableObject = new Map<unknown, string>();
	const tsNameByDbName: { [dbTableName: string]: string } = {};
	for (const [tsTableName, table] of Object.entries(drizzleTables)) {
		tsNameByTableObject.set(table, tsTableName);
		tsNameByDbName[getTableName(table)] = tsTableName;
	}

	const resolveTableName = (entry: unknown) => {
		if (entry === undefined || entry === null) return;

		const byObject = tsNameByTableObject.get(entry);
		if (byObject !== undefined) return byObject;

		if (!is(entry, DrizzleTableEntity)) return;
		return tsNameByDbName[getTableName(entry)];
	};

	const resolveColumnNames = (tsTableName: string, columns: unknown[] | undefined) => {
		if (columns === undefined || columns.length === 0) return;

		const dbToTsColumnNamesMap = getDbToTsColumnNamesMap(drizzleTables[tsTableName]!);
		const columnNames: string[] = [];
		for (const column of columns) {
			// a relation may be defined over a sql expression of a view, which has no column to seed
			if (!is(column, Column)) return;

			const tsColumnName = dbToTsColumnNamesMap[column.name];
			if (tsColumnName === undefined) return;

			columnNames.push(tsColumnName);
		}

		return columnNames;
	};

	const seedColumnsOf = (side: Side) => {
		const table = tableByName[side.tableName];

		return side.columns.map((columnName) => table?.columns.find((column) => column.name === columnName));
	};

	const keynessOf = (side: Side): Keyness => {
		const table = tableByName[side.tableName];
		if (table === undefined) return 'none';

		const primaryKeyColumnSets = [...table.compositePrimaryKeys];
		if (table.primaryKeys.length !== 0) primaryKeyColumnSets.push(table.primaryKeys);

		if (primaryKeyColumnSets.some((columns) => sameColumns(columns, side.columns))) return 'pk';
		if (table.uniqueConstraints.some((columns) => sameColumns(columns, side.columns))) return 'unique';

		const columns = seedColumnsOf(side);
		if (columns.length === 1 && columns[0]?.isUnique === true) return 'unique';

		return 'none';
	};

	const isEveryColumnGenerated = (side: Side) =>
		seedColumnsOf(side).every((column): column is SeedColumn =>
			column !== undefined && (column.hasDefault === true || column.generatedIdentityType !== undefined)
		);

	const hasNullableColumn = (side: Side) =>
		seedColumnsOf(side).some((column) => column === undefined || column.notNull === false);

	const dependsOn = (from: string, to: string) => {
		const visited = new Set<string>();
		const queue = [from];

		while (queue.length !== 0) {
			const tableName = queue.pop()!;
			if (tableName === to) return true;
			if (visited.has(tableName)) continue;
			visited.add(tableName);

			for (const relation of tableRelations[tableName] ?? []) {
				if (relation.refTable !== tableName) queue.push(relation.refTable);
			}
		}

		return false;
	};

	const knownEdgeKeys = new Set(
		knownRelations.map((relation) =>
			linkKey(
				{ tableName: relation.table, columns: relation.columns },
				{ tableName: relation.refTable, columns: relation.refColumns },
			)
		),
	);

	const claimedColumns = new Set(
		knownRelations.flatMap((relation) => relation.columns.map((column) => `${relation.table}.${column}`)),
	);

	const relations: RelationWithReferences[] = [];

	const addRelation = (edge: { table: string; columns: string[]; refTable: string; refColumns: string[] }) => {
		if (edge.table === edge.refTable && sameColumns(edge.columns, edge.refColumns)) return;

		const key = linkKey(
			{ tableName: edge.table, columns: edge.columns },
			{ tableName: edge.refTable, columns: edge.refColumns },
		);
		if (knownEdgeKeys.has(key)) return;

		if (edge.columns.some((column) => claimedColumns.has(`${edge.table}.${column}`))) {
			// console.warn(
			// 	`Columns ${edge.columns.map((column) => `'${column}'`).join(', ')} of the '${edge.table}' table are already`
			// 		+ ` filled from another relation, so the relation to the '${edge.refTable}' table is ignored.`,
			// );
			return;
		}

		knownEdgeKeys.add(key);
		for (const column of edge.columns) claimedColumns.add(`${edge.table}.${column}`);

		if (tableRelations[edge.refTable] === undefined) tableRelations[edge.refTable] = [];
		if (tableRelations[edge.table] === undefined) tableRelations[edge.table] = [];

		const relation: RelationWithReferences = {
			...edge,
			refTableRels: tableRelations[edge.refTable]!,
			type: 'one',
		};

		relations.push(relation);
		tableRelations[edge.table]!.push(relation);
	};

	const candidates: Candidate[] = [];

	for (const tableConfig of Object.values(relationsConfig)) {
		if (tableConfig?.relations === undefined) continue;

		for (const drizzleRel of Object.values(tableConfig.relations)) {
			if (!is(drizzleRel, Relation)) continue;

			const sourceTableName = resolveTableName(drizzleRel.sourceTable);
			const targetTableName = resolveTableName(drizzleRel.targetTable);
			if (drizzleRel.throughTable !== undefined && drizzleRel.through !== undefined) {
				const throughTableName = resolveTableName(drizzleRel.throughTable);
				if (throughTableName === undefined) continue;

				for (
					const [junctionColumns, endTableName, endColumns] of [
						[drizzleRel.through.source, sourceTableName, drizzleRel.sourceColumns] as const,
						[drizzleRel.through.target, targetTableName, drizzleRel.targetColumns] as const,
					]
				) {
					if (endTableName === undefined) continue;

					const endColumnNames = resolveColumnNames(endTableName, endColumns);
					const throughColumns = resolveColumnNames(
						throughTableName,
						junctionColumns.map((column) => column?._.column),
					);
					if (
						endColumnNames === undefined || throughColumns === undefined
						|| throughColumns.length !== endColumnNames.length
					) continue;

					addRelation({
						table: throughTableName,
						columns: throughColumns,
						refTable: endTableName,
						refColumns: endColumnNames,
					});
				}

				continue;
			}

			if (sourceTableName === undefined || targetTableName === undefined) continue;

			const sourceColumns = resolveColumnNames(sourceTableName, drizzleRel.sourceColumns);
			const targetColumns = resolveColumnNames(targetTableName, drizzleRel.targetColumns);
			if (sourceColumns === undefined || targetColumns === undefined) continue;
			if (sourceColumns.length !== targetColumns.length) continue;

			const source: Side = { tableName: sourceTableName, columns: sourceColumns };
			const target: Side = { tableName: targetTableName, columns: targetColumns };

			candidates.push({
				source,
				target,
				relationType: drizzleRel.relationType,
				printName: `${tableConfig.name}.${drizzleRel.fieldName}`,
			});
		}
	}

	const groups = new Map<string, Candidate[]>();
	for (const candidate of candidates) {
		const key = linkKey(candidate.source, candidate.target);
		const group = groups.get(key);
		if (group === undefined) groups.set(key, [candidate]);
		else group.push(candidate);
	}

	for (const group of groups.values()) {
		const { source, target } = group[0]!;
		if (knownEdgeKeys.has(linkKey(source, target))) continue;

		const sourceKeyness = keynessOf(source);
		const targetKeyness = keynessOf(target);

		const foreignKeyOn = (side: Side, otherSide: Side) =>
			knownRelations.some((relation) =>
				relation.table === side.tableName
				&& relation.refTable === otherSide.tableName
				&& relation.columns.some((column) => side.columns.includes(column))
			);

		let child: Side;
		if (foreignKeyOn(source, target)) child = source;
		else if (foreignKeyOn(target, source)) child = target;
		else if (sourceKeyness !== 'none' && targetKeyness === 'none') child = target;
		else if (targetKeyness !== 'none' && sourceKeyness === 'none') child = source;
		else if (sourceKeyness === 'none' && targetKeyness === 'none') {
			continue;
		} else if (sourceKeyness !== targetKeyness) child = sourceKeyness === 'pk' ? target : source;
		else if (isEveryColumnGenerated(source) !== isEveryColumnGenerated(target)) {
			child = isEveryColumnGenerated(source) ? target : source;
		} else if (hasNullableColumn(source) !== hasNullableColumn(target)) {
			child = hasNullableColumn(source) ? source : target;
		} else if (group.some((candidate) => candidate.relationType === 'many')) {
			const isSameSide = (side: Side, other: Side) =>
				side.tableName === other.tableName && sameColumns(side.columns, other.columns);

			child = group.some((candidate) => candidate.relationType === 'many' && isSameSide(candidate.source, source))
				? target
				: source;
		} else child = source;

		let parent = child === source ? target : source;

		if (
			child.tableName !== parent.tableName
			&& !hasNullableColumn(child)
			&& dependsOn(parent.tableName, child.tableName)
		) {
			if (dependsOn(child.tableName, parent.tableName)) {
				// console.warn(
				// 	`Relation '${group[0]!.printName}' would put '${source.tableName}' and '${target.tableName}' in a`
				// 		+ ` reference cycle, so it is ignored while seeding.`,
				// );
				continue;
			}

			[child, parent] = [parent, child];
		}

		addRelation({
			table: child.tableName,
			columns: child.columns,
			refTable: parent.tableName,
			refColumns: parent.columns,
		});
	}

	return relations;
};

export const getRelationsFromDb = (db: unknown): SeedRelations | undefined => {
	const relations = (db as { _?: { relations?: SeedRelations } } | undefined)?._?.relations;
	if (relations === undefined || Object.keys(relations).length === 0) return undefined;

	return relations;
};
