import { mockResolver } from 'src/utils/mocks';
import { prepareMigrationRenames } from '../../utils';
import type { Resolver } from '../common';
import { diff } from '../dialect';
import { groupDiffs, preserveEntityNames } from '../utils';
import { fromJson } from './convertor';
import type { Column, IndexColumn, SQLiteDDL, SqliteEntities } from './ddl';
import { tableFromDDL } from './ddl';
import { defaultsCommutative } from './grammar';
import type { JsonCreateViewStatement, JsonDropViewStatement, JsonStatement } from './statements';
import { prepareAddColumns, prepareRecreateColumn, prepareStatement } from './statements';

export const ddlDiffDry = async (left: SQLiteDDL, right: SQLiteDDL, mode: 'push' | 'default') => {
	const empty = new Set<string>();
	return ddlDiff(left, right, mockResolver(empty), mockResolver(empty), mode);
};

export const ddlDiff = async (
	ddl1: SQLiteDDL,
	ddl2: SQLiteDDL,
	tablesResolver: Resolver<SqliteEntities['tables']>,
	columnsResolver: Resolver<Column>,
	mode: 'push' | 'default',
): Promise<{
	statements: JsonStatement[];
	sqlStatements: string[];
	groupedStatements: {
		jsonStatement: JsonStatement;
		sqlStatements: string[];
	}[];
	renames: string[];
	warnings: string[];
}> => {
	const tablesDiff = diff(ddl1, ddl2, 'tables');

	const {
		created: createdTables,
		deleted: deletedTables,
		renamedOrMoved: renamedTables,
	} = await tablesResolver({
		created: tablesDiff.filter((it) => it.$diffType === 'create'),
		deleted: tablesDiff.filter((it) => it.$diffType === 'drop'),
	});

	for (const renamed of renamedTables) {
		ddl1.tables.update({
			set: {
				name: renamed.to.name,
			},
			where: {
				name: renamed.from.name,
			},
		});

		ddl1.fks.update({
			set: {
				tableTo: renamed.to.name,
			},
			where: {
				tableTo: renamed.from.name,
			},
		});
		ddl2.fks.update({
			set: {
				tableTo: renamed.to.name,
			},
			where: {
				tableTo: renamed.from.name,
			},
		});
		ddl1.fks.update({
			set: {
				table: renamed.to.name,
			},
			where: {
				table: renamed.from.name,
			},
		});

		ddl1.entities.update({
			set: {
				table: renamed.to.name,
			},
			where: {
				table: renamed.from.name,
			},
		});
	}

	const columnsDiff = diff(ddl1, ddl2, 'columns').filter((it) =>
		!createdTables.some((table) => table.name === it.table)
	); // filter out columns for newly created tables

	const groupedByTable = groupDiffs(columnsDiff);

	const columnRenames = [] as { from: Column; to: Column }[];
	const columnsToCreate = [] as Column[];
	const columnsToDelete = [] as Column[];

	for (let it of groupedByTable) {
		const { renamedOrMoved: renamed, created, deleted } = await columnsResolver({
			deleted: it.deleted,
			created: it.inserted,
		});

		columnsToCreate.push(...created);
		columnsToDelete.push(...deleted);
		columnRenames.push(...renamed);
	}

	for (const rename of columnRenames) {
		ddl1.columns.update({
			set: {
				name: rename.to.name,
			},
			where: {
				table: rename.from.table,
				name: rename.from.name,
			},
		});

		// DDL2 updates are needed for Drizzle Studio
		const update1 = {
			set: {
				columns: (it: IndexColumn) => {
					if (!it.isExpression && it.value === rename.from.name) {
						it.value = rename.to.name;
					}
					return it;
				},
			},
			where: {
				table: rename.from.table,
			},
		} as const;

		ddl1.indexes.update(update1);
		ddl2.indexes.update(update1);

		const update2 = {
			set: {
				columns: (it: string) => it === rename.from.name ? rename.to.name : it,
			},
			where: {
				table: rename.from.table,
			},
		} as const;
		ddl1.fks.update(update2);
		ddl2.fks.update(update2);

		const update3 = {
			set: {
				columnsTo: (it: string) => it === rename.from.name ? rename.to.name : it,
			},
			where: {
				tableTo: rename.from.table,
			},
		} as const;
		ddl1.fks.update(update3);
		ddl2.fks.update(update3);

		const update4 = {
			set: {
				columns: (it: string) => it === rename.from.name ? rename.to.name : it,
			},
			where: {
				table: rename.from.table,
			},
		};
		ddl1.pks.update(update4);
		ddl2.pks.update(update4);

		const update5 = {
			set: {
				columns: (it: string) => it === rename.from.name ? rename.to.name : it,
			},
			where: {
				table: rename.from.table,
			},
		};
		ddl1.uniques.update(update5);
		ddl2.uniques.update(update5);

		const update6 = {
			set: {
				value: rename.to.name,
			},
			where: {
				table: rename.from.table,
				value: rename.from.name,
			},
		} as const;
		ddl1.checks.update(update6);
		ddl2.checks.update(update6);
	}

	const createdFilteredColumns = columnsToCreate.filter((it) => !it.generated || it.generated.type === 'virtual');

	preserveEntityNames(ddl1.uniques, ddl2.uniques, mode);
	preserveEntityNames(ddl1.pks, ddl2.pks, mode);
	preserveEntityNames(ddl1.fks, ddl2.fks, mode);

	const pksDiff = diff(ddl1, ddl2, 'pks').filter((it) => !deletedTables.some((table) => table.name === it.table));
	const uniquesDiff = diff(ddl1, ddl2, 'uniques').filter((it) =>
		!deletedTables.some((table) => table.name === it.table)
	);
	const indexesDiff = diff(ddl1, ddl2, 'indexes');
	const checksDiff = diff(ddl1, ddl2, 'checks');
	const fksDiff = diff(ddl1, ddl2, 'fks')
		// it is possible to `ADD COLUMN t integer REFERENCE ...`
		.filter((it) =>
			it.columns.length > 0
			&& !createdFilteredColumns.some((column) => column.table === it.table && column.name === it.columns[0])
		)
		// filter deleted tables
		.filter((it) => !deletedTables.some((table) => table.name === it.table));

	const indexesByTable = groupDiffs(indexesDiff);

	// ignore created/dropped views with isExisting, we can't rename views in SQLite
	const viewsDiff = diff(ddl1, ddl2, 'views').filter((it) => !it.isExisting);

	const createdViews = viewsDiff.filter((it) => it.$diffType === 'create');
	const deletedViews = viewsDiff.filter((it) => it.$diffType === 'drop');

	const updates = diff.alters(ddl1, ddl2);

	const uniquesAlters = updates.filter((it) => it.entityType === 'uniques').filter((it) => {
		if (it.nameExplicit) {
			delete it.nameExplicit;
		}

		return ddl2.uniques.hasDiff(it);
	});

	const pksAlters = updates.filter((it) => it.entityType === 'pks').filter((it) => {
		if (it.nameExplicit) {
			delete it.nameExplicit;
		}

		if (
			it.columns && it.columns.to && it.columns.from && it.columns.from.length === it.columns.to.length
		) {
			const unique = new Set(it.columns.to);

			if (it.columns.from.every((col) => unique.has(col))) delete it.columns;
		}

		return ddl2.pks.hasDiff(it);
	});

	const fksAlters = updates.filter((it) => it.entityType === 'fks').filter((it) => {
		if (it.nameExplicit) {
			delete it.nameExplicit;
		}

		return ddl2.fks.hasDiff(it);
	});

	const checksAlters = updates.filter((it) => it.entityType === 'checks');

	const alteredColumns = updates.filter((it) => it.entityType === 'columns').filter((it) => {
		if (it.notNull && ddl2.pks.one({ table: it.table, columns: [it.name] })) {
			delete it.notNull;
		}

		if (it.default && defaultsCommutative(it.default, it.$right.type)) {
			delete it.default;
		}

		return ddl2.columns.hasDiff(it);
	});
	const alteredColumnsBecameGenerated = alteredColumns.filter((it) => it.generated?.to?.type === 'stored');
	const newStoredColumns = columnsToCreate.filter((it) => it.generated && it.generated.type === 'stored');

	const setOfTablesToRecereate = new Set(
		[
			...checksDiff,
			...uniquesDiff,
			...pksDiff,
			...fksDiff,
			...indexesDiff.filter((it) => it.isUnique && it.origin === 'auto'), // we can't drop/create auto generated unique indexes;,
			...alteredColumnsBecameGenerated, // "It is not possible to ALTER TABLE ADD COLUMN a STORED column. https://www.sqlite.org/gencol.html"
			...newStoredColumns, // "It is not possible to ALTER TABLE ADD COLUMN a STORED column. https://www.sqlite.org/gencol.html"
		].map((it) => it.table),
	);

	for (const it of createdTables) {
		setOfTablesToRecereate.delete(it.name);
	}
	for (const it of deletedTables) {
		setOfTablesToRecereate.delete(it.name);
	}

	for (const it of [...alteredColumns, ...pksAlters, ...fksAlters, ...uniquesAlters, ...checksAlters]) {
		if (it.entityType === 'columns' && (it.type || it.default || it.autoincrement || it.notNull)) {
			setOfTablesToRecereate.add(it.table);
		}
		if (pksAlters.length > 0 && it.entityType === 'pks') setOfTablesToRecereate.add(it.table);
		if (fksAlters.length > 0 && it.entityType === 'fks') setOfTablesToRecereate.add(it.table);
		if (uniquesAlters.length > 0 && it.entityType === 'uniques') setOfTablesToRecereate.add(it.table);
		if (checksAlters.length > 0 && it.entityType === 'checks') setOfTablesToRecereate.add(it.table);
	}

	const tablesToRecreate = Array.from(setOfTablesToRecereate);

	// TODO: handle
	// const viewsToRecreateBecauseOfTables = tablesToRecreate.map((it) => {
	// 	return ddl2.views.one({});
	// });

	const jsonRecreateTables = tablesToRecreate.map((it) => {
		return prepareStatement('recreate_table', {
			to: tableFromDDL(it, ddl2),
			from: tableFromDDL(it, ddl1),
			alteredColumnsBecameGenerated: alteredColumnsBecameGenerated.filter((acbg) => acbg.table === it),
			newStoredColumns: newStoredColumns.filter((column) => column.table === it),
			checkDiffs: checksDiff.filter((checkDiff) => checkDiff.table === it),
			checksAlters: checksAlters.filter((checkAlter) => checkAlter.table === it),
			columnAlters: alteredColumns.filter((column) => column.table === it),
			fksAlters: fksAlters.filter((fkAlters) => fkAlters.table === it),
			fksDiff: fksDiff.filter((fkDiff) => fkDiff.table === it),
			indexesDiff: indexesDiff.filter((indexDiff) => indexDiff.table === it),
			pksAlters: pksAlters.filter((pkAlters) => pkAlters.table === it),
			pksDiff: pksDiff.filter((pkDiff) => pkDiff.table === it),
			uniquesAlters: uniquesAlters.filter((uniqueAlters) => uniqueAlters.table === it),
			uniquesDiff: uniquesDiff.filter((uniqueDiff) => uniqueDiff.table === it),
		});
	});

	const jsonTableAlternations = alteredColumns
		.filter((it) => !setOfTablesToRecereate.has(it.table)).map((it) =>
			prepareRecreateColumn(
				it,
				ddl2.columns.one({ table: it.table, name: it.name })!,
				ddl2.fks.one({ table: it.table }),
			)
		);

	const jsonCreateTables = createdTables.map((it) => {
		return prepareStatement('create_table', { table: tableFromDDL(it.name, ddl2) });
	});

	// create indexes for created and recreated tables too
	const jsonCreateIndexes = [...jsonRecreateTables]
		.map((it) => it.to.indexes)
		.concat(indexesByTable.filter((it) => !setOfTablesToRecereate.has(it.table)).map((it) => it.inserted))
		.map((it) => it.map((index) => prepareStatement('create_index', { index })))
		.flat();

	const jsonDropIndexes = indexesByTable.map((it) =>
		it.deleted.map((index) => prepareStatement('drop_index', { index }))
	).flat();
	const jsonDropTables = deletedTables.map((it) => prepareStatement('drop_table', { tableName: it.name }));
	const jsonRenameTables = renamedTables.map((it) =>
		prepareStatement('rename_table', { from: it.from.name, to: it.to.name })
	);

	const jsonRenameColumnsStatements = columnRenames.map((it) =>
		prepareStatement('rename_column', { table: it.from.table, from: it.from.name, to: it.to.name })
	);

	// we need to add column for table, which is going to be recreated to match columns during recreation
	const columnDeletes = columnsToDelete.filter((it) => !setOfTablesToRecereate.has(it.table));

	const jsonDropColumnsStatemets = columnDeletes.filter((x) => {
		return !jsonDropTables.some((t) => t.tableName === x.table);
	}).map((it) => prepareStatement('drop_column', { column: it }));

	const warnings: string[] = [];
	for (const _ of newStoredColumns) {
		warnings.push(
			`As SQLite docs mention: "It is not possible to ALTER TABLE ADD COLUMN a STORED column. One can add a VIRTUAL column, however", source: "https://www.sqlite.org/gencol.html"`,
		);
	}

	const groupedNewColumns = Object.values(createdFilteredColumns.reduce((acc, prev) => {
		const entry = prev.table in acc ? acc[prev.table] : { table: prev.table, columns: [] };
		acc[prev.table] = entry;
		entry.columns.push(prev);
		return acc;
	}, {} as Record<string, { table: string; columns: Column[] }>));

	const jsonAddColumnsStatemets = groupedNewColumns
		.map((it) => prepareAddColumns(it.columns, ddl2.fks.list({ table: it.table })))
		.flat();

	const createViews: JsonCreateViewStatement[] = [];
	const dropViews: JsonDropViewStatement[] = [];

	createViews.push(...createdViews.map((it) => prepareStatement('create_view', { view: it })));
	dropViews.push(...deletedViews.map((it) => prepareStatement('drop_view', { view: it })));

	for (const view of updates.filter((it) => it.entityType === 'views')) {
		if (view.isExisting || (view.definition && mode !== 'push')) {
			const entity = ddl2.views.one({ name: view.name })!;
			dropViews.push(prepareStatement('drop_view', { view: entity }));
			createViews.push(prepareStatement('create_view', { view: entity }));
		}
	}

	// TODO:
	// [x] create table with unique column
	// [ ] create table with unique column unique index (will create 2 indexes)
	// [ ] create table with non-unique column and unique index
	// [x] drop 'c' unique index ok
	// [x] drop 'u' unique index ok, recreate table
	// [x] drizzle generate does not have 'u' unique indexes and should not create ones never
	// [ ] drizzle push should respect 'u' indexes(commutativity), never auto create indexes from 'unique' of a column

	const jsonStatements: JsonStatement[] = [];
	jsonStatements.push(...jsonCreateTables);
	jsonStatements.push(...jsonRenameTables); // rename tables before tables recreate
	jsonStatements.push(...jsonRenameColumnsStatements); // rename columns before tables recreate
	jsonStatements.push(...jsonAddColumnsStatemets);

	jsonStatements.push(...jsonTableAlternations);

	jsonStatements.push(...jsonRecreateTables);
	jsonStatements.push(...jsonDropIndexes);
	jsonStatements.push(...jsonCreateIndexes);

	jsonStatements.push(...jsonDropTables);

	jsonStatements.push(...jsonDropColumnsStatemets);

	jsonStatements.push(...dropViews);
	jsonStatements.push(...createViews);

	const { sqlStatements, groupedStatements } = fromJson(jsonStatements);

	const renames = prepareMigrationRenames([
		...renamedTables,
		...columnRenames,
	]);

	return {
		statements: jsonStatements,
		sqlStatements,
		groupedStatements,
		renames,
		warnings,
	};
};
