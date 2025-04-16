import { Resolver } from '../../snapshot-differ/common';
import { prepareMigrationMeta } from '../../utils';
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
import { JsonStatement, prepareStatement } from './statements';

export const originsFinder = (
	schemaRenames: { from: { name: string }; to: { name: string } }[],
	tableRenames: { from: { schema: string; name: string }; to: { schema: string; name: string } }[],
	columnRenames: {
		from: { schema: string; table: string; name: string };
		to: { schema: string; table: string; name: string };
	}[],
) => {
	return (it: { name: string; schema: string; table: string }) => {
		const schemaRename = schemaRenames.find((r) => r.to.name === it.schema);
		const originalSchema = schemaRename ? schemaRename.from.name : it.schema;
		const tableRename = tableRenames.find((r) => r.to.schema === it.schema && r.to.name === it.table);
		const originalTable = tableRename ? tableRename.from.name : it.table;
		const originalName =
			columnRenames.find((r) => r.to.schema === it.schema && r.to.table === it.table && r.to.name === it.name)?.from
				.name ?? it.name;

		return { schema: originalSchema, table: originalTable, name: originalName };
	};
};
// TODO: test
// const finder1 = originsFinder([{from:{name: "public"}, to:{name:"public2"}} ], [{from:{schema:"public2", name:"table"}, to:{schema:"public2", name:"table2"}}], []);
// const finder2 = originsFinder([{from:{name: null}, to:{name:"public2"}} ], [{from:{schema:"public2", name:"table"}, to:{schema:"public2", name:"table2"}}], []);
// const finder3 = originsFinder([], [{from:{schema:"public2", name:"table"}, to:{schema:"public2", name:"table2"}}], []);
// const finder4 = originsFinder([], [], []);
// const finder5 = originsFinder([{from:{name: null}, to:{name:"public2"}}], [], []);
// const finder6 = originsFinder([], [{from:{schema:"public2", name:"table"}, to:{schema:"public2", name:"table2"}}], []);
// const finder7 = originsFinder([], [], [{from: {schema:"public2",table:"table2", "name":"aidi"},to:{schema:"public2", table:"table2", name:"id"}}]);
// console.table([
// 	finder1({schema:"public2", table: "table2", name: "id"}),
// 	finder2({schema:"public2", table: "table2", name: "id"}),
// 	finder3({schema:"public2", table: "table2", name: "id"}),
// 	finder4({schema:"public2", table: "table2", name: "id"}),
// 	finder5({schema:"public2", table: "table2", name: "id"}),
// 	finder6({schema:"public2", table: "table2", name: "id"}),
// 	finder7({schema:"public2", table: "table2", name: "id"}),
// ])

