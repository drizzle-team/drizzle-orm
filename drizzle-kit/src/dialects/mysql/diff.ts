import { mockResolver } from '../../utils/mocks';
import { Resolver } from '../common';
import { diff } from '../dialect';
import { groupDiffs, preserveEntityNames } from '../utils';
import { fromJson } from './convertor';
import { Column, DiffEntities, fullTableFromDDL, Index, MysqlDDL, Table, View } from './ddl';
import { charSetAndCollationCommutative, defaultNameForFK, typesCommutative } from './grammar';
import { prepareStatement } from './statements';
import { JsonStatement } from './statements';

export const ddlDiffDry = async (from: MysqlDDL, to: MysqlDDL, mode: 'default' | 'push' = 'default') => {
	const s = new Set<string>();
	return ddlDiff(from, to, mockResolver(s), mockResolver(s), mockResolver(s), mode);
};

export const ddlDiff = async (
	ddl1: MysqlDDL,
	ddl2: MysqlDDL,
	tablesResolver: Resolver<Table>,
	columnsResolver: Resolver<Column>,
	viewsResolver: Resolver<View>,
	mode: 'default' | 'push',
): Promise<{
	statements: JsonStatement[];
	sqlStatements: string[];
	groupedStatements: { jsonStatement: JsonStatement; sqlStatements: string[] }[];
	renames: string[];
}> => {
	const tablesDiff = diff(ddl1, ddl2, 'tables');

	const {
		created: createdTables,
		deleted: deletedTables,
		renamedOrMoved: renamedTables, // renamed or moved
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

		const selfRefs = ddl1.fks.update({
			set: {
				table: renamed.to.name,
				tableTo: renamed.to.name,
			},
			where: {
				table: renamed.from.name,
				tableTo: renamed.from.name,
			},
		});

		const froms = ddl1.fks.update({
			set: {
				table: renamed.to.name,
			},
			where: {
				table: renamed.from.name,
			},
		});

		const tos = ddl1.fks.update({
			set: {
				tableTo: renamed.to.name,
			},
			where: {
				tableTo: renamed.from.name,
			},
		});

		// preserve name for foreign keys
		const renamedFKs = [...selfRefs.data, ...froms.data, ...tos.data];
		for (const fk of renamedFKs) {
			const name = defaultNameForFK(fk);
			ddl2.fks.update({
				set: {
					name: fk.name,
				},
				where: {
					name: name,
				},
			});
		}

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
	const columnCreates = [] as Column[];
	const columnDeletes = [] as Column[];

	for (let it of groupedByTable) {
		const { renamedOrMoved: renamed, created, deleted } = await columnsResolver({
			deleted: it.deleted,
			created: it.inserted,
		});

		columnCreates.push(...created);
		columnDeletes.push(...deleted);
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
				columns: (it: Index['columns'][number]) => {
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
	}

	preserveEntityNames(ddl1.fks, ddl2.fks, mode);
	preserveEntityNames(ddl1.pks, ddl2.pks, mode);
	preserveEntityNames(ddl1.indexes, ddl2.indexes, mode);

	const viewsDiff = diff(ddl1, ddl2, 'views');

	const {
		created: createdViews,
		deleted: deletedViews,
		renamedOrMoved: renamedViews, // renamed or moved
	} = await viewsResolver({
		created: viewsDiff.filter((it) => it.$diffType === 'create'),
		deleted: viewsDiff.filter((it) => it.$diffType === 'drop'),
	});

	for (const rename of renamedViews) {
		ddl1.views.update({
			set: {
				name: rename.to.name,
			},
			where: {
				name: rename.from.name,
			},
		});
	}

	const checksDiff = diff(ddl1, ddl2, 'checks');
	const indexesDiff = diff(ddl1, ddl2, 'indexes');
	const fksDiff = diff(ddl1, ddl2, 'fks');
	const pksDiff = diff(ddl1, ddl2, 'pks');

	const alters = diff.alters(ddl1, ddl2);

	const createTableStatements = createdTables.map((it) => {
		const full = fullTableFromDDL(it, ddl2);
		if (createdTables.length > 1) full.fks = []; // fks have to be created after all tables created
		return prepareStatement('create_table', { table: full });
	});

	const dropTableStatements = deletedTables.map((it) => {
		return prepareStatement('drop_table', { table: it.name });
	});

	const renameTableStatements = renamedTables.map((it) => {
		return prepareStatement('rename_table', { from: it.from.name, to: it.to.name });
	});

	const renameColumnsStatement = columnRenames.map((it) => {
		return prepareStatement('rename_column', {
			table: it.to.table,
			from: it.from.name,
			to: it.to.name,
		});
	});

	const createViewStatements = createdViews.map((it) => prepareStatement('create_view', { view: it, replace: false }));

	const dropViewStatements = deletedViews.map((it) => {
		return prepareStatement('drop_view', { name: it.name });
	});

	const renameViewStatements = renamedViews.map((it) => {
		return prepareStatement('rename_view', {
			from: it.from.name,
			to: it.to.name,
		});
	});

	const alterViewStatements = alters.filter((it) => it.entityType === 'views')
		.map((it) => {
			if (it.definition && mode === 'push') delete it.definition;
			return it;
		})
		.filter((it) => ddl2.views.hasDiff(it))
		.map((it) => {
			const view = ddl2.views.one({ name: it.name })!;
			if (it.definition) return prepareStatement('create_view', { view, replace: true });
			return prepareStatement('alter_view', { diff: it, view });
		});

	const dropCheckStatements = checksDiff.filter((it) => it.$diffType === 'drop')
		.filter((it) => !deletedTables.some((x) => x.name === it.table))
		.map((it) => prepareStatement('drop_constraint', { constraint: it.name, table: it.table }));

	const dropIndexeStatements = indexesDiff.filter((it) => it.$diffType === 'drop').map((it) =>
		prepareStatement('drop_index', { index: it })
	);

	const dropFKStatements = fksDiff.filter((it) => it.$diffType === 'drop')
		.filter((it) => !deletedTables.some((x) => x.name === it.table))
		.map((it) => prepareStatement('drop_fk', { fk: it }));

	const dropPKStatements = pksDiff.filter((it) => it.$diffType === 'drop')
		.filter((it) => !deletedTables.some((x) => x.name === it.table))
		.map((it) => prepareStatement('drop_pk', { pk: it }));

	const createCheckStatements = checksDiff.filter((it) => it.$diffType === 'create')
		.filter((it) => !createdTables.some((x) => x.name === it.table))
		.map((it) => prepareStatement('create_check', { check: it }));

	const createIndexesStatements = indexesDiff.filter((it) => it.$diffType === 'create')
		.filter((it) => !it.isUnique || !createdTables.some((x) => x.name === it.table))
		.map((it) => prepareStatement('create_index', { index: it }));

	const createFKsStatements = fksDiff.filter((it) => it.$diffType === 'create')
		.filter((x) => createdTables.length >= 2 || !createdTables.some((it) => it.name === x.table))
		.map((it) => prepareStatement('create_fk', { fk: it }));

	const createPKStatements = pksDiff.filter((it) => it.$diffType === 'create')
		.filter((it) => !createdTables.some((x) => x.name === it.table))
		.map((it) => prepareStatement('create_pk', { pk: it }));

	const addColumnsStatemets = columnCreates.filter((it) => it.entityType === 'columns').map((it) => {
		const pk = ddl2.pks.one({ table: it.table });
		const isPK = pk && pk.columns.length === 1 && pk.columns[0] === it.name;
		return prepareStatement('add_column', { column: it, isPK: isPK ?? false });
	});

	const dropColumnStatements = columnDeletes
		.filter((it) => !deletedTables.some((x) => x.name === it.table))
		.filter((it) => it.entityType === 'columns').map((it) => {
			return prepareStatement('drop_column', { column: it });
		});

	const alterColumnPredicate: (it: DiffEntities['columns']) => boolean = (it) => {
		if (it.generated) {
			if (it.generated.from && it.generated.to) return false;
			if (it.generated.from && it.generated.from.type === 'virtual') return false;
			if (it.generated.to && it.generated.to.type === 'virtual') return false;
		}
		return true;
	};

	const columnAlterStatements = alters.filter((it) => it.entityType === 'columns')
		.filter((it) => {
			if (it.type && typesCommutative(it.type.from, it.type.to, mode)) {
				delete it.type;
			}

			if (it.default) {
				let deleteDefault =
					!!(it.default.from && it.default.to && typesCommutative(it.default.from, it.default.to, mode));
				deleteDefault ||= it.default.from === it.default.to;
				deleteDefault ||= it.default.from === `(${it.default.to})`;
				deleteDefault ||= it.default.to === `(${it.default.from})`;
				if (deleteDefault) {
					delete it.default;
				}
			}

			if (
				mode === 'push' && it.generated && it.generated.from && it.generated.to
				&& it.generated.from.as !== it.generated.to.as
			) {
				delete it.generated;
			}

			// if there's a change in notnull but column is a part of a pk - we don't care
			if (it.notNull && !!ddl2.pks.one({ table: it.table, columns: { CONTAINS: it.name } })) {
				delete it.notNull;
			}

			if (
				mode === 'push' && (it.charSet || it.collation)
				&& charSetAndCollationCommutative(
					{ charSet: it.$left.charSet ?? null, collation: it.$left.collation ?? null },
					{ charSet: it.$right.charSet ?? null, collation: it.$right.collation ?? null },
				)
			) {
				delete it.charSet;
				delete it.collation;
			}

			return ddl2.columns.hasDiff(it) && alterColumnPredicate(it);
		}).map((it) => {
			const column = ddl2.columns.one({ name: it.name, table: it.table })!;
			const pk = ddl2.pks.one({ table: it.table });
			const isPK = pk && pk.columns.length === 1 && pk.columns[0] === column.name;
			return prepareStatement('alter_column', { diff: it, column, isPK: isPK ?? false });
		});

	const columnRecreateStatatements = alters.filter((it) => it.entityType === 'columns').filter((it) =>
		!alterColumnPredicate(it)
	).map((it) => {
		const column = ddl2.columns.one({ name: it.name, table: it.table })!;
		const pk = ddl2.pks.one({ table: it.table });
		const isPK = pk && pk.columns.length === 1 && pk.columns[0] === column.name;
		return prepareStatement('recreate_column', { column, isPK: isPK ?? false });
	});

	const statements = [
		...createTableStatements,
		...dropTableStatements,
		...renameTableStatements,

		...renameColumnsStatement,

		...dropViewStatements,
		...renameViewStatements,
		...alterViewStatements,

		...dropCheckStatements,
		...dropFKStatements,
		...dropIndexeStatements,
		...dropPKStatements,

		...columnAlterStatements,
		...columnRecreateStatatements,

		...createPKStatements,

		...addColumnsStatemets,
		...createFKsStatements,
		...createIndexesStatements,
		...createCheckStatements,

		...dropColumnStatements,
		...createViewStatements,
	];

	const res = fromJson(statements);

	return {
		statements: statements,
		sqlStatements: res.sqlStatements,
		groupedStatements: res.groupedStatements,
		renames: [],
	};
};
