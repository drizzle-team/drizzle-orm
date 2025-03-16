import { integer } from 'drizzle-orm/sqlite-core';
import {
	ColumnsResolverInput,
	ColumnsResolverOutput,
	ResolverInput,
	ResolverOutput,
	ResolverOutputWithMoved,
	RolesResolverInput,
	RolesResolverOutput,
	TablePolicyResolverInput,
	TablePolicyResolverOutput,
} from '../../snapshot-differ/common';
import { prepareMigrationMeta } from '../../utils';
import { diff } from '../dialect';
import { groupDiffs, Named } from '../utils';
import { fromJson } from './convertor';
import {
	CheckConstraint,
	Column,
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
import { JsonStatement, prepareStatement } from './statements';

export const applyPgSnapshotsDiff = async (
	ddl1: PostgresDDL,
	ddl2: PostgresDDL,
	schemasResolver: (
		input: ResolverInput<Schema>,
	) => Promise<ResolverOutput<Schema>>,
	enumsResolver: (
		input: ResolverInput<Enum>,
	) => Promise<ResolverOutputWithMoved<Enum>>,
	sequencesResolver: (
		input: ResolverInput<Sequence>,
	) => Promise<ResolverOutputWithMoved<Sequence>>,
	policyResolver: (
		input: TablePolicyResolverInput<Policy>,
	) => Promise<TablePolicyResolverOutput<Policy>>,
	roleResolver: (
		input: RolesResolverInput<Role>,
	) => Promise<RolesResolverOutput<Role>>,
	tablesResolver: (
		input: ResolverInput<PostgresEntities['tables']>,
	) => Promise<ResolverOutputWithMoved<PostgresEntities['tables']>>,
	columnsResolver: (
		input: ColumnsResolverInput<Column>,
	) => Promise<ColumnsResolverOutput<Column>>,
	viewsResolver: (
		input: ResolverInput<View>,
	) => Promise<ResolverOutputWithMoved<View>>,
	uniquesResolver: (
		input: ColumnsResolverInput<UniqueConstraint>,
	) => Promise<ColumnsResolverOutput<UniqueConstraint>>,
	indexesResolver: (
		input: ResolverInput<Index>,
	) => Promise<ResolverOutput<Index>>,
	checksResolver: (
		input: ColumnsResolverInput<CheckConstraint>,
	) => Promise<ColumnsResolverOutput<CheckConstraint>>,
	pksResolver: (
		input: ColumnsResolverInput<PrimaryKey>,
	) => Promise<ColumnsResolverOutput<PrimaryKey>>,
	fksResolver: (
		input: ColumnsResolverInput<ForeignKey>,
	) => Promise<ColumnsResolverOutput<ForeignKey>>,
): Promise<{
	statements: JsonStatement[];
	sqlStatements: string[];
	groupedStatements: { jsonStatement: JsonStatement; sqlStatements: string[] }[];
	_meta:
		| {
			schemas: {};
			tables: {};
			columns: {};
		}
		| undefined;
}> => {
	const schemasDiff = diff(ddl1, ddl2, 'schemas');

	const {
		created: createdSchemas,
		deleted: deletedSchemas,
		renamed: renamedSchemas,
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
	}

	const enumsDiff = diff(ddl1, ddl2, 'enums');
	const {
		created: createdEnums,
		deleted: deletedEnums,
		renamed: renamedEnums,
		moved: movedEnums,
	} = await enumsResolver({
		created: enumsDiff.filter((it) => it.$diffType === 'create'),
		deleted: enumsDiff.filter((it) => it.$diffType === 'drop'),
	});

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
				schema: move.schemaTo,
			},
			where: {
				name: move.name,
				schema: move.schemaFrom,
			},
		});
		ddl1.columns.update({
			set: {
				typeSchema: move.schemaTo,
			},
			where: {
				type: move.name,
				typeSchema: move.schemaFrom,
			},
		});
	}

	const sequencesDiff = diff(ddl1, ddl2, 'sequences');
	const {
		created: createdSequences,
		deleted: deletedSequences,
		renamed: renamedSequences,
		moved: movedSequences,
	} = await sequencesResolver({
		created: sequencesDiff.filter((it) => it.$diffType === 'create'),
		deleted: sequencesDiff.filter((it) => it.$diffType === 'drop'),
	});

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
				schema: move.schemaTo,
			},
			where: {
				name: move.name,
				schema: move.schemaFrom,
			},
		});
	}

	const rolesDiff = diff(ddl1, ddl2, 'roles');

	const {
		created: createdRoles,
		deleted: deletedRoles,
		renamed: renamedRoles,
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
		moved: movedTables,
		renamed: renamedTables, // renamed or moved
	} = await tablesResolver({
		created: tablesDiff.filter((it) => it.$diffType === 'create'),
		deleted: tablesDiff.filter((it) => it.$diffType === 'drop'),
	});

	for (const rename of renamedTables) {
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
		const { renamed, created, deleted } = await columnsResolver({
			schema: it.schema,
			tableName: it.table,
			created: it.inserted,
			deleted: it.deleted,
		});

		columnsToCreate.push(...created);
		columnsToDelete.push(...deleted);
		columnRenames.push(...renamed);
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

		// TODO: where?
		ddl1.indexes.update({
			set: {
				columns: (it) => {
					if (!it.expression && it.value === rename.from.name) {
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
				columnsFrom: (it) => {
					return it === rename.from.name ? rename.to.name : it;
				},
			},
			where: {
				schema: rename.from.schema,
				tableFrom: rename.from.table,
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

	const uniquesDiff = diff(ddl1, ddl2, 'uniques');
	const groupedUniquesDiff = groupDiffs(uniquesDiff);

	const uniqueRenames = [] as { from: UniqueConstraint; to: UniqueConstraint }[];
	const uniqueCreates = [] as UniqueConstraint[];
	const uniqueDeletes = [] as UniqueConstraint[];

	for (const entry of groupedUniquesDiff) {
		const { renamed, created, deleted } = await uniquesResolver({
			schema: entry.schema,
			tableName: entry.table,
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
		const { renamed, created, deleted } = await checksResolver({
			schema: entry.schema,
			tableName: entry.table,
			created: entry.inserted,
			deleted: entry.deleted,
		});

		checkCreates.push(...created);
		checkDeletes.push(...deleted);
		checkRenames.push(...renamed);
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
		const { renamed, created, deleted } = await indexesResolver({
			created: entry.inserted,
			deleted: entry.deleted,
		});

		indexesCreates.push(...created);
		indexesDeletes.push(...deleted);
		indexesRenames.push(...renamed);
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
		const { renamed, created, deleted } = await pksResolver({
			schema: entry.schema,
			tableName: entry.table,
			created: entry.inserted,
			deleted: entry.deleted,
		});

		pksCreates.push(...created);
		pksDeletes.push(...deleted);
		pksRenames.push(...renamed);
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
		const { renamed, created, deleted } = await fksResolver({
			schema: entry.schema,
			tableName: entry.table,
			created: entry.inserted,
			deleted: entry.deleted,
		});

		fksCreates.push(...created);
		fksDeletes.push(...deleted);
		fksRenames.push(...renamed);
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
		const { renamed, created, deleted } = await policyResolver({
			schema: entry.schema,
			tableName: entry.table,
			created: entry.inserted,
			deleted: entry.deleted,
		});

		policyCreates.push(...created);
		policyDeletes.push(...deleted);
		policyRenames.push(...renamed);
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
		renamed: renamedViews,
		moved: movedViews,
	} = await viewsResolver({
		created: viewsDiff.filter((it) => it.$diffType === 'create'),
		deleted: viewsDiff.filter((it) => it.$diffType === 'drop'),
	});

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
				schema: move.schemaTo,
			},
			where: {
				name: move.name,
				schema: move.schemaFrom,
			},
		});
	}

	const alters = diff.alters(ddl1, ddl2);

	const jsonStatements: JsonStatement[] = [];

	const jsonCreateIndexes = indexesCreates.map((index) => prepareStatement('add_index', { index }));
	const jsonDropIndexes = indexesDeletes.map((index) => prepareStatement('drop_index', { index }));
	const jsonDropTables = deletedTables.map((it) => prepareStatement('drop_table', { table: tableFromDDL(it, ddl2) }));
	const jsonRenameTables = renamedTables.map((it) => prepareStatement('rename_table', it));

	const jsonRenameColumnsStatements = columnRenames.map((it) => prepareStatement('rename_column', it));
	const jsonDropColumnsStatemets = columnsToDelete.map((it) => prepareStatement('drop_column', { column: it }));
	const jsonAddColumnsStatemets = columnsToCreate.map((it) => prepareStatement('add_column', { column: it }));

	const jsonAddedCompositePKs = pksCreates.map((it) => prepareStatement('add_composite_pk', { pk: it }));
	const jsonDeletedCompositePKs = pksDeletes.map((it) => prepareStatement('drop_composite_pk', { pk: it }));

	const jsonAddedUniqueConstraints = uniqueCreates.map((it) => prepareStatement('add_unique', { unique: it }));
	const jsonDeletedUniqueConstraints = uniqueDeletes.map((it) => prepareStatement('drop_unique', { unique: it }));
	const jsonRenamedUniqueConstraints = uniqueRenames.map((it) => prepareStatement('rename_unique', it));

	const jsonSetTableSchemas = movedTables.map((it) => prepareStatement('move_table', it));

	const jsonDeletedCheckConstraints = checkDeletes.map((it) => prepareStatement('drop_check', { check: it }));
	const jsonCreatedCheckConstraints = checkCreates.map((it) => prepareStatement('add_check', { check: it }));

	// group by tables?
	const alteredPKs = alters.filter((it) => it.entityType === 'pks');
	const alteredFKs = alters.filter((it) => it.entityType === 'fks');
	const alteredUniques = alters.filter((it) => it.entityType === 'uniques');
	const alteredChecks = alters.filter((it) => it.entityType === 'checks');
	const jsonAlteredCompositePKs = alteredPKs.map((it) => prepareStatement('alter_composite_pk', { diff: it }));
	const jsonAlteredUniqueConstraints = alteredUniques.map((it) => prepareStatement('alter_unique', { diff: it }));
	const jsonAlterCheckConstraints = alteredChecks.map((it) => prepareStatement('alter_check', { diff: it }));

	const jsonCreateReferences = fksCreates.map((it) => prepareStatement('create_reference', { fk: it }));
	const jsonDropReferences = fksDeletes.map((it) => prepareStatement('drop_reference', { fk: it }));
	const jsonRenameReferences = fksRenames.map((it) => prepareStatement('rename_reference', it));

	const jsonCreatePoliciesStatements = policyCreates.map((it) => prepareStatement('create_policy', { policy: it }));
	const jsonDropPoliciesStatements = policyDeletes.map((it) => prepareStatement('drop_policy', { policy: it }));
	const jsonRenamePoliciesStatements = policyRenames.map((it) => prepareStatement('rename_policy', it));

	const alteredPolicies = alters.filter((it) => it.entityType === 'policies');
	const jsonAlterPoliciesStatements = alteredPolicies.map((it) => prepareStatement('alter_policy', { diff: it }));

	const rlsAlters = alters.filter((it) => it.entityType === 'tables').filter((it) => it.isRlsEnabled);
	const jsonAlterRlsStatements = rlsAlters.map((it) => prepareStatement('alter_rls', { diff: it }));
	const policiesAlters = alters.filter((it) => it.entityType === 'policies');
	const jsonPloiciesAlterStatements = policiesAlters.map((it) => prepareStatement('alter_policy', { diff: it }));

	const jsonCreateEnums = createdEnums.map((it) => prepareStatement('create_type_enum', { enum: it }));
	const jsonDropEnums = deletedEnums.map((it) => prepareStatement('drop_type_enum', { enum: it }));
	const jsonMoveEnums = movedEnums.map((it) => prepareStatement('move_type_enum', it));
	const jsonRenameEnums = renamedEnums.map((it) => prepareStatement('rename_type_enum', it));
	const enumsAlters = alters.filter((it) => it.entityType === 'enums');
	const jsonAlterEnums = enumsAlters.map((it) => prepareStatement('alter_type_enum', { diff: it }));

	const createSequences = createdSequences.map((it) => prepareStatement('create_sequence', { sequence: it }));
	const dropSequences = deletedSequences.map((it) => prepareStatement('drop_sequence', { sequence: it }));
	const moveSequences = movedSequences.map((it) => prepareStatement('move_sequence', it));
	const renameSequences = renamedSequences.map((it) => prepareStatement('rename_sequence', it));
	const sequencesAlter = alters.filter((it) => it.entityType === 'sequences');
	const jsonAlterSequences = sequencesAlter.map((it) => prepareStatement('alter_sequence', { diff: it }));

	const createRoles = createdRoles.map((it) => prepareStatement('create_role', { role: it }));
	const dropRoles = deletedRoles.map((it) => prepareStatement('drop_role', { role: it }));
	const renameRoles = renamedRoles.map((it) => prepareStatement('rename_role', it));
	const rolesAlter = alters.filter((it) => it.entityType === 'roles');
	const jsonAlterRoles = rolesAlter.map((it) => prepareStatement('alter_role', { diff: it }));

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
	const viewsAlters = alters.filter((it) => it.entityType === 'views').filter((it) =>
		!(it.isExisting && it.isExisting.to)
	);
	const jsonAlterViews = viewsAlters.map((it) => prepareStatement('alter_view', { diff: it }));

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
	// jsonStatements.push(...jsonDisableRLSStatements);
	jsonStatements.push(...jsonDropViews);
	jsonStatements.push(...jsonRenameViews);
	jsonStatements.push(...jsonAlterViews);

	jsonStatements.push(...jsonDropTables);
	jsonStatements.push(...jsonSetTableSchemas);
	jsonStatements.push(...jsonRenameTables);
	jsonStatements.push(...jsonRenameColumnsStatements);

	jsonStatements.push(...jsonDeletedUniqueConstraints);
	jsonStatements.push(...jsonDeletedCheckConstraints);

	// jsonStatements.push(...jsonDroppedReferencesForAlteredTables); // TODO: check

	// Will need to drop indexes before changing any columns in table
	// Then should go column alternations and then index creation
	jsonStatements.push(...jsonDropIndexes);
	jsonStatements.push(...jsonDeletedCompositePKs);

	// jsonStatements.push(...jsonTableAlternations); // TODO: check

	jsonStatements.push(...jsonAddedCompositePKs);
	jsonStatements.push(...jsonAddColumnsStatemets);

	// jsonStatements.push(...jsonCreateReferencesForCreatedTables); // TODO: check
	jsonStatements.push(...jsonCreateIndexes);

	// jsonStatements.push(...jsonCreatedReferencesForAlteredTables); // TODO: check

	jsonStatements.push(...jsonDropColumnsStatemets);
	jsonStatements.push(...jsonAlteredCompositePKs);

	jsonStatements.push(...jsonRenamedUniqueConstraints);
	jsonStatements.push(...jsonAddedUniqueConstraints);
	jsonStatements.push(...jsonCreatedCheckConstraints);

	jsonStatements.push(...jsonAlteredUniqueConstraints);
	// jsonStatements.push(...jsonAlterEnumsWithDroppedValues); // TODO: check

	jsonStatements.push(...createViews);

	jsonStatements.push(...jsonRenamePoliciesStatements);
	jsonStatements.push(...jsonDropPoliciesStatements);
	jsonStatements.push(...jsonCreatePoliciesStatements);
	jsonStatements.push(...jsonAlterPoliciesStatements);

	jsonStatements.push(...jsonDropEnums); // TODO: check
	jsonStatements.push(...dropSequences);
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

	const rSchemas = renamedSchemas.map((it) => ({
		from: it.from.name,
		to: it.to.name,
	}));

	const rTables = renamedTables.map((it) => {
		return { from: it.from, to: it.to };
	});

	const rColumns = jsonRenameColumnsStatements.map((it) => {
		return {
			from: { schema: it.from.schema, table: it.from.table, column: it.from.name },
			to: { schema: it.to.schema, table: it.to.table, column: it.to.name },
		};
	});

	const _meta = prepareMigrationMeta(rSchemas, rTables, rColumns);

	return {
		statements: jsonStatements,
		sqlStatements,
		groupedStatements: groupedStatements,
		_meta,
	};
};