export const ddlDif = async (
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
	type: 'default' | 'push',
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
	const ddl1Copy = createDDL();
	for (const entity of ddl1.entities.list()) {
		ddl1Copy.entities.insert(entity);
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

	const renamedEnums = renamedOrMovedEnums.filter((it) => it.from.schema === it.to.schema);
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

		// TODO: where?
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
		const { renamedOrMoved, created, deleted } = await uniquesResolver({
			created: entry.inserted,
			deleted: entry.deleted,
		});

		uniqueCreates.push(...created);
		uniqueDeletes.push(...deleted);
		uniqueRenames.push(...renamedOrMoved);
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

	const origins = originsFinder(renamedSchemas, renamedTables, columnRenames);

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
		prepareStatement('add_column', { column: it })
	);
	const columnAlters = alters.filter((it) => it.entityType === 'columns');
	const columnsToRecreate = columnAlters.filter((it) => it.generated && it.generated.to !== null);
	const jsonRecreateColumns = columnsToRecreate.map((it) =>
		prepareStatement('recreate_column', {
			column: ddl2.columns.one({ schema: it.schema, table: it.table, name: it.name })!,
		})
	);

	const jsonAlterColumns = columnAlters.filter((it) => !(it.generated && it.generated.to !== null)).map((it) => {
		const origin = origins(it);
		const from = ddl1Copy.columns.one(origin);
		if (!from) {
			throw new Error(`Missing column in original ddl:\n${JSON.stringify(it)}\n${JSON.stringify(origin)}`);
		}

		return prepareStatement('alter_column', {
			diff: it,
			from: from,
			to: ddl2.columns.one({ schema: it.schema, table: it.table, name: it.name })!,
		});
	});

	const jsonAddPrimaryKeys = pksCreates.filter(tablesFilter('created')).map((it) =>
		prepareStatement('add_pk', { pk: it })
	);
	const jsonDropPrimaryKeys = pksDeletes.filter(tablesFilter('deleted')).map((it) =>
		prepareStatement('drop_pk', { pk: it })
	);

	const jsonAddedUniqueConstraints = uniqueCreates.filter(tablesFilter('created')).map((it) =>
		prepareStatement('add_unique', { unique: it })
	);
	const jsonDeletedUniqueConstraints = uniqueDeletes.filter(tablesFilter('deleted')).map((it) =>
		prepareStatement('drop_unique', { unique: it })
	);
	const jsonRenamedUniqueConstraints = uniqueRenames.map((it) => prepareStatement('rename_unique', it));

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
	const alteredPKs = alters.filter((it) => it.entityType === 'pks');
	const alteredFKs = alters.filter((it) => it.entityType === 'fks');
	const alteredUniques = alters.filter((it) => it.entityType === 'uniques');
	const alteredChecks = alters.filter((it) => it.entityType === 'checks');
	const jsonAlteredPKs = alteredPKs.map((it) => {
		const pk = ddl2.pks.one({ schema: it.schema, table: it.table, name: it.name })!;
		return prepareStatement('alter_pk', { diff: it, pk });
	});
	const jsonAlteredUniqueConstraints = alteredUniques.map((it) => prepareStatement('alter_unique', { diff: it }));
	const jsonAlterCheckConstraints = alteredChecks.map((it) => prepareStatement('alter_check', { diff: it }));

	const jsonCreateReferences = fksCreates.map((it) => prepareStatement('create_fk', { fk: it }));
	const jsonDropReferences = fksDeletes.map((it) => prepareStatement('drop_fk', { fk: it }));
	const jsonRenameReferences = fksRenames.map((it) => prepareStatement('rename_fk', it));

	const jsonCreatePoliciesStatements = policyCreates.map((it) => prepareStatement('create_policy', { policy: it }));
	const jsonDropPoliciesStatements = policyDeletes.map((it) => prepareStatement('drop_policy', { policy: it }));
	const jsonRenamePoliciesStatements = policyRenames.map((it) => prepareStatement('rename_policy', it));

	const alteredPolicies = alters.filter((it) => it.entityType === 'policies');
	const jsonAlterPoliciesStatements = alteredPolicies.map((it) =>
		prepareStatement('alter_policy', {
			diff: it,
			policy: ddl2.policies.one({
				schema: it.schema,
				table: it.table,
				name: it.name,
			})!,
		})
	);

	const rlsAlters = alters.filter((it) => it.entityType === 'tables').filter((it) => it.isRlsEnabled);
	const jsonAlterRlsStatements = rlsAlters.map((it) =>
		prepareStatement('alter_rls', {
			table: ddl2.tables.one({ schema: it.schema, name: it.name })!,
			isRlsEnabled: it.isRlsEnabled?.to || false,
		})
	);
	const policiesAlters = alters.filter((it) => it.entityType === 'policies');
	const jsonPloiciesAlterStatements = policiesAlters.map((it) =>
		prepareStatement('alter_policy', {
			diff: it,
			policy: ddl2.policies.one({ schema: it.schema, table: it.name, name: it.name })!,
		})
	);

	const jsonCreateEnums = createdEnums.map((it) => prepareStatement('create_enum', { enum: it }));
	const jsonDropEnums = deletedEnums.map((it) => prepareStatement('drop_enum', { enum: it }));
	const jsonMoveEnums = movedEnums.map((it) => prepareStatement('move_enum', it));
	const jsonRenameEnums = renamedEnums.map((it) => prepareStatement('rename_enum', it));
	const enumsAlters = alters.filter((it) => it.entityType === 'enums');

	const recreateEnums = [] as Extract<JsonStatement, { type: 'recreate_enum' }>[];
	const jsonAlterEnums = [] as Extract<JsonStatement, { type: 'alter_enum' }>[];

	for (const alter of enumsAlters) {
		const values = alter.values!;
		const res = diffStringArrays(values.from, values.to);
		const e = { ...alter, values: values.to };

		if (res.some((it) => it.type === 'removed')) {
			// recreate enum
			const columns = ddl2.columns.list({ typeSchema: alter.schema, type: alter.name });
			recreateEnums.push(prepareStatement('recreate_enum', { to: e, columns }));
		} else {
			jsonAlterEnums.push(prepareStatement('alter_enum', { diff: res, enum: e }));
		}
	}

	const createSequences = createdSequences.map((it) => prepareStatement('create_sequence', { sequence: it }));
	const dropSequences = deletedSequences.map((it) => prepareStatement('drop_sequence', { sequence: it }));
	const moveSequences = movedSequences.map((it) => prepareStatement('move_sequence', it));
	const renameSequences = renamedSequences.map((it) => prepareStatement('rename_sequence', it));
	const sequencesAlter = alters.filter((it) => it.entityType === 'sequences');
	const jsonAlterSequences = sequencesAlter.map((it) =>
		prepareStatement('alter_sequence', {
			diff: it,
			sequence: ddl2.sequences.one({ schema: it.schema, name: it.name })!,
		})
	);

	const createRoles = createdRoles.map((it) => prepareStatement('create_role', { role: it }));
	const dropRoles = deletedRoles.map((it) => prepareStatement('drop_role', { role: it }));
	const renameRoles = renamedRoles.map((it) => prepareStatement('rename_role', it));
	const rolesAlter = alters.filter((it) => it.entityType === 'roles');
	const jsonAlterRoles = rolesAlter.map((it) =>
		prepareStatement('alter_role', { diff: it, role: ddl2.roles.one({ name: it.name })! })
	);

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
	const viewsAlters = alters.filter((it) => it.entityType === 'views').filter((it) =>
		!(it.isExisting && it.isExisting.to) && !(it.definition && type === 'push')
	).map((it) => {
		const view = ddl2.views.one({ schema: it.schema, name: it.name })!;
		return { diff: it, view };
	}).filter((it) => !it.view.isExisting);

	const jsonAlterViews = viewsAlters.filter((it) => !it.diff.definition).map((it) => {
		return prepareStatement('alter_view', {
			diff: it.diff,
			view: it.view,
		});
	});

	const jsonRecreateViews = viewsAlters.filter((it) => it.diff.definition && type !== 'push').map((entry) => {
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
	// jsonStatements.push(...jsonDisableRLSStatements);
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

	// jsonStatements.push(...jsonCreateReferencesForCreatedTables); // TODO: check
	jsonStatements.push(...jsonCreateReferences);
	jsonStatements.push(...jsonCreateIndexes);

	// jsonStatements.push(...jsonCreatedReferencesForAlteredTables); // TODO: check

	jsonStatements.push(...jsonDropColumnsStatemets);
	jsonStatements.push(...jsonAlteredPKs);

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
