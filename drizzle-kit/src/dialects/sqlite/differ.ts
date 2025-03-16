// import { warning } from 'src/cli/views';
import { diff } from 'src/dialects/dialect';
import type {
	ColumnsResolverInput,
	ColumnsResolverOutput,
	ResolverInput,
	ResolverOutputWithMoved,
} from '../../snapshot-differ/common';
import { prepareMigrationMeta } from '../../utils';
import { groupDiffs, Named, RenamedItems } from '../utils';
import { fromJson } from './convertor';
import { Column, Index, IndexColumn, SQLiteDDL, tableFromDDL } from './ddl';
import {
	JsonCreateViewStatement,
	JsonDropViewStatement,
	JsonStatement,
	prepareAddColumns,
	prepareRecreateColumn,
	prepareStatement,
} from './statements';

export const applySqliteSnapshotsDiff = async (
	ddl1: SQLiteDDL,
	ddl2: SQLiteDDL,
	tablesResolver: (input: ResolverInput<Named>) => Promise<ResolverOutputWithMoved<Named>>,
	columnsResolver: (input: ColumnsResolverInput<Column>) => Promise<ColumnsResolverOutput<Column>>,
	action: 'push' | 'generate',
): Promise<{
	statements: JsonStatement[];
	sqlStatements: string[];
	groupedStatements: {
		jsonStatement: JsonStatement;
		sqlStatements: string[];
	}[];
	_meta:
		| {
			tables: {};
			columns: {};
		}
		| undefined;
	warnings: string[];
}> => {
	const tablesDiff = diff(ddl1, ddl2, 'tables');

	const {
		created: createdTables,
		deleted: deletedTables,
		renamed: renamedTables,
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

	const columnRenames = [] as RenamedItems<Column>[];
	const columnsToCreate = [] as Column[];
	const columnsToDelete = [] as Column[];

	for (let it of groupedByTable) {
		const { renamed, created, deleted } = await columnsResolver({
			tableName: it.table,
			schema: '',
			deleted: it.deleted,
			created: it.inserted,
		});

		columnsToCreate.push(...created);
		columnsToDelete.push(...deleted);

		if (renamed.length > 0) {
			columnRenames.push({
				table: it.table,
				schema: '',
				renames: renamed,
			});
		}
	}

	for (const entry of columnRenames) {
		for (const rename of entry.renames) {
			ddl1.columns.update({
				set: {
					name: rename.to.name,
				},
				where: {
					table: entry.table,
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
					table: entry.table,
				},
			} as const;

			ddl1.indexes.update(update1);
			ddl2.indexes.update(update1);

			const update2 = {
				set: {
					columnsFrom: (it: string) => it === rename.from.name ? rename.to.name : it,
				},
				where: {
					tableFrom: entry.table,
				},
			} as const;
			ddl1.fks.update(update2);
			ddl2.fks.update(update2);

			const update3 = {
				set: {
					columnsTo: (it: string) => it === rename.from.name ? rename.to.name : it,
				},
				where: {
					tableTo: entry.table,
				},
			} as const;
			ddl1.fks.update(update3);
			ddl2.fks.update(update3);

			const update4 = {
				set: {
					columns: (it: string) => it === rename.from.name ? rename.to.name : it,
				},
				where: {
					table: entry.table,
				},
			};
			ddl1.pks.update(update4);
			ddl2.pks.update(update4);

			const update5 = {
				set: {
					columns: (it: string) => it === rename.from.name ? rename.to.name : it,
				},
				where: {
					table: entry.table,
				},
			};
			ddl1.uniques.update(update5);
			ddl2.uniques.update(update5);
		}
	}

	const pksDiff = diff(ddl1, ddl2, 'pks');
	const uniquesDiff = diff(ddl1, ddl2, 'uniques');
	const indexesDiff = diff(ddl1, ddl2, 'indexes');
	const checksDiff = diff(ddl1, ddl2, 'checks');
	const fksDiff = diff(ddl1, ddl2, 'fks');

	const indexesByTable = groupDiffs(indexesDiff);

	// ignore created/dropped views with isExisting, we can't rename views in SQLite
	const viewsDiff = diff(ddl1, ddl2, 'views').filter((it) => !it.isExisting);

	const createdViews = viewsDiff.filter((it) => it.$diffType === 'create');
	const deletedViews = viewsDiff.filter((it) => it.$diffType === 'drop');

	const updates = diff.alters(ddl1, ddl2);

	const alteredColumnsBecameGenerated = updates.filter((it) => it.entityType === 'columns').filter((it) =>
		it.generated?.to?.type === 'stored'
	);
	const newStoredColumns = columnsToCreate.filter((it) => it.generated && it.generated.type === 'stored');

	const setOfTablesToRecereate = new Set(
		[
			...checksDiff,
			...uniquesDiff,
			...pksDiff,
			...fksDiff,
			...indexesDiff.filter((it) => it.isUnique && it.origin === 'auto'), // we can't drop/create auto generated unique indexes
			...[...columnsToCreate, ...columnsToDelete].filter((it) => it.primaryKey || it.unique),
			...alteredColumnsBecameGenerated, // "It is not possible to ALTER TABLE ADD COLUMN a STORED column. https://www.sqlite.org/gencol.html"
			...newStoredColumns, // "It is not possible to ALTER TABLE ADD COLUMN a STORED column. https://www.sqlite.org/gencol.html"
		].map((it) => it.table),
	);

	for (const it of createdTables) {
		setOfTablesToRecereate.delete(it.name);
	}

	for (const it of updates) {
		if (
			it.entityType === 'columns'
			&& (it.type || it.default || it.notNull || it.autoincrement || it.primaryKey || it.unique)
		) {
			setOfTablesToRecereate.add(it.table);
		}
		if (it.entityType === 'pks') setOfTablesToRecereate.add(it.table);
		if (it.entityType === 'fks') setOfTablesToRecereate.add(it.table);
		if (it.entityType === 'uniques') setOfTablesToRecereate.add(it.table);
		if (it.entityType === 'checks') setOfTablesToRecereate.add(it.table);
	}

	const tablesToRecreate = Array.from(setOfTablesToRecereate);
	const viewsToRecreateBecauseOfTables = tablesToRecreate.map((it) => {
		return ddl2.views.one({});
	});

	const jsonRecreateTables = tablesToRecreate.map((it) => {
		return prepareStatement('recreate_table', { table: tableFromDDL(it, ddl2) });
	});

	const jsonTableAlternations = updates.filter((it) => it.entityType === 'columns')
		.filter(
			(it) => !setOfTablesToRecereate.has(it.table),
		).map((it) =>
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
		.map((it) => it.table.indexes)
		.concat(indexesByTable.filter((it) => !setOfTablesToRecereate.has(it.table)).map((it) => it.inserted))
		.map((it) => it.map((index) => prepareStatement('add_index', { index })))
		.flat();

	const jsonDropIndexes = indexesByTable.map((it) =>
		it.deleted.map((index) => prepareStatement('drop_index', { index }))
	).flat();
	const jsonDropTables = deletedTables.map((it) => prepareStatement('drop_table', { tableName: it.name }));
	const jsonRenameTables = renamedTables.map((it) =>
		prepareStatement('rename_table', { from: it.from.name, to: it.to.name })
	);

	const jsonRenameColumnsStatements = columnRenames
		.map((it) =>
			it.renames.map((r) =>
				prepareStatement('alter_table_rename_column', { tableName: it.table, from: r.from.name, to: r.to.name })
			)
		)
		.flat();

	// we need to add column for table, which is going to be recreated to match columns during recreation
	const columnDeletes = columnsToDelete.filter((it) => !setOfTablesToRecereate.has(it.table));

	const jsonDropColumnsStatemets = columnDeletes.map((it) =>
		prepareStatement('alter_table_drop_column', { column: it })
	);
	const createdFilteredColumns = columnsToCreate.filter((it) => !it.generated || it.generated.type === 'virtual');

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
		if (view.isExisting || (view.definition && action !== 'push')) {
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
	jsonStatements.push(...jsonCreateIndexes);

	jsonStatements.push(...jsonDropTables);
	jsonStatements.push(...jsonDropIndexes);

	jsonStatements.push(...jsonDropColumnsStatemets);

	jsonStatements.push(...dropViews);
	jsonStatements.push(...createViews);

	const { sqlStatements, groupedStatements } = fromJson(jsonStatements);

	const rTables = renamedTables.map((it) => {
		return {
			from: {
				schema: '',
				name: it.from.name,
			},
			to: {
				schema: '',
				name: it.to.name,
			},
		};
	});

	const rColumns = jsonRenameColumnsStatements.map((it) => {
		const tableName = it.tableName;
		return {
			from: { schema: '', table: tableName, column: it.from },
			to: { schema: '', table: tableName, column: it.to },
		};
	});

	const _meta = prepareMigrationMeta([], rTables, rColumns);

	return {
		statements: jsonStatements,
		sqlStatements,
		groupedStatements,
		_meta,
		warnings,
	};
};
