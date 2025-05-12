import { prepareMigrationRenames } from '../../utils';
import { mockResolver } from '../../utils/mocks';
import { diffStringArrays } from '../../utils/sequence-matcher';
import type { Resolver } from '../common';
import { diff } from '../dialect';
import { groupDiffs } from '../utils';
import { fromJson } from './convertor';
// import { fromJson } from './convertor';
import {
	CheckConstraint,
	Column,
	createDDL,
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
import { defaultNameForFK, defaultNameForIndex, defaultNameForPK, defaultNameForUnique } from './grammar';
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

		for (const fk of [...fks1, ...fks2].filter((it) => !it.nameExplicit)) {
			const name = defaultNameForFK(fk.table, fk.columns, fk.tableTo, fk.columnsTo);
			ddl2.fks.update({
				set: { name: fk.name },
				where: {
					schema: fk.schema,
					table: fk.table,
					name,
					nameExplicit: false,
				},
			});
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

		for (const it of res) {
			if (it.entityType === 'pks') {
				const name = defaultNameForPK(it.table);
				ddl2.pks.update({
					set: {
						name: it.name,
					},
					where: {
						schema: it.schema,
						table: it.table,
						name,
						nameExplicit: false,
					},
				});
			}
			if (it.entityType === 'uniques' && !it.nameExplicit && it.columns.length === 1) {
				const name = defaultNameForUnique(it.table, it.columns[0]);
				ddl2.uniques.update({
					set: {
						name: it.name,
					},
					where: {
						schema: it.schema,
						table: it.table,
						name,
						nameExplicit: false,
					},
				});
			}

			if (it.entityType === 'indexes' && !it.nameExplicit) {
				const name = defaultNameForIndex(it.table, it.columns.map((c) => c.value));
				ddl2.indexes.update({
					set: {
						name: it.name,
					},
					where: {
						schema: it.schema,
						table: it.table,
						name,
						nameExplicit: false,
					},
				});
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

		const indexes = ddl1.indexes.update({
			set: {
				columns: (it) => {
					if (!it.isExpression && it.value === rename.from.name) {
						return { ...it, value: rename.to.name };
					}
					return it;
				},
			},
			where: {
				schema: rename.from.schema,
				table: rename.from.table,
				name: rename.from.name,
			},
		});

		for (const it of indexes.filter((it) => !it.nameExplicit)) {
			const name = defaultNameForIndex(it.table, it.columns.map((c) => c.value));
			ddl2.indexes.update({
				set: {
					name: it.name,
				},
				where: {
					schema: it.schema,
					table: it.table,
					name,
					nameExplicit: false,
				},
			});
		}

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

		for (const fk of [...fks1, ...fks2].filter((it) => !it.nameExplicit)) {
			const name = defaultNameForFK(fk.table, fk.columns, fk.tableTo, fk.columnsTo);
			ddl2.fks.update({
				set: { name: fk.name },
				where: {
					schema: fk.schema,
					table: fk.table,
					name,
					nameExplicit: false,
				},
			});
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

		for (const it of uniques.filter((it) => !it.nameExplicit)) {
			const name = defaultNameForUnique(it.table, it.columns[0]);
			ddl2.uniques.update({
				set: {
					name: it.name,
				},
				where: {
					schema: it.schema,
					table: it.table,
					name,
					nameExplicit: false,
				},
			});
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

	const uniqueRenames = [] as { from: UniqueConstraint; to: UniqueConstraint }[];
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
	const checkRenames = [] as { from: CheckConstraint; to: CheckConstraint }[];
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
	const pksRenames = [] as { from: PrimaryKey; to: PrimaryKey }[];
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
	const fksRenames = [] as { from: ForeignKey; to: ForeignKey }[];
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

	for (const idx of alters.filter((it) => it.entityType === 'indexes')) {
		const forWhere = !!idx.where && (idx.where.from !== null && idx.where.to !== null ? type !== 'push' : true);
		const forColumns = !!idx.columns && (idx.columns.from.length === idx.columns.to.length ? type !== 'push' : true);

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
	const columnAlters = alters.filter((it) => it.entityType === 'columns').map((it) => {
		if (it.default && it.default.from?.value === it.default.to?.value) {
			delete it.default;
		}
		return it;
	}).filter((it) => Object.keys(it).length > 5); // $difftype, entitytype, schema, table, name

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

	// TODO
	// const alteredUniques = alters.filter((it) => it.entityType === 'uniques').map((it) => {
	// 	if (it.nameExplicit) {
	// 		delete it.nameExplicit;
	// 	}
	// 	return it;
	// }).filter((it) => Object.keys(it).length > 5); // $difftype, entitytype, schema, table, name

	// TODO
	// const jsonAlteredUniqueConstraints = alteredUniques.map((it) => prepareStatement('alter_unique', { diff: it }));

	const jsonAddedUniqueConstraints = uniqueCreates.filter(tablesFilter('created')).map((it) =>
		prepareStatement('add_unique', { unique: it })
	);

	const jsonDeletedUniqueConstraints = uniqueDeletes.filter(tablesFilter('deleted')).map((it) =>
		prepareStatement('drop_unique', { unique: it })
	);

	// TODO
	// const jsonRenamedUniqueConstraints = uniqueRenames.map((it) =>
	// 	prepareStatement('rename_constraint', {
	// 		schema: it.to.schema,
	// 		table: it.to.table,
	// 		from: it.from.name,
	// 		to: it.to.name,
	// 	})
	// );

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

	// group by tables?
	const alteredPKs = alters.filter((it) => it.entityType === 'pks').filter((it) => {
		return !!it.columns; // ignore explicit name change
	});
	// TODO:
	// const alteredFKs = alters.filter((it) => it.entityType === 'fks');
	const alteredChecks = alters.filter((it) => it.entityType === 'checks');

	const jsonAlteredPKs = alteredPKs.map((it) => {
		const pk = ddl2.pks.one({ schema: it.schema, table: it.table, name: it.name })!;
		return prepareStatement('alter_pk', { diff: it, pk });
	});

	const jsonCreateReferences = fksCreates.map((it) => prepareStatement('create_fk', { fk: it }));
	const jsonDropReferences = fksDeletes.map((it) => prepareStatement('drop_fk', { fk: it }));
	// TODO:
	// const jsonRenameReferences = fksRenames.map((it) =>
	// 	prepareStatement('rename_constraint', {
	// 		schema: it.to.schema,
	// 		table: it.to.table,
	// 		from: it.from.name,
	// 		to: it.to.name,
	// 	})
	// );
	// TODO:
	const jsonAlteredCheckConstraints = alteredChecks.map((it) => prepareStatement('alter_check', { diff: it }));

	// const recreateEnums = [] as Extract<JsonStatement, { type: 'recreate_enum' }>[];
	// const jsonAlterEnums = [] as Extract<JsonStatement, { type: 'alter_enum' }>[];

	const createViews = createdViews.filter((it) => !it.isExisting).map((it) =>
		prepareStatement('create_view', { view: it })
	);

	const jsonDropViews = deletedViews.filter((it) => !it.isExisting).map((it) =>
		prepareStatement('drop_view', { view: it })
	);

	const jsonRenameViews = renamedViews.filter((it) => !it.to.isExisting).map((it) =>
		prepareStatement('rename_view', it)
	);

	const jsonMoveViews = movedViews.filter((it) => !it.to.isExisting).map((it) =>
		prepareStatement('move_view', { fromSchema: it.from.schema, toSchema: it.to.schema, view: it.to })
	);

	const filteredViewAlters = alters.filter((it) => it.entityType === 'views').map((it) => {
		if (it.definition && type === 'push') {
			delete it.definition;
		}
		return it;
	}).filter((it) => !(it.isExisting && it.isExisting.to));

	const viewsAlters = filteredViewAlters.map((it) => {
		const view = ddl2.views.one({ schema: it.schema, name: it.name })!;
		return { diff: it, view };
	}).filter((it) => !it.view.isExisting);

	const jsonAlterViews = viewsAlters.filter((it) => !it.diff.definition).map((it) => {
		return prepareStatement('alter_view', {
			diff: it.diff,
			view: it.view,
		});
	});

	const jsonRecreateViews = viewsAlters.filter((it) => it.diff.definition || it.diff.isExisting).map((entry) => {
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
	// jsonStatements.push(...jsonDroppedReferencesForAlteredTables); // TODO: check

	// Will need to drop indexes before changing any columns in table
	// Then should go column alternations and then index creation
	jsonStatements.push(...jsonDropIndexes);
	jsonStatements.push(...jsonDropPrimaryKeys);

	// jsonStatements.push(...jsonTableAlternations); // TODO: check

	jsonStatements.push(...jsonAddPrimaryKeys);
	jsonStatements.push(...jsonAddColumnsStatemets);
	jsonStatements.push(...jsonRecreateColumns);
	jsonStatements.push(...jsonAlterColumns);

	// jsonStatements.push(...jsonCreateReferencesForCreatedTables); // TODO: check
	jsonStatements.push(...jsonCreateReferences);
	jsonStatements.push(...jsonCreateIndexes);

	// jsonStatements.push(...jsonCreatedReferencesForAlteredTables); // TODO: check

	jsonStatements.push(...jsonDropColumnsStatemets);
	jsonStatements.push(...jsonAlteredPKs);

	// jsonStatements.push(...jsonRenamedUniqueConstraints);
	jsonStatements.push(...jsonAlteredCheckConstraints);
	jsonStatements.push(...jsonAddedUniqueConstraints);
	jsonStatements.push(...jsonCreatedCheckConstraints);

	// jsonStatements.push(...jsonAlteredUniqueConstraints);
	// jsonStatements.push(...jsonAlterEnumsWithDroppedValues); // TODO: check

	jsonStatements.push(...createViews);

	jsonStatements.push(...dropSchemas);

	// generate filters
	// const filteredJsonStatements = jsonStatements.filter((st) => {
	// 	if (st.type === 'alter_table_alter_column_drop_notnull') {
	// 		if (
	// 			jsonStatements.find(
	// 				(it) =>
	// 					it.type === 'alter_table_alter_column_drop_identity'
	// 					&& it.tableName === st.tableName
	// 					&& it.schema === st.schema,
	// 			)
	// 		) {
	// 			return false;
	// 		}
	// 	}
	// 	if (st.type === 'alter_table_alter_column_set_notnull') {
	// 		if (
	// 			jsonStatements.find(
	// 				(it) =>
	// 					it.type === 'alter_table_alter_column_set_identity'
	// 					&& it.tableName === st.tableName
	// 					&& it.schema === st.schema,
	// 			)
	// 		) {
	// 			return false;
	// 		}
	// 	}
	// 	return true;
	// });

	// // enum filters
	// // Need to find add and drop enum values in same enum and remove add values
	// const filteredEnumsJsonStatements = filteredJsonStatements.filter((st) => {
	// 	if (st.type === 'alter_type_add_value') {
	// 		if (
	// 			jsonStatements.find(
	// 				(it) =>
	// 					it.type === 'alter_type_drop_value'
	// 					&& it.name === st.name
	// 					&& it.schema === st.schema,
	// 			)
	// 		) {
	// 			return false;
	// 		}
	// 	}
	// 	return true;
	// });

	// Sequences
	// - create sequence ✅
	// - create sequence inside schema ✅
	// - rename sequence ✅
	// - change sequence schema ✅
	// - change sequence schema + name ✅
	// - drop sequence - check if sequence is in use. If yes - ???
	// - change sequence values ✅

	// Generated columns
	// - add generated
	// - drop generated
	// - create table with generated
	// - alter - should be not triggered, but should get warning

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
