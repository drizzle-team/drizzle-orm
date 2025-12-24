import { parse } from 'src/utils/when-json-met-bigint';
import { prepareMigrationRenames, trimChar } from '../../utils';
import { mockResolver } from '../../utils/mocks';
import { deepStrictEqual } from '../../utils/node-assert/deep-strict-equal';
import { diffStringArrays } from '../../utils/sequence-matcher';
import type { Resolver } from '../common';
import { diff } from '../dialect';
import { groupDiffs, preserveEntityNames } from '../utils';
import { fromJson } from './convertor';
import type {
	CheckConstraint,
	Column,
	DiffEntities,
	Enum,
	ForeignKey,
	Index,
	IndexColumn,
	Policy,
	PostgresDDL,
	PostgresEntities,
	PrimaryKey,
	Privilege,
	Role,
	Schema,
	Sequence,
	UniqueConstraint,
	View,
} from './ddl';
import { createDDL, tableFromDDL } from './ddl';
import { defaults, defaultsCommutative, isSerialType } from './grammar';
import type { JsonAlterPrimaryKey, JsonRecreateIndex, JsonStatement } from './statements';
import { prepareStatement } from './statements';

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
	privilegesResolver: Resolver<Privilege>,
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

	const privilegesDiff = diff(ddl1, ddl2, 'privileges');
	const {
		created: createdPrivileges,
		deleted: deletedPrivileges,
	} = await privilegesResolver({
		created: privilegesDiff.filter((it) => it.$diffType === 'create'),
		deleted: privilegesDiff.filter((it) => it.$diffType === 'drop'),
	});

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
		ddl2.fks.update({
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

		ddl2.entities.update({
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

		// DDL2 updates are needed for Drizzle Studio
		const update1 = {
			set: {
				columns: (it: IndexColumn) => {
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
		} as const;
		ddl1.indexes.update(update1);
		ddl2.indexes.update(update1);

		const update2 = {
			set: {
				columns: (it: string) => {
					return it === rename.from.name ? rename.to.name : it;
				},
			},
			where: {
				schema: rename.from.schema,
				table: rename.from.table,
			},
		} as const;
		ddl1.pks.update(update2);
		ddl2.pks.update(update2);

		const update3 = {
			set: {
				columns: (it: string) => {
					return it === rename.from.name ? rename.to.name : it;
				},
			},
			where: {
				schema: rename.from.schema,
				table: rename.from.table,
			},
		} as const;
		ddl1.fks.update(update3);
		ddl2.fks.update(update3);

		const update4 = {
			set: {
				columnsTo: (it: string) => {
					return it === rename.from.name ? rename.to.name : it;
				},
			},
			where: {
				schemaTo: rename.from.schema,
				tableTo: rename.from.table,
			},
		} as const;
		ddl1.fks.update(update4);
		ddl2.fks.update(update4);

		const update5 = {
			set: {
				columns: (it: string) => {
					return it === rename.from.name ? rename.to.name : it;
				},
			},
			where: {
				schema: rename.from.schema,
				table: rename.from.table,
			},
		} as const;
		ddl1.uniques.update(update5);
		ddl2.uniques.update(update5);

		const update6 = {
			set: {
				value: rename.to.name,
			},
			where: {
				schema: rename.from.schema,
				table: rename.from.table,
				value: rename.from.name,
			},
		} as const;
		ddl1.checks.update(update6);
		ddl2.checks.update(update6);
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

	const indexesAlters = alters.filter((it): it is DiffEntities['indexes'] => {
		if (it.entityType !== 'indexes') return false;

		delete it.concurrently;

		return ddl2.indexes.hasDiff(it);
	});

	const jsonRecreateIndex: JsonRecreateIndex[] = [];
	for (const idx of indexesAlters) {
		const forWhere = !!idx.where && (idx.where.from !== null && idx.where.to !== null ? mode !== 'push' : true);
		const forColumns = !!idx.columns && (idx.columns.from.length === idx.columns.to.length ? mode !== 'push' : true);

		if (idx.isUnique || idx.concurrently || idx.method || idx.with || forColumns || forWhere) {
			const index = ddl2.indexes.one({ schema: idx.schema, table: idx.table, name: idx.name })!;
			jsonRecreateIndex.push(prepareStatement('recreate_index', { index, diff: idx }));
		}
	}

	const jsonDropTables = deletedTables.map((it) => {
		const oldSchema = renamedSchemas.find((x) => x.to.name === it.schema);
		const key = oldSchema ? `"${oldSchema.from.name}"."${it.name}"` : `"${it.schema}"."${it.name}"`;
		return prepareStatement('drop_table', { table: tableFromDDL(it, ddl2), key });
	});
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
			// if pk existed before and new column now has pk, this will trigger alter_pk, that will automatically add pk
			// this flag is needed for column recreation (generated)
			// see tests: "drizzle-kit/tests/postgres/pg-constraints.test.ts" => "remove/add pk" and below
			isPK: false, // ddl2.pks.one({ schema: it.schema, table: it.table, columns: [it.name] }) !== null,
			isCompositePK: ddl2.pks.one({ schema: it.schema, table: it.table, columns: { CONTAINS: it.name } }) !== null,
		})
	);

	const columnAlters = alters.filter((it) => it.entityType === 'columns').filter((it) => {
		if (
			it.default
			&& ((it.$left.type === 'json' && it.$right.type === 'json')
				|| (it.$left.type === 'jsonb' && it.$right.type === 'jsonb'))
		) {
			if (it.default.from !== null && it.default.to !== null) {
				const parsedLeft = parse(trimChar(it.default.from, "'"));
				const parsedRight = parse(trimChar(it.default.to, "'"));

				try {
					deepStrictEqual(parsedLeft, parsedRight);
					delete it.default;
				} catch {}

				// const left = stringify(parsedLeft);
				// const right = stringify(parsedRight);

				// if (left === right) {
				// 	delete it.default;
				// }
			}
		}

		if (!it.type && it.default && defaultsCommutative(it.default, it.$right.type, it.$right.dimensions)) {
			delete it.default;
		}

		// commutative types
		if (it.type) {
			if (
				it.type.from === it.type.to.replace('numeric', 'decimal')
				|| it.type.to === it.type.from.replace('numeric', 'decimal')
			) {
				delete it.type;
			}
		}

		// geometry
		if (it.type && it.$right.type.startsWith('geometry(point') && it.$left.type.startsWith('geometry(point')) {
			// geometry(point,0)
			const leftSrid = it.$left.type.split(',')[1]?.replace(')', '');
			const rightSrid = it.$right.type.split(',')[1]?.replace(')', '');

			// undefined or 0 are defaults srids
			if (typeof leftSrid === 'undefined' && rightSrid === '0') delete it.type;
			if (typeof rightSrid === 'undefined' && leftSrid === '0') delete it.type;
		}

		// numeric(19) === numeric(19,0)
		if (it.type && it.type.from.replace(',0)', ')') === it.type.to) {
			delete it.type;
		}

		return ddl2.columns.hasDiff(it);
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

	const jsonSetTableSchemas = movedTables.map((it) =>
		prepareStatement('move_table', {
			name: it.to.name, // rename of table comes first
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
	const jsonAlteredPKs: JsonAlterPrimaryKey[] = alteredPKs.map((it) => {
		const deleted = columnsToDelete.some((x) => it.columns?.from.includes(x.name));

		return prepareStatement('alter_pk', { diff: it, pk: it.$right, deleted });
	});

	const jsonRecreateFKs = alters.filter((it) => it.entityType === 'fks').filter((x) => {
		if (
			x.nameExplicit
			&& ((mode === 'push' && x.nameExplicit.from && !x.nameExplicit.to)
				|| x.nameExplicit.to && !x.nameExplicit.from)
		) {
			delete x.nameExplicit;
		}

		return ddl2.fks.hasDiff(x);
	}).map((it) => prepareStatement('recreate_fk', { fk: it.$right, diff: it }));

	const jsonCreateFKs = fksCreates.map((it) => prepareStatement('create_fk', { fk: it }));

	const jsonDropFKs = fksDeletes.filter((fk) => {
		const fromDeletedTable = deletedTables.some((x) => x.schema === fk.schema && x.name === fk.table);
		const toDeletedTable = fk.table !== fk.tableTo
			&& deletedTables.some((x) => x.schema === fk.schemaTo && x.name === fk.tableTo);
		if (fromDeletedTable && !toDeletedTable) return false;
		return true;
	}).map((it) => prepareStatement('drop_fk', { fk: it }));

	const jsonRenameReferences = fksRenames.map((it) =>
		prepareStatement('rename_constraint', {
			schema: it.to.schema,
			table: it.to.table,
			from: it.from.name,
			to: it.to.name,
		})
	);

	const jsonAlterCheckConstraints = alteredChecks.filter((it) => it.value && mode !== 'push').map((it) =>
		prepareStatement('alter_check', { diff: it })
	);
	const jsonCreatePoliciesStatements = policyCreates.map((it) => prepareStatement('create_policy', { policy: it }));
	const jsonDropPoliciesStatements = policyDeletes.map((it) => prepareStatement('drop_policy', { policy: it }));
	const jsonRenamePoliciesStatements = policyRenames.map((it) => prepareStatement('rename_policy', it));

	const alteredPolicies = alters.filter((it) => it.entityType === 'policies').filter((it) => {
		if (it.withCheck && it.withCheck.from && it.withCheck.to) {
			if (it.withCheck.from === `(${it.withCheck.to})` || it.withCheck.to === `(${it.withCheck.from})`) {
				delete it.withCheck;
			}
		}
		return ddl1.policies.hasDiff(it);
	});

	// if I drop policy/ies, I should check if table only had this policy/ies and turn off
	// for non explicit rls =

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
					diff: it,
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
					const c2 = ddl2.columns.one({ schema: it.schema, table: it.table, name: it.name });
					if (c2 === null) return null;

					const def = {
						right: c2.default,
						left: it.default,
					};
					return { ...it, default: def };
				})
				.filter((x) => x !== null);
			recreateEnums.push(prepareStatement('recreate_enum', { to: e, columns, from: alter.$left }));
		} else {
			jsonAlterEnums.push(prepareStatement('alter_enum', { diff: res, to: e, from: alter.$left }));
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

			return ddl2.columns.hasDiff(it);
		})
		.map((it) => {
			const column = it.$right;
			const wasSerial = isSerialType(it.$left.type);
			const toSerial: boolean = !isSerialType(it.$left.type) && isSerialType(it.$right.type);
			const isEnum = ddl2.enums.one({ schema: column.typeSchema ?? 'public', name: column.type }) !== null;
			const wasEnum =
				(it.type && ddl1.enums.one({ schema: column.typeSchema ?? 'public', name: it.type.from }) !== null)
					?? false;

			return prepareStatement('alter_column', {
				diff: it,
				to: column,
				isEnum,
				wasEnum,
				wasSerial,
				toSerial,
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

	const jsonCreateRoles = createdRoles.map((it) => prepareStatement('create_role', { role: it }));
	const jsonDropRoles = deletedRoles.map((it) => prepareStatement('drop_role', { role: it }));
	const jsonRenameRoles = renamedRoles.map((it) => prepareStatement('rename_role', it));
	const jsonAlterRoles = alters.filter((it) => it.entityType === 'roles').map((it) =>
		prepareStatement('alter_role', { diff: it, role: it.$right })
	);

	const jsonGrantPrivileges = createdPrivileges.map((it) => prepareStatement('grant_privilege', { privilege: it }));
	const jsonRevokePrivileges = deletedPrivileges.map((it) => prepareStatement('revoke_privilege', { privilege: it }));
	const jsonAlterPrivileges = alters.filter((it) => it.entityType === 'privileges').map((it) =>
		prepareStatement('regrant_privilege', { privilege: it.$right, diff: it })
	);

	const createSchemas = createdSchemas.map((it) => prepareStatement('create_schema', it));
	const dropSchemas = deletedSchemas.map((it) => prepareStatement('drop_schema', it));
	const renameSchemas = renamedSchemas.map((it) => prepareStatement('rename_schema', it));

	const createTables = createdTables.map((it) => prepareStatement('create_table', { table: tableFromDDL(it, ddl2) }));

	const createViews = createdViews.map((it) => prepareStatement('create_view', { view: it }));

	const jsonDropViews = deletedViews.map((it) => prepareStatement('drop_view', { view: it, cause: null }));

	const jsonRenameViews = renamedViews.map((it) => prepareStatement('rename_view', it));

	const jsonMoveViews = movedViews.map((it) =>
		prepareStatement('move_view', { fromSchema: it.from.schema, toSchema: it.to.schema, view: it.to })
	);

	const filteredViewAlters = alters.filter((it): it is DiffEntities['views'] => {
		if (it.entityType !== 'views') return false;

		if (it.definition && mode === 'push') {
			delete it.definition;
		}

		// default access method
		// from db -> heap,
		// drizzle schema -> null
		if (mode === 'push' && it.using && !it.using.to && it.using.from === defaults.accessMethod) {
			delete it.using;
		}

		if (mode === 'push' && it.tablespace && it.tablespace.from === null && it.tablespace.to === defaults.tablespace) {
			delete it.tablespace;
		}

		return ddl2.views.hasDiff(it);
	});

	const viewsAlters = filteredViewAlters.map((it) => ({ diff: it, view: it.$right }));

	const jsonAlterViews = viewsAlters.filter((it) => !it.diff.definition).map((it) => {
		return prepareStatement('alter_view', {
			diff: it.diff,
			view: it.view,
		});
	});

	// recreate views
	viewsAlters.filter((it) => it.diff.definition).forEach((entry) => {
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

		jsonDropViews.push(prepareStatement('drop_view', { view: it, cause: from }));
		createViews.push(prepareStatement('create_view', { view: it }));
	});

	const columnsToRecreate = columnAlters.filter((it) => it.generated && it.generated.to !== null).filter((it) => {
		// if push and definition changed
		return !(it.generated?.to && it.generated.from && mode === 'push');
	});

	const jsonRecreateColumns = columnsToRecreate.map((it) => {
		const indexes = ddl2.indexes.list({ table: it.table, schema: it.schema }).filter((index) =>
			index.columns.some((column) => trimChar(column.value, '`') === it.name)
		);
		for (const index of indexes) {
			jsonCreateIndexes.push({ type: 'create_index', index });
		}

		const uniques = ddl2.uniques.list({ table: it.table, schema: it.schema, columns: { CONTAINS: it.name } });
		for (const unique of uniques) {
			jsonAddedUniqueConstraints.push({ type: 'add_unique', unique });
		}

		// Not sure if anyone tries to add fk on generated column or from it, but still...
		const fksFrom = ddl2.fks.list({ table: it.table, schema: it.schema, columns: { CONTAINS: it.name } });
		const fksTo = ddl2.fks.list({ tableTo: it.table, schemaTo: it.schema, columnsTo: { CONTAINS: it.name } });
		for (const fkFrom of fksFrom) {
			jsonDropFKs.push({ type: 'drop_fk', fk: fkFrom });
		}
		for (const fkTo of fksTo) {
			jsonDropFKs.push({ type: 'drop_fk', fk: fkTo });
			jsonCreateFKs.push({ type: 'create_fk', fk: fkTo });
		}

		return prepareStatement('recreate_column', {
			diff: it,
			isPK: ddl2.pks.one({ schema: it.schema, table: it.table, columns: [it.name] }) !== null,
		});
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

	jsonStatements.push(...jsonRenameRoles);
	jsonStatements.push(...jsonDropRoles);
	jsonStatements.push(...jsonCreateRoles);
	jsonStatements.push(...jsonAlterRoles);

	jsonStatements.push(...jsonRevokePrivileges);
	jsonStatements.push(...jsonGrantPrivileges);
	jsonStatements.push(...jsonAlterPrivileges);

	jsonStatements.push(...createTables);

	jsonStatements.push(...jsonDropViews);
	jsonStatements.push(...jsonRenameViews);
	jsonStatements.push(...jsonMoveViews);
	jsonStatements.push(...jsonAlterViews);

	jsonStatements.push(...jsonRenameTables);
	jsonStatements.push(...jsonDropPoliciesStatements); // before drop tables
	jsonStatements.push(...jsonDropFKs);

	jsonStatements.push(...jsonDropTables);
	jsonStatements.push(...jsonAlterRlsStatements);
	jsonStatements.push(...jsonSetTableSchemas);
	jsonStatements.push(...jsonRenameColumnsStatements);

	jsonStatements.push(...jsonDropUniqueConstraints);
	jsonStatements.push(...jsonDropCheckConstraints);

	// TODO: ? will need to drop indexes before changing any columns in table
	// Then should go column alternations and then index creation
	jsonStatements.push(...jsonRenameIndexes);
	jsonStatements.push(...jsonDropIndexes);
	jsonStatements.push(...jsonDropPrimaryKeys);

	jsonStatements.push(...jsonRenameReferences);
	jsonStatements.push(...jsonAddColumnsStatemets);
	jsonStatements.push(...jsonAddPrimaryKeys);
	jsonStatements.push(...jsonRenamePrimaryKey);
	jsonStatements.push(...recreateEnums);
	jsonStatements.push(...jsonRecreateColumns);

	jsonStatements.push(...jsonDropColumnsStatemets);
	jsonStatements.push(...jsonAlteredPKs);
	jsonStatements.push(...jsonAlterColumns);

	jsonStatements.push(...jsonRecreateIndex);

	jsonStatements.push(...jsonRenamedUniqueConstraints);
	jsonStatements.push(...jsonAddedUniqueConstraints);
	jsonStatements.push(...jsonAlteredUniqueConstraints);
	jsonStatements.push(...jsonCreateIndexes); // above fks for uniqueness constraint to come first

	jsonStatements.push(...jsonCreateFKs);
	jsonStatements.push(...jsonRecreateFKs);

	jsonStatements.push(...jsonCreatedCheckConstraints);

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
