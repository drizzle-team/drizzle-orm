import { prepareMigrationRenames } from '../../utils';
import { mockResolver } from '../../utils/mocks';
import { diffStringArrays } from '../../utils/sequence-matcher';
import type { Resolver } from '../common';
import { diff } from '../dialect';
import { groupDiffs } from '../utils';
import { fromJson } from './convertor';
import {
	CheckConstraint,
	Column,
	createDDL,
	Enum,
	ForeignKey,
	Index,
	Policy,
	PostgresDDL,
	PostgresEntities,
	PrimaryKey,
	Role,
	Schema,
	Sequence,
	tableFromDDL,
	UniqueConstraint,
	View,
} from './ddl';
import { defaultNameForFK, defaultNameForIndex, defaultNameForPK, defaultNameForUnique } from './grammar';
import { JsonStatement, prepareStatement } from './statements';

export const ddlDiffDry = async (ddlFrom: PostgresDDL, ddlTo: PostgresDDL, mode: 'default' | 'push') => {
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
		mockResolver(mocks),
		mockResolver(mocks),
		mockResolver(mocks),
		mode,
	);
};

export const ddlDiff = async (
	ddl1: PostgresDDL,
	ddl2: PostgresDDL,
	schemasResolver: Resolver<Schema>,
	enumsResolver: Resolver<Enum>,
	sequencesResolver: Resolver<Sequence>,
	policyResolver: Resolver<Policy>,
	roleResolver: Resolver<Role>,
	tablesResolver: Resolver<PostgresEntities['tables']>,
	columnsResolver: Resolver<Column>,
	viewsResolver: Resolver<View>,
	uniquesResolver: Resolver<UniqueConstraint>,
	indexesResolver: Resolver<Index>,
	checksResolver: Resolver<CheckConstraint>,
	pksResolver: Resolver<PrimaryKey>,
	fksResolver: Resolver<ForeignKey>,
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

	const enumsDiff = diff(ddl1, ddl2, 'enums');
	const {
		created: createdEnums,
		deleted: deletedEnums,
		renamedOrMoved: renamedOrMovedEnums,
	} = await enumsResolver({
		created: enumsDiff.filter((it) => it.$diffType === 'create'),
		deleted: enumsDiff.filter((it) => it.$diffType === 'drop'),
	});

	const renamedEnums = renamedOrMovedEnums.filter((it) => it.from.name !== it.to.name);
	const movedEnums = renamedOrMovedEnums.filter((it) => it.from.schema !== it.to.schema);

	for (const rename of renamedEnums) {
		ddl1.enums.update({
			set: {
				name: rename.to.name,
				schema: rename.to.schema,
			},
			where: {
				name: rename.from.name,
				schema: rename.from.schema,
			},
		});
		ddl1.columns.update({
			set: {
				type: rename.to.name,
				typeSchema: rename.to.schema,
			},
			where: {
				type: rename.from.name,
				typeSchema: rename.from.schema,
			},
		});
	}
	for (const move of movedEnums) {
		ddl1.enums.update({
			set: {
				schema: move.to.schema,
			},
			where: {
				name: move.from.name,
				schema: move.from.schema,
			},
		});
		ddl1.columns.update({
			set: {
				typeSchema: move.to.schema,
			},
			where: {
				type: move.from.name,
				typeSchema: move.from.schema,
			},
		});
	}

	const sequencesDiff = diff(ddl1, ddl2, 'sequences');
	const {
		created: createdSequences,
		deleted: deletedSequences,
		renamedOrMoved: renamedOrMovedSequences,
	} = await sequencesResolver({
		created: sequencesDiff.filter((it) => it.$diffType === 'create'),
		deleted: sequencesDiff.filter((it) => it.$diffType === 'drop'),
	});

	const renamedSequences = renamedOrMovedSequences.filter((it) => it.from.schema === it.to.schema);
	const movedSequences = renamedOrMovedSequences.filter((it) => it.from.schema !== it.to.schema);

	for (const rename of renamedSequences) {
		ddl1.sequences.update({
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

	for (const move of movedSequences) {
		ddl1.sequences.update({
			set: {
				schema: move.to.schema,
			},
			where: {
				name: move.from.name,
				schema: move.from.schema,
			},
		});
	}

	const rolesDiff = diff(ddl1, ddl2, 'roles');

	const {
		created: createdRoles,
		deleted: deletedRoles,
		renamedOrMoved: renamedRoles,
	} = await roleResolver({
		created: rolesDiff.filter((it) => it.$diffType === 'create'),
		deleted: rolesDiff.filter((it) => it.$diffType === 'drop'),
	});
	for (const rename of renamedRoles) {
		ddl1.roles.update({
			set: {
				name: rename.to.name,
			},
			where: {
				name: rename.from.name,
			},
		});
	}

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

		ddl1.indexes.update({
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
	preserveEntityNames(ddl1.indexes, ddl2.indexes, mode);

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

	const policiesDiff = diff(ddl1, ddl2, 'policies');
	const policiesDiffGrouped = groupDiffs(policiesDiff);

	const policyRenames = [] as { from: Policy; to: Policy }[];
	const policyCreates = [] as Policy[];
	const policyDeletes = [] as Policy[];

	for (const entry of policiesDiffGrouped) {
		const { renamedOrMoved, created, deleted } = await policyResolver({
			created: entry.inserted,
			deleted: entry.deleted,
		});

		policyCreates.push(...created);
		policyDeletes.push(...deleted);
		policyRenames.push(...renamedOrMoved);
	}

	for (const rename of policyRenames) {
		ddl1.policies.update({
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

	const jsonRenameIndexes = indexesRenames.map((r) => {
		return prepareStatement('rename_index', { schema: r.to.schema, from: r.from.name, to: r.to.name });
	});

	for (const idx of alters.filter((it) => it.entityType === 'indexes')) {
		const forWhere = !!idx.where && (idx.where.from !== null && idx.where.to !== null ? mode !== 'push' : true);
		const forColumns = !!idx.columns && (idx.columns.from.length === idx.columns.to.length ? mode !== 'push' : true);

		if (idx.isUnique || idx.concurrently || idx.method || idx.with || forColumns || forWhere) {
			const index = ddl2.indexes.one({ schema: idx.schema, table: idx.table, name: idx.name })!;
			jsonDropIndexes.push(prepareStatement('drop_index', { index }));
			jsonCreateIndexes.push(prepareStatement('create_index', { index }));
		}
	}

	const jsonDropTables = deletedTables.map((it) => prepareStatement('drop_table', { table: tableFromDDL(it, ddl2) }));
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
	const columnAlters = alters.filter((it) => it.entityType === 'columns').filter((it) => {
		if (it.default && it.default.from?.value === it.default.to?.value) {
			delete it.default;
		}
		return ddl2.columns.hasDiff(it);
	});

	const columnsToRecreate = columnAlters.filter((it) => it.generated && it.generated.to !== null).filter((it) => {
		// if push and definition changed
		return !(it.generated?.to && it.generated.from && mode === 'push');
	});

	const jsonRecreateColumns = columnsToRecreate.map((it) =>
		prepareStatement('recreate_column', {
			column: it.$right,
			isPK: ddl2.pks.one({ schema: it.schema, table: it.table, columns: [it.name] }) !== null,
		})
	);

	const jsonAddPrimaryKeys = pksCreates.filter(tablesFilter('created')).map((it) =>
		prepareStatement('add_pk', { pk: it })
	);

	const jsonDropPrimaryKeys = pksDeletes.filter(tablesFilter('deleted')).map((it) =>
		prepareStatement('drop_pk', { pk: it })
	);

	const jsonRenamePrimaryKey = pksRenames.map((it) => {
		return prepareStatement('rename_constraint', {
			schema: it.to.schema,
			table: it.to.table,
			from: it.from.name,
			to: it.to.name,
		});
	});

	const alteredUniques = alters.filter((it) => it.entityType === 'uniques').filter((it) => {
		if (it.nameExplicit) {
			delete it.nameExplicit;
		}

		return ddl2.uniques.hasDiff(it);
	});

	const jsonAlteredUniqueConstraints = alteredUniques.map((it) => prepareStatement('alter_unique', { diff: it }));

	const jsonAddedUniqueConstraints = uniqueCreates.filter(tablesFilter('created')).map((it) =>
		prepareStatement('add_unique', { unique: it })
	);

	const jsonDropUniqueConstraints = uniqueDeletes.filter(tablesFilter('deleted')).map((it) =>
		prepareStatement('drop_unique', { unique: it })
	);
	const jsonRenamedUniqueConstraints = uniqueRenames.map((it) =>
		prepareStatement('rename_constraint', {
			schema: it.to.schema,
			table: it.to.table,
			from: it.from.name,
			to: it.to.name,
		})
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
	const jsonDropCheckConstraints = checkDeletes.filter(tablesFilter('deleted')).map((it) =>
		prepareStatement('drop_check', { check: it })
	);

	// group by tables?
	const alteredPKs = alters.filter((it) => it.entityType === 'pks').filter((it) => {
		return !!it.columns; // ignore explicit name change
	});

	const alteredChecks = alters.filter((it) => it.entityType === 'checks');
	const jsonAlteredPKs = alteredPKs.map((it) => prepareStatement('alter_pk', { diff: it, pk: it.$right }));

	const jsonRecreateFKs = alters.filter((it) => it.entityType === 'fks').filter((x) => {
		if (
			x.nameExplicit
			&& ((mode === 'push' && x.nameExplicit.from && !x.nameExplicit.to)
				|| x.nameExplicit.to && !x.nameExplicit.from)
		) {
			delete x.nameExplicit;
		}

		return ddl2.fks.hasDiff(x);
	}).map((it) => prepareStatement('recreate_fk', { fk: it.$right }));

	const jsonCreateFKs = fksCreates.map((it) => prepareStatement('create_fk', { fk: it }));

	const jsonDropReferences = fksDeletes.filter((fk) => {
		return !deletedTables.some((x) => x.schema === fk.schema && x.name === fk.table);
	}).map((it) => prepareStatement('drop_fk', { fk: it }));

	const jsonRenameReferences = fksRenames.map((it) =>
		prepareStatement('rename_constraint', {
			schema: it.to.schema,
			table: it.to.table,
			from: it.from.name,
			to: it.to.name,
		})
	);

	const jsonAlterCheckConstraints = alteredChecks.map((it) => prepareStatement('alter_check', { check: it.$right }));
	const jsonCreatePoliciesStatements = policyCreates.map((it) => prepareStatement('create_policy', { policy: it }));
	const jsonDropPoliciesStatements = policyDeletes.map((it) => prepareStatement('drop_policy', { policy: it }));
	const jsonRenamePoliciesStatements = policyRenames.map((it) => prepareStatement('rename_policy', it));

	const alteredPolicies = alters.filter((it) => it.entityType === 'policies');

	// using/withcheck in policy is a SQL expression which can be formatted by database in a different way,
	// thus triggering recreations/alternations on push
	const jsonAlterOrRecreatePoliciesStatements = alteredPolicies.filter((it) => {
		return it.as || it.for || it.roles || !((it.using || it.withCheck) && mode === 'push');
	}).map(
		(it) => {
			const to = ddl2.policies.one({
				schema: it.schema,
				table: it.table,
				name: it.name,
			})!;
			if (it.for || it.as) {
				return prepareStatement('recreate_policy', {
					policy: to,
				});
			} else {
				return prepareStatement('alter_policy', {
					diff: it,
					policy: to,
				});
			}
		},
	);

	// explicit rls alters
	const rlsAlters = alters.filter((it) => it.entityType === 'tables').filter((it) => it.isRlsEnabled);

	const jsonAlterRlsStatements = rlsAlters.map((it) =>
		prepareStatement('alter_rls', {
			schema: it.schema,
			name: it.name,
			isRlsEnabled: it.isRlsEnabled?.to || false,
		})
	);

	for (const it of policyDeletes) {
		if (rlsAlters.some((alter) => alter.schema === it.schema && alter.name === it.table)) continue; // skip for explicit

		const had = ddl1.policies.list({ schema: it.schema, table: it.table }).length;
		const has = ddl2.policies.list({ schema: it.schema, table: it.table }).length;

		const prevTable = ddl1.tables.one({ schema: it.schema, name: it.table });
		const table = ddl2.tables.one({ schema: it.schema, name: it.table });

		// I don't want dedup here, not a valuable optimisation
		if (
			table !== null // not external table
			&& (had > 0 && has === 0 && prevTable && prevTable.isRlsEnabled === false)
			&& !jsonAlterRlsStatements.some((st) => st.schema === it.schema && st.name === it.table)
		) {
			jsonAlterRlsStatements.push(prepareStatement('alter_rls', {
				schema: it.schema,
				name: it.table,
				isRlsEnabled: false,
			}));
		}
	}

	for (const it of policyCreates) {
		if (rlsAlters.some((alter) => alter.schema === it.schema && alter.name === it.table)) continue; // skip for explicit
		if (createdTables.some((t) => t.schema === it.schema && t.name === it.table)) continue; // skip for created tables
		if (jsonAlterRlsStatements.some((st) => st.schema === it.schema && st.name === it.table)) continue; // skip for existing rls toggles

		const had = ddl1.policies.list({ schema: it.schema, table: it.table }).length;
		const has = ddl2.policies.list({ schema: it.schema, table: it.table }).length;

		const table = ddl2.tables.one({ schema: it.schema, name: it.table });

		if (
			table !== null // not external table
			&& (had === 0 && has > 0 && !table.isRlsEnabled)
		) {
			jsonAlterRlsStatements.push(prepareStatement('alter_rls', {
				schema: it.schema,
				name: it.table,
				isRlsEnabled: true,
			}));
		}
	}

	// if I drop policy/ies, I should check if table only had this policy/ies and turn off
	// for non explicit rls =

	const policiesAlters = alters.filter((it) => it.entityType === 'policies');
	// TODO:
	const jsonPloiciesAlterStatements = policiesAlters.map((it) =>
		prepareStatement('alter_policy', { diff: it, policy: it.$right })
	);

	const jsonCreateEnums = createdEnums.map((it) => prepareStatement('create_enum', { enum: it }));
	const jsonDropEnums = deletedEnums.map((it) => prepareStatement('drop_enum', { enum: it }));
	const jsonMoveEnums = movedEnums.map((it) => prepareStatement('move_enum', it));
	const jsonRenameEnums = renamedEnums.map((it) =>
		prepareStatement('rename_enum', {
			schema: it.to.schema,
			from: it.from.name,
			to: it.to.name,
		})
	);
	const enumsAlters = alters.filter((it) => it.entityType === 'enums');

	const recreateEnums = [] as Extract<JsonStatement, { type: 'recreate_enum' }>[];
	const jsonAlterEnums = [] as Extract<JsonStatement, { type: 'alter_enum' }>[];

	for (const alter of enumsAlters) {
		const values = alter.values!;
		const res = diffStringArrays(values.from, values.to);
		const e = { ...alter, values: values.to };

		if (res.some((it) => it.type === 'removed')) {
			// recreate enum
			const columns = ddl1.columns.list({ typeSchema: alter.schema, type: alter.name })
				.map((it) => {
					const c2 = ddl2.columns.one({ schema: it.schema, table: it.table, name: it.name })!;
					it.default = c2.default;
					return it;
				});
			recreateEnums.push(prepareStatement('recreate_enum', { to: e, columns }));
		} else {
			jsonAlterEnums.push(prepareStatement('alter_enum', { diff: res, enum: e }));
		}
	}

	const jsonAlterColumns = columnAlters.filter((it) => !(it.generated && it.generated.to !== null))
		.filter((it) => {
			// if column is of type enum we're about to recreate - we will reset default anyway
			if (
				it.default
				&& recreateEnums.some((x) =>
					x.columns.some((c) => it.schema === c.schema && it.table === c.table && it.name === c.name)
				)
			) {
				delete it.default;
			}

			if (it.notNull && it.notNull.to && (it.$right.generated || it.$right.identity)) {
				delete it.notNull;
			}

			const pkIn2 = ddl2.pks.one({ schema: it.schema, table: it.table, columns: { CONTAINS: it.name } });
			if (it.notNull && pkIn2) {
				delete it.notNull;
			}

			const pkIn1 = ddl1.pks.one({ schema: it.schema, table: it.table, columns: { CONTAINS: it.name } });
			if (it.notNull && it.notNull.from && pkIn1 && !pkIn2) {
				delete it.notNull;
			}

			return ddl2.columns.hasDiff(it);
		})
		.map((it) => {
			const column = it.$right;
			return prepareStatement('alter_column', {
				diff: it,
				isEnum: ddl2.enums.one({ schema: column.typeSchema ?? 'public', name: column.type }) !== null,
				wasEnum: (it.type && ddl1.enums.one({ schema: column.typeSchema ?? 'public', name: it.type.from }) !== null)
					?? false,
				to: column,
			});
		});

	const createSequences = createdSequences.map((it) => prepareStatement('create_sequence', { sequence: it }));
	const dropSequences = deletedSequences.map((it) => prepareStatement('drop_sequence', { sequence: it }));
	const moveSequences = movedSequences.map((it) => prepareStatement('move_sequence', it));
	const renameSequences = renamedSequences.map((it) => prepareStatement('rename_sequence', it));
	const sequencesAlter = alters.filter((it) => it.entityType === 'sequences');
	const jsonAlterSequences = sequencesAlter.map((it) =>
		prepareStatement('alter_sequence', { diff: it, sequence: it.$right })
	);

	const createRoles = createdRoles.map((it) => prepareStatement('create_role', { role: it }));
	const dropRoles = deletedRoles.map((it) => prepareStatement('drop_role', { role: it }));
	const renameRoles = renamedRoles.map((it) => prepareStatement('rename_role', it));
	const rolesAlter = alters.filter((it) => it.entityType === 'roles');
	const jsonAlterRoles = rolesAlter.map((it) => prepareStatement('alter_role', { diff: it, role: it.$right }));

	const createSchemas = createdSchemas.map((it) => prepareStatement('create_schema', it));
	const dropSchemas = deletedSchemas.map((it) => prepareStatement('drop_schema', it));
	const renameSchemas = renamedSchemas.map((it) => prepareStatement('rename_schema', it));

	const createTables = createdTables.map((it) => prepareStatement('create_table', { table: tableFromDDL(it, ddl2) }));

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
		if (it.definition && mode === 'push') {
			delete it.definition;
		}
		return it;
	}).filter((it) => !(it.isExisting && it.isExisting.to));

	const viewsAlters = filteredViewAlters.map((it) => ({ diff: it, view: it.$right })).filter((it) =>
		!it.view.isExisting
	);

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
	jsonStatements.push(...jsonCreateEnums);
	jsonStatements.push(...jsonMoveEnums);
	jsonStatements.push(...jsonRenameEnums);
	jsonStatements.push(...jsonAlterEnums);

	jsonStatements.push(...createSequences);
	jsonStatements.push(...moveSequences);
	jsonStatements.push(...renameSequences);
	jsonStatements.push(...jsonAlterSequences);

	jsonStatements.push(...renameRoles);
	jsonStatements.push(...dropRoles);
	jsonStatements.push(...createRoles);
	jsonStatements.push(...jsonAlterRoles);

	jsonStatements.push(...createTables);

	jsonStatements.push(...jsonAlterRlsStatements);
	jsonStatements.push(...jsonDropViews);
	jsonStatements.push(...jsonRenameViews);
	jsonStatements.push(...jsonMoveViews);
	jsonStatements.push(...jsonRecreateViews);
	jsonStatements.push(...jsonAlterViews);

	jsonStatements.push(...jsonDropPoliciesStatements); // before drop tables
	jsonStatements.push(...jsonDropTables);
	jsonStatements.push(...jsonRenameTables);
	jsonStatements.push(...jsonSetTableSchemas);
	jsonStatements.push(...jsonRenameColumnsStatements);

	jsonStatements.push(...jsonDropUniqueConstraints);
	jsonStatements.push(...jsonDropCheckConstraints);
	jsonStatements.push(...jsonDropReferences);

	// TODO: ? will need to drop indexes before changing any columns in table
	// Then should go column alternations and then index creation
	jsonStatements.push(...jsonRenameIndexes);
	jsonStatements.push(...jsonDropIndexes);
	jsonStatements.push(...jsonDropPrimaryKeys);

	jsonStatements.push(...jsonAddPrimaryKeys);
	jsonStatements.push(...jsonRenamePrimaryKey);
	jsonStatements.push(...jsonRenameReferences);
	jsonStatements.push(...jsonAddColumnsStatemets);
	jsonStatements.push(...recreateEnums);
	jsonStatements.push(...jsonRecreateColumns);
	jsonStatements.push(...jsonAlterColumns);

	jsonStatements.push(...jsonCreateFKs);
	jsonStatements.push(...jsonRecreateFKs);
	jsonStatements.push(...jsonCreateIndexes);

	jsonStatements.push(...jsonDropColumnsStatemets);
	jsonStatements.push(...jsonAlteredPKs);

	jsonStatements.push(...jsonRenamedUniqueConstraints);
	jsonStatements.push(...jsonAddedUniqueConstraints);
	jsonStatements.push(...jsonCreatedCheckConstraints);

	jsonStatements.push(...jsonAlteredUniqueConstraints);
	jsonStatements.push(...jsonAlterCheckConstraints);

	jsonStatements.push(...createViews);

	jsonStatements.push(...jsonRenamePoliciesStatements);
	jsonStatements.push(...jsonCreatePoliciesStatements);
	jsonStatements.push(...jsonAlterOrRecreatePoliciesStatements);

	jsonStatements.push(...jsonDropEnums);
	jsonStatements.push(...dropSequences);
	jsonStatements.push(...dropSchemas);

	const { groupedStatements, sqlStatements } = fromJson(jsonStatements);

	const renames = prepareMigrationRenames([
		...renameSchemas,
		...renamedEnums,
		...renamedOrMovedTables,
		...columnRenames,
		...uniqueRenames,
		...checkRenames,
		...indexesRenames,
		...pksRenames,
		...fksRenames,
		...policyRenames,
		...renamedOrMovedViews,
		...renamedRoles,
		...renamedOrMovedSequences,
	]);

	return {
		statements: jsonStatements,
		sqlStatements,
		groupedStatements: groupedStatements,
		renames: renames,
	};
};

const preserveEntityNames = <C extends PostgresDDL['uniques' | 'fks' | 'pks' | 'indexes']>(
	collection1: C,
	collection2: C,
	mode: 'push' | 'default',
) => {
	const items = collection1.list().filter((x) => mode === 'push' || !x.nameExplicit);
	for (const left of items) {
		const { entityType: _, name, nameExplicit, ...filter } = left;

		const match = collection2.list({ ...filter, nameExplicit: false } as any);

		if (match.length !== 1 || match[0].name === left.name) continue;

		collection2.update({
			set: { name: left.name },
			where: {
				...filter,
				nameExplicit: false,
			} as any,
		});
	}
};
