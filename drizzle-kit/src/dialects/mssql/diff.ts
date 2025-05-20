import { copy, prepareMigrationRenames } from '../../utils';
import { mockResolver } from '../../utils/mocks';
import type { Resolver } from '../common';
import { diff } from '../dialect';
import { groupDiffs } from '../utils';
import { fromJson } from './convertor';
// import { fromJson } from './convertor';
import {
	CheckConstraint,
	Column,
	createDDL,
	DefaultConstraint,
	ForeignKey,
	fullTableFromDDL,
	Index,
	MssqlDDL,
	MssqlEntities,
	PrimaryKey,
	Schema,
	// tableFromDDL,
	UniqueConstraint,
	View,
} from './ddl';
import { defaultNameForDefault, defaultNameForFK, defaultNameForPK, defaultNameForUnique } from './grammar';
import { JsonStatement, prepareStatement } from './statements';

export const ddlDiffDry = async (ddlFrom: MssqlDDL, ddlTo: MssqlDDL, mode: 'default' | 'push') => {
	const mocks = new Set<string>();
	return ddlDiff(
		ddlFrom,
		ddlTo,
		mockResolver(mocks),
		mockResolver(mocks),
		mockResolver(mocks),
		mockResolver(mocks),
		mockResolver(mocks),
		mockResolver(mocks),
		mockResolver(mocks),
		mockResolver(mocks),
		mockResolver(mocks),
		mockResolver(mocks),
		mode,
	);
};

