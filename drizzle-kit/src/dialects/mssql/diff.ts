import { prepareMigrationRenames, trimChar } from '../../utils';
import { mockResolver } from '../../utils/mocks';
import type { Resolver } from '../common';
import { diff } from '../dialect';
import { groupDiffs, preserveEntityNames } from '../utils';
import { fromJson } from './convertor';
import type {
	CheckConstraint,
	Column,
	DefaultConstraint,
	DiffEntities,
	ForeignKey,
	Index,
	MssqlDDL,
	MssqlEntities,
	PrimaryKey,
	Schema,
	UniqueConstraint,
	View,
} from './ddl';
import { createDDL, fullTableFromDDL } from './ddl';
import { typesCommutative } from './grammar';
import type { JsonStatement } from './statements';
import { prepareStatement } from './statements';

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
	mode: 'default' | 'push',
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

		ddl1.fks.update({
			set: {
				schemaTo: rename.to.schema,
				tableTo: rename.to.name,
			},
			where: {
				schemaTo: rename.from.schema,
				tableTo: rename.from.name,
			},
		});
		ddl1.fks.update({
			set: {
				schema: rename.to.schema,
				table: rename.to.name,
			},
			where: {
				schema: rename.from.schema,
				table: rename.from.name,
			},
		});

		ddl1.entities.update({
			set: {
				table: rename.to.name,
				schema: rename.to.schema,
			},
			where: {
				table: rename.from.name,
				schema: rename.from.schema,
			},
		});
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

		ddl1.fks.update({
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
		ddl1.fks.update({
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

		ddl1.uniques.update({
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

		ddl1.defaults.update({
			set: { column: rename.to.name },
			where: {
				schema: rename.from.schema,
				table: rename.from.table,
				column: rename.from.name,
			},
		});

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

	preserveEntityNames(ddl1.uniques, ddl2.uniques, mode);
	preserveEntityNames(ddl1.fks, ddl2.fks, mode);
	preserveEntityNames(ddl1.pks, ddl2.pks, mode);
	preserveEntityNames(ddl1.defaults, ddl2.defaults, mode);

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
	const defaultsCreates: DefaultConstraint[] = diffDefaults.filter((it) => it.$diffType === 'create').map((it) => ({
		...it,
		$diffType: undefined,
	}));
	const defaultsDeletes: DefaultConstraint[] = diffDefaults.filter((it) => it.$diffType === 'drop').map((it) => ({
		...it,
		$diffType: undefined,
	}));

	// TODO for now drizzle-orm does not provides passing names for defaults
	// for (const entry of groupedDefaultsDiff) {
	// 	const { renamedOrMoved, created, deleted } = await defaultsResolver({
	// 		created: entry.inserted,
	// 		deleted: entry.deleted,
	// 	});

	// 	defaultsCreates.push(...created);
	// 	defaultsDeletes.push(...deleted);
	// 	defaultsRenames.push(...renamedOrMoved);
	// }
	// for (const rename of defaultsRenames) {
	// 	ddl1.defaults.update({
	// 		set: {
	// 			name: rename.to.name,
	// 			schema: rename.to.schema,
	// 		},
	// 		where: {
	// 			name: rename.from.name,
	// 			schema: rename.from.schema,
	// 		},
	// 	});
	// }

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

	const columnsFilter = (_type: 'added') => {
		return (it: { schema: string; table: string; column: string }) => {
			return !columnsToCreate.some((t) => t.schema === it.schema && t.table === it.table && t.name === it.column);
		};
	};

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
	const jsonAddColumnsStatemets = columnsToCreate.filter(tablesFilter('created')).map((it) => {
		const isPK = ddl2.pks.one({ schema: it.schema, table: it.table, columns: { CONTAINS: it.name } }) !== null;
		return prepareStatement('add_column', {
			column: it,
			defaults: ddl2.defaults.list(),
			isPK,
		});
	});
	const columnAlters = alters.filter((it) => it.entityType === 'columns').filter((it) => Object.keys(it).length > 5); // $difftype, entitytype, schema, table, name

	const columnsToRecreate = columnAlters.filter((it) => it.generated).filter((it) => {
		return !(mode === 'push' && it.generated && it.generated.from && it.generated.to
			&& it.generated.from.as !== it.generated.to.as && it.generated.from.type === it.generated.to.type);
	});

	const jsonRecreateColumns = columnsToRecreate.map((it) =>
		prepareStatement('recreate_column', {
			diff: it,
		})
	);

	// identity alters are not allowed, only recreate
	const jsonAlterColumns = columnAlters.filter((it) => !(it.generated) && !(it.identity)).filter((it) => {
		if (it.notNull && (it.$right.generated || it.$right.identity)) {
			delete it.notNull;
		}

		if (it.type && typesCommutative(it.type.from, it.type.to, mode)) {
			delete it.type;
		}

		// const pkIn2 = ddl2.pks.one({ schema: it.schema, table: it.table, columns: { CONTAINS: it.name } });
		// When adding primary key to column it is needed to add not null first
		// if (it.notNull && pkIn2) {
		// 	delete it.notNull;
		// }

		// const pkIn1 = ddl1.pks.one({ schema: it.schema, table: it.table, columns: { CONTAINS: it.name } });
		// if (it.notNull && it.notNull.from && pkIn1 && !pkIn2) {
		// 	delete it.notNull;
		// }

		if ((it.$right.generated || it.$left.generated) && it.$right.type !== it.$left.type) {
			delete it.type;
		}

		return ddl2.columns.hasDiff(it);
	}).map(
		(it) => {
			return prepareStatement('alter_column', {
				diff: it,
			});
		},
	);

	const jsonSetTableSchemas = movedTables.map((it) =>
		prepareStatement('move_table', {
			name: it.to.name, // raname of table comes first
			from: it.from.schema,
			to: it.to.schema,
		})
	);

	const jsonRecreateIdentityColumns = columnAlters.filter((it) => it.identity).map((column) => {
		const checksToCreate = ddl2.checks.list({
			schema: column.schema,
			table: column.table,
		});
		const uniquesToCreate = ddl2.uniques.list({
			schema: column.schema,
			table: column.table,
			columns: {
				CONTAINS: column.name,
			},
		});
		const pksToCreate = ddl2.pks.list({
			schema: column.schema,
			table: column.table,
			columns: {
				CONTAINS: column.name,
			},
		});
		const defToCreate = ddl2.defaults.list({
			schema: column.schema,
			table: column.table,
			column: column.name,
		});
		const fk1ToCreate = ddl2.fks.list({
			schema: column.schema,
			table: column.table,
			columns: { CONTAINS: column.name },
		});
		const fk2ToCreate = ddl2.fks.list({
			schemaTo: column.schema,
			tableTo: column.table,
			columnsTo: { CONTAINS: column.name },
		});
		const indexesToCreate = ddl2.indexes.list({
			schema: column.schema,
			table: column.table,
		}).filter((index) => index.columns.some((x) => trimChar(trimChar(x.value, '['), ']') === column.name));

		const checksToDelete = ddl1.checks.list({
			schema: column.schema,
			table: column.table,
		});
		const uniquesToDelete = ddl1.uniques.list({
			schema: column.schema,
			table: column.table,
			columns: {
				CONTAINS: column.name,
			},
		});
		const pksToDelete = ddl1.pks.list({
			schema: column.schema,
			table: column.table,
			columns: {
				CONTAINS: column.name,
			},
		});
		const defToDelete = ddl1.defaults.list({
			schema: column.schema,
			table: column.table,
			column: column.name,
		});
		const fk1ToDelete = ddl1.fks.list({
			schema: column.schema,
			table: column.table,
			columns: { CONTAINS: column.name },
		});
		const fk2ToDelete = ddl1.fks.list({
			schemaTo: column.schema,
			tableTo: column.table,
			columnsTo: { CONTAINS: column.name },
		});
		const indexesToDelete = ddl1.indexes.list({
			schema: column.schema,
			table: column.table,
		}).filter((index) => index.columns.some((x) => trimChar(trimChar(x.value, '['), ']') === column.name));

		return prepareStatement('recreate_identity_column', {
			column: column,
			constraintsToCreate: [
				...checksToCreate,
				...uniquesToCreate,
				...pksToCreate,
				...defToCreate,
				...fk1ToCreate,
				...fk2ToCreate,
				...indexesToCreate,
			],
			constraintsToDelete: [
				...checksToDelete,
				...fk1ToDelete,
				...fk2ToDelete,
				...uniquesToDelete,
				...pksToDelete,
				...defToDelete,
				...indexesToDelete,
			],
			defaults: ddl2.defaults.list(),
		});
	});

	// filter identity
	const checkIdentityFilter = (type: 'created' | 'deleted') => {
		return (it: CheckConstraint | DiffEntities['checks']) => {
			return !jsonRecreateIdentityColumns.some((column) => {
				const constraints = type === 'created' ? column.constraintsToCreate : column.constraintsToDelete;

				return constraints.some((constraint) =>
					constraint.entityType === 'checks'
					&& constraint.name === it.name
					&& constraint.table === it.table
					&& constraint.schema === it.schema
				);
			});
		};
	};
	const jsonCreatedCheckConstraints = checkCreates.filter(tablesFilter('created')).filter(
		checkIdentityFilter('created'),
	).map((
		it,
	) => prepareStatement('add_check', { check: it }));
	const jsonDeletedCheckConstraints = checkDeletes.filter(tablesFilter('deleted')).filter(
		checkIdentityFilter('deleted'),
	).map((
		it,
	) => prepareStatement('drop_check', { check: it }));
	const jsonRenamedCheckConstraints = checkRenames.map((it) =>
		prepareStatement('rename_check', { from: it.from, to: it.to })
	);

	const filteredChecksAlters = alters.filter((it) => it.entityType === 'checks').filter(
		(it): it is DiffEntities['checks'] => {
			if (it.entityType !== 'checks') return false;

			if (it.value && mode === 'push') {
				delete it.value;
			}

			return ddl2.checks.hasDiff(it);
		},
	);

	const alteredChecks = filteredChecksAlters.filter(checkIdentityFilter('created')).filter(
		checkIdentityFilter('deleted'),
	);
	alteredChecks.forEach((it) => {
		jsonCreatedCheckConstraints.push(prepareStatement('add_check', { check: it.$right }));
		jsonDeletedCheckConstraints.push(prepareStatement('drop_check', { check: it.$left }));
	});

	// filter identity
	const uniquesIdentityFilter = (type: 'created' | 'deleted') => {
		return (it: UniqueConstraint) => {
			return !jsonRecreateIdentityColumns.some((column) => {
				const constraints = type === 'created' ? column.constraintsToCreate : column.constraintsToDelete;

				return constraints.some((constraint) =>
					constraint.entityType === 'uniques'
					&& constraint.name === it.name
					&& constraint.table === it.table
					&& constraint.schema === it.schema
				);
			});
		};
	};
	const jsonAddedUniqueConstraints = uniqueCreates.filter(tablesFilter('created')).filter(
		uniquesIdentityFilter('created'),
	).map((it) => prepareStatement('add_unique', { unique: it }));
	const jsonDeletedUniqueConstraints = uniqueDeletes.filter(tablesFilter('deleted')).filter(
		uniquesIdentityFilter('deleted'),
	).map((it) => {
		return prepareStatement('drop_unique', { unique: it });
	});
	const jsonRenameUniqueConstraints = uniqueRenames.map((it) =>
		prepareStatement('rename_unique', { from: it.from, to: it.to })
	);

	// filter identity
	const primaryKeysIdentityFilter = (type: 'created' | 'deleted') => {
		return (it: PrimaryKey | DiffEntities['pks']) => {
			return !jsonRecreateIdentityColumns.some((column) => {
				const constraints = type === 'created' ? column.constraintsToCreate : column.constraintsToDelete;

				return constraints.some((constraint) =>
					constraint.entityType === 'pks'
					&& constraint.name === it.name
					&& constraint.table === it.table
					&& constraint.schema === it.schema
				);
			});
		};
	};
	const jsonAddPrimaryKeys = pksCreates.filter(tablesFilter('created')).filter(primaryKeysIdentityFilter('created'))
		.map((it) => prepareStatement('create_pk', { pk: it }));
	const jsonDropPrimaryKeys = pksDeletes.filter(tablesFilter('deleted')).filter(primaryKeysIdentityFilter('deleted'))
		.map((it) => prepareStatement('drop_pk', { pk: it }));
	const jsonRenamePrimaryKeys = pksRenames.map((it) => prepareStatement('rename_pk', { from: it.from, to: it.to }));
	const alteredPKs = alters.filter((it) => it.entityType === 'pks').filter((it) => {
		return !!it.columns;
	});
	alteredPKs.filter(primaryKeysIdentityFilter('deleted')).filter(primaryKeysIdentityFilter('deleted')).forEach((it) => {
		jsonAddPrimaryKeys.push({ pk: it.$right, type: 'create_pk' });
		jsonDropPrimaryKeys.push({ pk: it.$left, type: 'drop_pk' });
	});

	// filter identity
	const defaultsIdentityFilter = (type: 'created' | 'deleted') => {
		return (it: DefaultConstraint | DiffEntities['defaults']) => {
			return !jsonRecreateIdentityColumns.some((column) => {
				const constraints = type === 'created' ? column.constraintsToCreate : column.constraintsToDelete;

				return constraints.some((constraint) =>
					constraint.entityType === 'defaults'
					&& constraint.name === it.name
					&& constraint.table === it.table
					&& constraint.schema === it.schema
				);
			});
		};
	};
	const jsonCreateDefaults = defaultsCreates.filter(tablesFilter('created'))
		.filter(columnsFilter('added'))
		.filter(
			defaultsIdentityFilter('created'),
		)
		.map((defaultValue) =>
			prepareStatement('create_default', {
				default: defaultValue,
			})
		);
	const jsonDropDefaults = defaultsDeletes.filter(tablesFilter('deleted'))
		.filter(defaultsIdentityFilter('deleted'))
		.map((defaultValue) => prepareStatement('drop_default', { default: defaultValue }));
	const alteredDefaults = alters.filter((it) => it.entityType === 'defaults')
		.filter((it) => {
			if (it.nameExplicit) {
				delete it.nameExplicit;
			}

			if (it.default) {
				let deleteDefault = false;
				deleteDefault ||= it.default.from === it.default.to;

				const column = ddl2.columns.one({ name: it.column?.to, schema: it.schema, table: it.table })!;
				const numbers = ['bigint', 'decimal', 'numeric', 'real', 'float'];

				// When user defined value in drizzle sql that is bigger than `max mssql integer` it will be stored with dot
				// 1. === 1 (same values in mssql)
				// For commutativity replace all this
				// For .default this will be handled automatically via introspection, but this is for drizzlesql cases
				if (numbers.find((it) => column.type.startsWith(it)) && it.default.from && it.default.to) {
					it.default.from = it.default.from.replace('.)', ')').replace(".'", "'");
					it.default.to = it.default.to.replace('.)', ')').replace(".'", "'");
					deleteDefault ||= it.default.from === it.default.to;
				}

				// any literal number from drizzle sql is parsed as (<number>), not ((<number>)) as from .default
				// this will cause diff, but still (10) === ((10))
				deleteDefault ||= it.default.from === `(${it.default.to})`; // for drizzle sql numbers: (<number>) === ((<number>))
				deleteDefault ||= it.default.to === `(${it.default.from})`; // for drizzle sql numbers: (<number>) === ((<number>))

				if (deleteDefault) {
					delete it.default;
				}
			}

			return ddl2.defaults.hasDiff(it);
		})
		.filter(defaultsIdentityFilter('created'))
		.filter(defaultsIdentityFilter('deleted'));
	const jsonRecreatedDefaults = alteredDefaults.map((it) =>
		prepareStatement('recreate_default', {
			from: it.$left,
			to: it.$right,
		})
	);

	// filter identity
	const fksIdentityFilter = (type: 'created' | 'deleted') => {
		return (it: ForeignKey | DiffEntities['fks']) => {
			return !jsonRecreateIdentityColumns.some((column) => {
				const constraints = type === 'created' ? column.constraintsToCreate : column.constraintsToDelete;

				return constraints.some((constraint) =>
					constraint.entityType === 'fks'
					&& constraint.name === it.name
					&& ((constraint.table === it.table && constraint.schema === it.schema)
						|| (constraint.schemaTo === it.schemaTo && it.tableTo === constraint.tableTo))
				);
			});
		};
	};
	const jsonCreateReferences = fksCreates.filter(fksIdentityFilter('created')).map((
		it,
	) => prepareStatement('create_fk', { fk: it }));

	const jsonDropReferences = fksDeletes.filter((x) => {
		const fromDeletedTable = ddl2.tables.one({ schema: x.schema, name: x.table }) === null;
		const toDeletedTable = (x.schema !== x.schemaTo
			|| x.tableTo !== x.table) && ddl2.tables.one({ schema: x.schemaTo, name: x.tableTo }) === null;
		if (fromDeletedTable && !toDeletedTable) return false;
		return true;
	}).filter(fksIdentityFilter('deleted')).map((it) => prepareStatement('drop_fk', { fk: it }));

	const jsonRenameReferences = fksRenames.map((it) =>
		prepareStatement('rename_fk', {
			from: it.from,
			to: it.to,
		})
	);
	alters.filter((it) => it.entityType === 'fks').filter((x) => {
		if (
			x.nameExplicit
			&& ((mode === 'push' && x.nameExplicit.from && !x.nameExplicit.to)
				|| x.nameExplicit.to && !x.nameExplicit.from)
		) {
			delete x.nameExplicit;
		}

		return ddl2.fks.hasDiff(x);
	}).filter(fksIdentityFilter('created')).filter(
		fksIdentityFilter('deleted'),
	).forEach((it) => {
		jsonDropReferences.push(prepareStatement('drop_fk', { fk: it.$left }));
		jsonCreateReferences.push(prepareStatement('create_fk', { fk: it.$right }));
	});

	// filter identity
	const indexesIdentityFilter = (type: 'created' | 'deleted') => {
		return (it: Index | DiffEntities['indexes']) => {
			return !jsonRecreateIdentityColumns.some((column) => {
				const constraints = type === 'created' ? column.constraintsToCreate : column.constraintsToDelete;

				return constraints.some((constraint) =>
					constraint.entityType === 'indexes'
					&& constraint.name === it.name
					&& constraint.table === it.table
					&& constraint.schema === it.schema
				);
			});
		};
	};
	const jsonCreateIndexes = indexesCreates.filter(indexesIdentityFilter('created')).map((index) =>
		prepareStatement('create_index', { index })
	);
	const jsonDropIndexes = indexesDeletes.filter(indexesIdentityFilter('deleted')).filter(tablesFilter('deleted')).map((
		index,
	) => prepareStatement('drop_index', { index }));
	const jsonRenameIndex = indexesRenames.map((it) => prepareStatement('rename_index', { from: it.from, to: it.to }));
	for (
		const idx of alters.filter((it) => it.entityType === 'indexes').filter(indexesIdentityFilter('created')).filter(
			indexesIdentityFilter('deleted'),
		)
	) {
		const forWhere = !!idx.where && (idx.where.from !== null && idx.where.to !== null ? mode !== 'push' : true);
		const forColumns = !!idx.columns && (idx.columns.from.length === idx.columns.to.length ? mode !== 'push' : true);

		// TODO recheck this
		if (idx.isUnique || forColumns || forWhere) {
			const index = ddl2.indexes.one({ schema: idx.schema, table: idx.table, name: idx.name })!;
			jsonDropIndexes.push(prepareStatement('drop_index', { index }));
			jsonCreateIndexes.push(prepareStatement('create_index', { index }));
		}
	}

	const createViews = createdViews.map((it) => prepareStatement('create_view', { view: it }));

	const jsonDropViews = deletedViews.map((it) => prepareStatement('drop_view', { view: it }));

	const jsonRenameViews = renamedViews.map((it) => prepareStatement('rename_view', it));

	const jsonMoveViews = movedViews.map((it) =>
		prepareStatement('move_view', { fromSchema: it.from.schema, toSchema: it.to.schema, view: it.to })
	);

	const filteredViewAlters = alters.filter((it): it is DiffEntities['views'] => {
		if (it.entityType !== 'views') return false;

		if (it.definition && mode === 'push' && !it.schemaBinding) {
			delete it.definition;
		}

		return ddl2.views.hasDiff(it);
	});
	const jsonAlterViews = filteredViewAlters.map((it) => {
		return prepareStatement('alter_view', {
			diff: it,
			view: ddl2.views.one({ schema: it.schema, name: it.name })!,
		});
	});

	jsonStatements.push(...createSchemas);
	jsonStatements.push(...renameSchemas);

	jsonStatements.push(...createTables);

	jsonStatements.push(...jsonDropViews);
	jsonStatements.push(...jsonRenameViews);
	jsonStatements.push(...jsonMoveViews);
	jsonStatements.push(...jsonAlterViews);
	jsonStatements.push(...jsonRecreatedDefaults);

	jsonStatements.push(...jsonRenameTables);
	jsonStatements.push(...jsonDropReferences);

	jsonStatements.push(...jsonDropTables);
	jsonStatements.push(...jsonSetTableSchemas);

	jsonStatements.push(...jsonDeletedCheckConstraints); // should be before renaming column
	jsonStatements.push(...jsonRenameColumnsStatements);

	jsonStatements.push(...jsonDeletedUniqueConstraints);
	jsonStatements.push(...jsonDropDefaults);

	// Will need to drop indexes before changing any columns in table
	// Then should go column alternations and then index creation
	jsonStatements.push(...jsonDropIndexes);
	jsonStatements.push(...jsonDropPrimaryKeys);

	jsonStatements.push(...jsonAddColumnsStatemets);
	jsonStatements.push(...jsonRecreateColumns);
	jsonStatements.push(...jsonRecreateIdentityColumns);
	jsonStatements.push(...jsonAlterColumns);
	jsonStatements.push(...jsonAddPrimaryKeys);
	jsonStatements.push(...jsonRenamePrimaryKeys);

	jsonStatements.push(...jsonCreateReferences);
	jsonStatements.push(...jsonCreateDefaults);
	jsonStatements.push(...jsonCreateIndexes);
	jsonStatements.push(...jsonRenameIndex);

	jsonStatements.push(...jsonDropColumnsStatemets);

	jsonStatements.push(...jsonAddedUniqueConstraints);
	jsonStatements.push(...jsonCreatedCheckConstraints);
	jsonStatements.push(...jsonRenamedCheckConstraints);
	jsonStatements.push(...jsonRenameUniqueConstraints);
	jsonStatements.push(...jsonRenameReferences);
	// jsonStatements.push(...jsonRenameDefaults);

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