export const ddlDiff = async (
	ddl1: MssqlDDL,
	ddl2: MssqlDDL,
	schemasResolver: Resolver<Schema>,
	tablesResolver: Resolver<MssqlEntities['tables']>,
	columnsResolver: Resolver<Column>,
	viewsResolver: Resolver<View>,
	uniquesResolver: Resolver<UniqueConstraint>,
	indexesResolver: Resolver<Index>,
	checksResolver: Resolver<CheckConstraint>,
	pksResolver: Resolver<PrimaryKey>,
	fksResolver: Resolver<ForeignKey>,
	defaultsResolver: Resolver<DefaultConstraint>,
	type: 'default' | 'push',
): Promise<{
	statements: JsonStatement[];
	sqlStatements: string[];
	groupedStatements: { jsonStatement: JsonStatement; sqlStatements: string[] }[];
	renames: string[];
}> => {
	const ddl1Copy = createDDL();
	for (const entity of ddl1.entities.list()) {
		ddl1Copy.entities.push(entity);
	}

	const schemasDiff = diff(ddl1, ddl2, 'schemas');
	const {
		created: createdSchemas,
		deleted: deletedSchemas,
		renamedOrMoved: renamedSchemas,
	} = await schemasResolver({
		created: schemasDiff.filter((it) => it.$diffType === 'create'),
		deleted: schemasDiff.filter((it) => it.$diffType === 'drop'),
	});

	for (const rename of renamedSchemas) {
		ddl1.entities.update({
			set: {
				schema: rename.to.name,
			},
			where: {
				schema: rename.from.name,
			},
		});

		ddl1.fks.update({
			set: {
				schemaTo: rename.to.name,
			},
			where: {
				schemaTo: rename.from.name,
			},
		});
	}

	const createSchemas = createdSchemas.map((it) => prepareStatement('create_schema', it));
	const dropSchemas = deletedSchemas.map((it) => prepareStatement('drop_schema', it));
	const renameSchemas = renamedSchemas.map((it) => prepareStatement('rename_schema', it));

	const tablesDiff = diff(ddl1, ddl2, 'tables');

	const {
		created: createdTables,
		deleted: deletedTables,
		renamedOrMoved: renamedOrMovedTables, // renamed or moved
	} = await tablesResolver({
		created: tablesDiff.filter((it) => it.$diffType === 'create'),
		deleted: tablesDiff.filter((it) => it.$diffType === 'drop'),
	});

	const renamedTables = renamedOrMovedTables.filter((it) => it.from.name !== it.to.name);
	const movedTables = renamedOrMovedTables.filter((it) => it.from.schema !== it.to.schema);

	const pksRenames = [] as { from: PrimaryKey; to: PrimaryKey }[];
	const uniqueRenames = [] as { from: UniqueConstraint; to: UniqueConstraint }[];
	const fksRenames = [] as { from: ForeignKey; to: ForeignKey }[];
	const checkRenames = [] as { from: CheckConstraint; to: CheckConstraint }[];
	const defaultsRenames = [] as { from: DefaultConstraint; to: DefaultConstraint }[];

	for (const rename of renamedOrMovedTables) {
		ddl1.tables.update({
			set: {
				name: rename.to.name,
				schema: rename.to.schema,
			},
			where: {
				name: rename.from.name,
				schema: rename.from.schema,
			},
		});

		const fks1 = ddl1.fks.update({
			set: {
				schemaTo: rename.to.schema,
				tableTo: rename.to.name,
			},
			where: {
				schemaTo: rename.from.schema,
				tableTo: rename.from.name,
			},
		});
		const fks2 = ddl1.fks.update({
			set: {
				schema: rename.to.schema,
				table: rename.to.name,
			},
			where: {
				schema: rename.from.schema,
				table: rename.from.name,
			},
		});

		// This copy is needed because in forof loop the original fks are modified
		const copies = [...copy(fks1.data), ...copy(fks2.data)];

		for (const fk of copies.filter((it) => !it.nameExplicit)) {
			const name = defaultNameForFK(fk.table, fk.columns, fk.tableTo, fk.columnsTo);

			const updated = ddl1.fks.update({
				set: { name: name },
				where: {
					schema: fk.schema,
					table: fk.table,
					name: fk.name,
					nameExplicit: false,
				},
			});

			fksRenames.push({ to: updated.data[0], from: fk });
		}

		const res = ddl1.entities.update({
			set: {
				table: rename.to.name,
				schema: rename.to.schema,
			},
			where: {
				table: rename.from.name,
				schema: rename.from.schema,
			},
		});

		for (const it of res.data) {
			if (it.entityType === 'pks' && !it.nameExplicit) {
				const name = defaultNameForPK(it.table);

				const originalPk = copy(
					ddl1.pks.one({ schema: it.schema, table: it.table, name: it.name, nameExplicit: false }),
				);

				if (!originalPk) throw Error('Unhandled error occurred: Can not find original PK');

				const updated = ddl1.pks.update({
					set: {
						name: name,
					},
					where: {
						schema: it.schema,
						table: it.table,
						name: it.name,
						nameExplicit: false,
					},
				});

				pksRenames.push({ from: originalPk, to: updated.data[0] });
			}
			if (it.entityType === 'uniques' && !it.nameExplicit) {
				const name = defaultNameForUnique(it.table, it.columns);

				const originalUnique = copy(ddl1.uniques.one({
					schema: it.schema,
					table: it.table,
					name: it.name,
					nameExplicit: false,
				}));

				if (!originalUnique) throw Error('Unhandled error occurred: Can not find original Unique');

				const updated = ddl1.uniques.update({
					set: {
						name: name,
					},
					where: {
						schema: it.schema,
						table: it.table,
						name: it.name,
						nameExplicit: false,
					},
				});

				uniqueRenames.push({ from: originalUnique, to: updated.data[0] });
			}
			if (it.entityType === 'defaults' && !it.nameExplicit) {
				const name = defaultNameForDefault(it.table, it.column);

				const originalDefaults = copy(ddl1.defaults.one({
					schema: it.schema,
					table: it.table,
					name: it.name,
					nameExplicit: false,
				}));

				if (!originalDefaults) throw Error('Unhandled error occurred: Can not find original Default');

				const updated = ddl1.defaults.update({
					set: {
						name: name,
					},
					where: {
						schema: it.schema,
						table: it.table,
						name: it.name,
						nameExplicit: false,
					},
				});

				defaultsRenames.push({ from: originalDefaults, to: updated.data[0] });
			}
		}
	}

	const columnsDiff = diff(ddl1, ddl2, 'columns');
	const columnRenames = [] as { from: Column; to: Column }[];
	const columnsToCreate = [] as Column[];
	const columnsToDelete = [] as Column[];

	const groupedByTable = groupDiffs(columnsDiff);

	for (let it of groupedByTable) {
		const { created, deleted, renamedOrMoved } = await columnsResolver({
			created: it.inserted,
			deleted: it.deleted,
		});

		columnsToCreate.push(...created);
		columnsToDelete.push(...deleted);
		columnRenames.push(...renamedOrMoved);
	}

	for (const rename of columnRenames) {
		ddl1.columns.update({
			set: {
				name: rename.to.name,
				schema: rename.to.schema,
			},
			where: {
				name: rename.from.name,
				schema: rename.from.schema,
			},
		});

		ddl1.pks.update({
			set: {
				columns: (it) => {
					return it === rename.from.name ? rename.to.name : it;
				},
			},
			where: {
				schema: rename.from.schema,
				table: rename.from.table,
			},
		});

		const fks1 = ddl1.fks.update({
			set: {
				columns: (it) => {
					return it === rename.from.name ? rename.to.name : it;
				},
			},
			where: {
				schema: rename.from.schema,
				table: rename.from.table,
			},
		});
		const fks2 = ddl1.fks.update({
			set: {
				columnsTo: (it) => {
					return it === rename.from.name ? rename.to.name : it;
				},
			},
			where: {
				schemaTo: rename.from.schema,
				tableTo: rename.from.table,
			},
		});

		// This copy is needed because in forof loop the original fks are modified
		const copies = [...copy(fks1.data), ...copy(fks2.data)];
		for (const fk of copies.filter((it) => !it.nameExplicit)) {
			const name = defaultNameForFK(fk.table, fk.columns, fk.tableTo, fk.columnsTo);

			const updated = ddl1.fks.update({
				set: { name: name },
				where: {
					schema: fk.schema,
					table: fk.table,
					name: fk.name,
					nameExplicit: false,
				},
			});

			fksRenames.push({ to: updated.data[0], from: fk });
		}

		const uniques = ddl1.uniques.update({
			set: {
				columns: (it) => {
					return it === rename.from.name ? rename.to.name : it;
				},
			},
			where: {
				schema: rename.from.schema,
				table: rename.from.table,
			},
		});

		for (const it of uniques.data.filter((it) => !it.nameExplicit)) {
			const originalUnique = copy(ddl1.uniques.one({
				schema: it.schema,
				table: it.table,
				name: it.name,
				nameExplicit: false,
			}));

			if (!originalUnique) throw Error('Unhandled error occurred: Can not find original Unique');

			const name = defaultNameForUnique(it.table, [it.columns[0]]);
			const updated = ddl1.uniques.update({
				set: {
					name: name,
				},
				where: {
					schema: it.schema,
					table: it.table,
					name: it.name,
					nameExplicit: false,
				},
			});

			uniqueRenames.push({ from: originalUnique, to: updated.data[0] });
		}

		const columnsDefaults = ddl1.defaults.update({
			set: { column: rename.to.name },
			where: {
				schema: rename.from.schema,
				table: rename.from.table,
			},
		});

		for (const it of columnsDefaults.data.filter((it) => !it.nameExplicit)) {
			const originalDefault = copy(ddl1.defaults.one({
				schema: it.schema,
				table: it.table,
				name: it.name,
				nameExplicit: false,
			}));

			if (!originalDefault) throw Error('Unhandled error occurred: Can not find original Default');

			const name = defaultNameForDefault(it.table, it.column);
			const updated = ddl1.defaults.update({
				set: {
					name,
				},
				where: {
					schema: it.schema,
					table: it.table,
					name: it.name,
					nameExplicit: false,
				},
			});

			defaultsRenames.push({ from: originalDefault, to: updated.data[0] });
		}

		ddl1.checks.update({
			set: {
				value: rename.to.name,
			},
			where: {
				schema: rename.from.schema,
				table: rename.from.table,
				value: rename.from.name,
			},
		});
	}

	const uniquesDiff = diff(ddl1, ddl2, 'uniques');
	const groupedUniquesDiff = groupDiffs(uniquesDiff);

	const uniqueCreates = [] as UniqueConstraint[];
	const uniqueDeletes = [] as UniqueConstraint[];

	for (const entry of groupedUniquesDiff) {
		const { renamedOrMoved: renamed, created, deleted } = await uniquesResolver({
			created: entry.inserted,
			deleted: entry.deleted,
		});

		uniqueCreates.push(...created);
		uniqueDeletes.push(...deleted);
		uniqueRenames.push(...renamed);
	}

	for (const rename of uniqueRenames) {
		ddl1.uniques.update({
			set: {
				name: rename.to.name,
				schema: rename.to.schema,
			},
			where: {
				name: rename.from.name,
				schema: rename.from.schema,
			},
		});
	}

	const diffChecks = diff(ddl1, ddl2, 'checks');
	const groupedChecksDiff = groupDiffs(diffChecks);
	const checkCreates = [] as CheckConstraint[];
	const checkDeletes = [] as CheckConstraint[];

	for (const entry of groupedChecksDiff) {
		const { renamedOrMoved, created, deleted } = await checksResolver({
			created: entry.inserted,
			deleted: entry.deleted,
		});

		checkCreates.push(...created);
		checkDeletes.push(...deleted);
		checkRenames.push(...renamedOrMoved);
	}

	for (const rename of checkRenames) {
		ddl1.checks.update({
			set: {
				name: rename.to.name,
				schema: rename.to.schema,
			},
			where: {
				name: rename.from.name,
				schema: rename.from.schema,
			},
		});
	}

	const diffIndexes = diff(ddl1, ddl2, 'indexes');
	const groupedIndexesDiff = groupDiffs(diffIndexes);
	const indexesRenames = [] as { from: Index; to: Index }[];
	const indexesCreates = [] as Index[];
	const indexesDeletes = [] as Index[];

	for (const entry of groupedIndexesDiff) {
		const { renamedOrMoved, created, deleted } = await indexesResolver({
			created: entry.inserted,
			deleted: entry.deleted,
		});

		indexesCreates.push(...created);
		indexesDeletes.push(...deleted);
		indexesRenames.push(...renamedOrMoved);
	}

	for (const rename of indexesRenames) {
		ddl1.indexes.update({
			set: {
				name: rename.to.name,
				schema: rename.to.schema,
			},
			where: {
				name: rename.from.name,
				schema: rename.from.schema,
			},
		});
	}

	const diffPKs = diff(ddl1, ddl2, 'pks');
	const groupedPKsDiff = groupDiffs(diffPKs);
	const pksCreates = [] as PrimaryKey[];
	const pksDeletes = [] as PrimaryKey[];

	for (const entry of groupedPKsDiff) {
		const { renamedOrMoved, created, deleted } = await pksResolver({
			created: entry.inserted,
			deleted: entry.deleted,
		});

		pksCreates.push(...created);
		pksDeletes.push(...deleted);
		pksRenames.push(...renamedOrMoved);
	}

	for (const rename of pksRenames) {
		ddl1.pks.update({
			set: {
				name: rename.to.name,
				schema: rename.to.schema,
			},
			where: {
				name: rename.from.name,
				schema: rename.from.schema,
			},
		});
	}

	const diffFKs = diff(ddl1, ddl2, 'fks');
	const groupedFKsDiff = groupDiffs(diffFKs);
	const fksCreates = [] as ForeignKey[];
	const fksDeletes = [] as ForeignKey[];

	for (const entry of groupedFKsDiff) {
		const { renamedOrMoved, created, deleted } = await fksResolver({
			created: entry.inserted,
			deleted: entry.deleted,
		});

		fksCreates.push(...created);
		fksDeletes.push(...deleted);
		fksRenames.push(...renamedOrMoved);
	}

	for (const rename of fksRenames) {
		ddl1.fks.update({
			set: {
				name: rename.to.name,
				schema: rename.to.schema,
			},
			where: {
				name: rename.from.name,
				schema: rename.from.schema,
			},
		});
	}

	const jsonRenameFks = fksRenames.map((it) => prepareStatement('rename_fk', { from: it.from, to: it.to }));

	const viewsDiff = diff(ddl1, ddl2, 'views');

	const {
		created: createdViews,
		deleted: deletedViews,
		renamedOrMoved: renamedOrMovedViews,
	} = await viewsResolver({
		created: viewsDiff.filter((it) => it.$diffType === 'create'),
		deleted: viewsDiff.filter((it) => it.$diffType === 'drop'),
	});

	const renamedViews = renamedOrMovedViews.filter((it) => it.from.schema === it.to.schema);
	const movedViews = renamedOrMovedViews.filter((it) => it.from.schema !== it.to.schema);

	for (const rename of renamedViews) {
		ddl1.views.update({
			set: {
				name: rename.to.name,
				schema: rename.to.schema,
			},
			where: {
				name: rename.from.name,
				schema: rename.from.schema,
			},
		});
	}
	for (const move of movedViews) {
		ddl1.views.update({
			set: {
				schema: move.to.schema,
			},
			where: {
				name: move.from.name,
				schema: move.from.schema,
			},
		});
	}

	const diffDefaults = diff(ddl1, ddl2, 'defaults');
	const groupedDefaultsDiff = groupDiffs(diffDefaults);
	const defaultsCreates = [] as DefaultConstraint[];
	const defaultsDeletes = [] as DefaultConstraint[];

	for (const entry of groupedDefaultsDiff) {
		const { renamedOrMoved, created, deleted } = await defaultsResolver({
			created: entry.inserted,
			deleted: entry.deleted,
		});

		defaultsCreates.push(...created);
		defaultsDeletes.push(...deleted);
		defaultsRenames.push(...renamedOrMoved);
	}

	for (const rename of defaultsRenames) {
		ddl1.defaults.update({
			set: {
				name: rename.to.name,
				schema: rename.to.schema,
			},
			where: {
				name: rename.from.name,
				schema: rename.from.schema,
			},
		});
	}

	const alters = diff.alters(ddl1, ddl2);

	const jsonStatements: JsonStatement[] = [];

	/*
		with new DDL when table gets created with constraints, etc.
		or existing table with constraints and indexes gets deleted,
		those entites are treated by diff as newly created or deleted

		we filter them out, because we either create them on table creation
		or they get automatically deleted when table is deleted
	*/
	const tablesFilter = (type: 'deleted' | 'created') => {
		return (it: { schema: string; table: string }) => {
			if (type === 'created') {
				return !createdTables.some((t) => t.schema === it.schema && t.name === it.table);
			} else {
				return !deletedTables.some((t) => t.schema === it.schema && t.name === it.table);
			}
		};
	};

	const jsonCreateIndexes = indexesCreates.map((index) => prepareStatement('create_index', { index }));
	const jsonDropIndexes = indexesDeletes.filter(tablesFilter('deleted')).map((index) =>
		prepareStatement('drop_index', { index })
	);
	const jsonRenameIndex = indexesRenames.map((it) => prepareStatement('rename_index', { from: it.from, to: it.to }));

	const jsonCreateDefaults = defaultsCreates.map((defaultValue) =>
		prepareStatement('create_default', { default: defaultValue })
	);
	const jsonDropDefaults = defaultsDeletes.filter(tablesFilter('deleted')).map((defaultValue) =>
		prepareStatement('drop_default', { default: defaultValue })
	);
	const jsonRenameDefaults = defaultsRenames.map((it) =>
		prepareStatement('rename_default', { from: it.from, to: it.to })
	);

	for (const idx of alters.filter((it) => it.entityType === 'indexes')) {
		const forWhere = !!idx.where && (idx.where.from !== null && idx.where.to !== null ? type !== 'push' : true);
		const forColumns = !!idx.columns && (idx.columns.from.length === idx.columns.to.length ? type !== 'push' : true);

		// TODO recheck this
		if (idx.isUnique || forColumns || forWhere) {
			const index = ddl2.indexes.one({ schema: idx.schema, table: idx.table, name: idx.name })!;
			jsonDropIndexes.push(prepareStatement('drop_index', { index }));
			jsonCreateIndexes.push(prepareStatement('create_index', { index }));
		}
	}

	const createTables = createdTables.map((it) =>
		prepareStatement('create_table', { table: fullTableFromDDL(it, ddl2) })
	);

	const jsonDropTables = deletedTables.map((it) =>
		prepareStatement('drop_table', { table: fullTableFromDDL(it, ddl2) })
	);
	const jsonRenameTables = renamedTables.map((it) =>
		prepareStatement('rename_table', {
			schema: it.from.schema,
			from: it.from.name,
			to: it.to.name,
		})
	);

	const jsonRenameColumnsStatements = columnRenames.map((it) => prepareStatement('rename_column', it));
	const jsonDropColumnsStatemets = columnsToDelete.filter(tablesFilter('deleted')).map((it) =>
		prepareStatement('drop_column', { column: it })
	);
	const jsonAddColumnsStatemets = columnsToCreate.filter(tablesFilter('created')).map((it) =>
		prepareStatement('add_column', {
			column: it,
			isPK: ddl2.pks.one({ schema: it.schema, table: it.table, columns: [it.name] }) !== null,
		})
	);
	const columnAlters = alters.filter((it) => it.entityType === 'columns').filter((it) => Object.keys(it).length > 5); // $difftype, entitytype, schema, table, name

	const columnsToRecreate = columnAlters.filter((it) => it.generated).filter((it) => {
		// if push and definition changed
		return !(it.generated?.to && it.generated.from && type === 'push');
	});

	const jsonRecreateColumns = columnsToRecreate.map((it) =>
		prepareStatement('recreate_column', {
			column: ddl2.columns.one({ schema: it.schema, table: it.table, name: it.name })!,
			isPK: ddl2.pks.one({ schema: it.schema, table: it.table, columns: [it.name] }) !== null,
		})
	);

	const jsonAlterColumns = columnAlters.filter((it) => !(it.generated)).map((it) => {
		const column = ddl2.columns.one({ name: it.name, table: it.table })!;
		const pk = ddl2.pks.one({ table: it.table });
		const isPK = pk && pk.columns.length === 1 && pk.columns[0] === column.name;

		return prepareStatement('alter_column', {
			diff: it,
			column,
			isPK: isPK ?? false,
		});
	});

	const jsonAddPrimaryKeys = pksCreates.filter(tablesFilter('created')).map((it) =>
		prepareStatement('create_pk', { pk: it })
	);

	const jsonDropPrimaryKeys = pksDeletes.filter(tablesFilter('deleted')).map((it) =>
		prepareStatement('drop_pk', { pk: it })
	);

	const jsonRenamePrimaryKeys = pksRenames.map((it) => prepareStatement('rename_pk', { from: it.from, to: it.to }));

	const jsonAddedUniqueConstraints = uniqueCreates.filter(tablesFilter('created')).map((it) =>
		prepareStatement('add_unique', { unique: it })
	);

	const jsonDeletedUniqueConstraints = uniqueDeletes.filter(tablesFilter('deleted')).map((it) =>
		prepareStatement('drop_unique', { unique: it })
	);

	const jsonRenameUniqueConstraints = uniqueRenames.map((it) =>
		prepareStatement('rename_unique', { from: it.from, to: it.to })
	);

	const jsonSetTableSchemas = movedTables.map((it) =>
		prepareStatement('move_table', {
			name: it.to.name, // raname of table comes first
			from: it.from.schema,
			to: it.to.schema,
		})
	);

	const jsonCreatedCheckConstraints = checkCreates.filter(tablesFilter('created')).map((it) =>
		prepareStatement('add_check', { check: it })
	);
	const jsonDeletedCheckConstraints = checkDeletes.filter(tablesFilter('deleted')).map((it) =>
		prepareStatement('drop_check', { check: it })
	);
	const jsonRenamedCheckConstraints = checkRenames.map((it) =>
		prepareStatement('rename_check', { from: it.from, to: it.to })
	);

	// group by tables?
	const alteredPKs = alters.filter((it) => it.entityType === 'pks').filter((it) => {
		return !!it.columns; // ignore explicit name change
	});

	const alteredChecks = alters.filter((it) => it.entityType === 'checks');

	const jsonAlteredPKs = alteredPKs.map((it) => {
		const pk = ddl2.pks.one({ schema: it.schema, table: it.table, name: it.name })!;
		return prepareStatement('alter_pk', { diff: it, pk });
	});

	const jsonCreateReferences = fksCreates.map((it) => prepareStatement('create_fk', { fk: it }));
	const jsonDropReferences = fksDeletes.map((it) => prepareStatement('drop_fk', { fk: it }));

	const jsonAlteredCheckConstraints = alteredChecks.map((it) => prepareStatement('alter_check', { diff: it }));

	const createViews = createdViews.map((it) => prepareStatement('create_view', { view: it }));

	const jsonDropViews = deletedViews.map((it) => prepareStatement('drop_view', { view: it }));

	const jsonRenameViews = renamedViews.map((it) => prepareStatement('rename_view', it));

	const jsonMoveViews = movedViews.map((it) =>
		prepareStatement('move_view', { fromSchema: it.from.schema, toSchema: it.to.schema, view: it.to })
	);

	const filteredViewAlters = alters.filter((it) => it.entityType === 'views').map((it) => {
		if (it.definition && type === 'push') {
			delete it.definition;
		}
		return it;
	});

	const viewsAlters = filteredViewAlters.map((it) => {
		const view = ddl2.views.one({ schema: it.schema, name: it.name })!;
		return { diff: it, view };
	});

	const jsonAlterViews = viewsAlters.filter((it) => !it.diff.definition).map((it) => {
		return prepareStatement('alter_view', {
			diff: it.diff,
			view: it.view,
		});
	});

	const jsonRecreateViews = viewsAlters.filter((it) => it.diff.definition).map((entry) => {
		const it = entry.view;
		const schemaRename = renamedSchemas.find((r) => r.to.name === it.schema);
		const schema = schemaRename ? schemaRename.from.name : it.schema;
		const viewRename = renamedViews.find((r) => r.to.schema === it.schema && r.to.name === it.name);
		const name = viewRename ? viewRename.from.name : it.name;
		const from = ddl1Copy.views.one({ schema, name });

		if (!from) {
			throw new Error(`
				Missing view in original ddl:
				${it.schema}:${it.name}
				${schema}:${name}
				`);
		}
		return prepareStatement('recreate_view', { from, to: it });
	});

	jsonStatements.push(...createSchemas);
	jsonStatements.push(...renameSchemas);

	jsonStatements.push(...createTables);

	jsonStatements.push(...jsonDropViews);
	jsonStatements.push(...jsonRenameViews);
	jsonStatements.push(...jsonMoveViews);
	jsonStatements.push(...jsonRecreateViews);
	jsonStatements.push(...jsonAlterViews);

	jsonStatements.push(...jsonDropTables);
	jsonStatements.push(...jsonRenameTables);
	jsonStatements.push(...jsonSetTableSchemas);
	jsonStatements.push(...jsonRenameColumnsStatements);

	jsonStatements.push(...jsonDeletedUniqueConstraints);
	jsonStatements.push(...jsonDeletedCheckConstraints);
	jsonStatements.push(...jsonDropReferences);
	jsonStatements.push(...jsonDropDefaults);

	// Will need to drop indexes before changing any columns in table
	// Then should go column alternations and then index creation
	jsonStatements.push(...jsonDropIndexes);
	jsonStatements.push(...jsonDropPrimaryKeys);

	jsonStatements.push(...jsonAddColumnsStatemets);
	jsonStatements.push(...jsonRecreateColumns);
	jsonStatements.push(...jsonAlterColumns);
	jsonStatements.push(...jsonAddPrimaryKeys);
	jsonStatements.push(...jsonRenamePrimaryKeys);

	jsonStatements.push(...jsonCreateReferences);
	jsonStatements.push(...jsonCreateDefaults);
	jsonStatements.push(...jsonRenameFks);
	jsonStatements.push(...jsonCreateIndexes);
	jsonStatements.push(...jsonRenameIndex);

	jsonStatements.push(...jsonDropColumnsStatemets);
	jsonStatements.push(...jsonAlteredPKs);

	jsonStatements.push(...jsonAlteredCheckConstraints);
	jsonStatements.push(...jsonAddedUniqueConstraints);
	jsonStatements.push(...jsonCreatedCheckConstraints);
	jsonStatements.push(...jsonRenamedCheckConstraints);
	jsonStatements.push(...jsonRenameUniqueConstraints);
	jsonStatements.push(...jsonRenameDefaults);

	jsonStatements.push(...createViews);

	jsonStatements.push(...dropSchemas);

	const { groupedStatements, sqlStatements } = fromJson(jsonStatements);

	const renames = prepareMigrationRenames([
		...renameSchemas,
		...renamedOrMovedTables,
		...columnRenames,
		...uniqueRenames,
		...checkRenames,
		...indexesRenames,
		...pksRenames,
		...fksRenames,
		...renamedOrMovedViews,
	]);

	return {
		statements: jsonStatements,
		sqlStatements,
		groupedStatements: groupedStatements,
		renames: renames,
	};
};
