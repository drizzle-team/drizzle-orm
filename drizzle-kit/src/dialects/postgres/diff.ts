import { prepareMigrationRenames, trimChar } from '../../utils';
import { mockResolver } from '../../utils/mocks';
import { deepStrictEqual } from '../../utils/node-assert/deep-strict-equal';
import { diffStringArrays } from '../../utils/sequence-matcher';
import { parse } from '../../utils/when-json-met-bigint';
import type { Resolver } from '../common';
import { type Delta, delta, diff, recordDeltas } from '../dialect';
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
	Role,
	Schema,
	Sequence,
	UniqueConstraint,
	View,
} from './ddl';
import { createDDL, tableFromDDL } from './ddl';
import { defaults, defaultsCommutative, existsInViewDef, isSerialType } from './grammar';
import type { SnapshotStatement } from './snapshot-statements';
import type { JsonAlterPrimaryKey, JsonRecreateIndex, JsonStatement } from './statements';
import { prepareStatement } from './statements';

type Named = { schema: string; name: string };
type Renamed = { from: Named; to: Named };

const namesOf = (relations: Named[]): Named[] => relations.map(({ schema, name }) => ({ schema, name }));

const takesFreedName = (taker: Renamed, freed: Renamed) =>
	taker.to.schema === freed.from.schema && taker.to.name === freed.from.name;

// A rename can take the name that another rename of the list frees. The rename that frees the name comes
// first. Names that form a cycle have no order that works, so those renames keep their order.
const freedNamesFirst = <T extends Renamed>(renames: T[]): T[] => {
	const sorted: T[] = [];
	let rest = renames;
	while (rest.length > 0) {
		const ready = rest.filter((it) => !rest.some((other) => other !== it && takesFreedName(it, other)));
		if (ready.length === 0) break;
		sorted.push(...ready);
		rest = rest.filter((it) => !ready.includes(it));
	}
	return [...sorted, ...rest];
};

// Each group of renames has its own place in a migration, and the groups run in the order of the list. A
// rename of a later group joins an earlier group when a rename of that group takes the name that it frees.
// A group that no rename joins keeps its order.
const freedNamesInEarlierGroups = <T extends Renamed>(groups: T[][]): T[][] => {
	const result = groups.map((group) => [...group]);
	for (let idx = 0; idx < result.length; idx++) {
		const ownCount = result[idx].length;
		while (true) {
			const joining = result.slice(idx + 1).flat().filter((it) =>
				result[idx].some((taker) => takesFreedName(taker, it))
			);
			if (joining.length === 0) break;
			result[idx].push(...joining);
			for (let later = idx + 1; later < result.length; later++) {
				result[later] = result[later].filter((it) => !joining.includes(it));
			}
		}
		if (result[idx].length > ownCount) result[idx] = freedNamesFirst(result[idx]);
	}
	return result;
};

// A relation that moves to another schema and gets a new name has a third name between its two statements.
// When the rename runs first, the third name is its new name in the old schema. When the move runs first,
// the third name is its old name in the new schema. `usualFirst` is the statement that runs first for this
// kind of relation. This returns the relations that need the other statement first: a relation of `taken`
// has the third name of the usual order, and no relation of `maybeTaken` has the third name of the other
// order. When both third names are taken, no order works, and the usual order stays.
const inOtherOrder = <T extends Renamed>(
	moved: T[],
	usualFirst: 'rename' | 'move',
	taken: Named[],
	maybeTaken: Named[],
): T[] => {
	const has = (relations: Named[], it: Named) =>
		relations.some((relation) => relation.schema === it.schema && relation.name === it.name);
	return moved.filter((it) => {
		if (it.from.name === it.to.name) return false;
		const afterRename = { schema: it.from.schema, name: it.to.name };
		const afterMove = { schema: it.to.schema, name: it.from.name };
		const [usual, other] = usualFirst === 'rename' ? [afterRename, afterMove] : [afterMove, afterRename];
		return has(taken, usual) && !has(maybeTaken, other);
	});
};

export const ddlDiffDry = async (ddlFrom: PostgresDDL, ddlTo: PostgresDDL, mode: 'default' | 'push') => {
	const mocks = new Set<string>();
	return ddlDiff(
		ddlFrom,
		ddlTo,
		mockResolver(mocks), // schemas
		mockResolver(mocks), // enums
		mockResolver(mocks), // sequences
		mockResolver(mocks), // policies
		mockResolver(mocks), // roles
		mockResolver(mocks), // tables
		mockResolver(mocks), // columns
		mockResolver(mocks), // views
		mockResolver(mocks), // uniques
		mockResolver(mocks), // indexes
		mockResolver(mocks), // checks
		mockResolver(mocks), // pks
		mockResolver(mocks), // fks
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
	// With false, a constraint whose generated name differs between the states is dropped and created.
	keepGeneratedNames = true,
): Promise<{
	statements: JsonStatement[];
	snapshotStatements: SnapshotStatement[];
	sqlStatements: string[];
	groupedStatements: { jsonStatement: JsonStatement; sqlStatements: string[] }[];
	renames: string[];
	deltas: Delta[];
}> => {
	const ddl1Copy = createDDL();
	for (const entity of ddl1.entities.list()) {
		ddl1Copy.entities.push(entity);
	}

	const recorded = recordDeltas(ddl1);

	const schemasDiff = diff(ddl1, ddl2, 'schemas');
	const { created: createdSchemas, deleted: deletedSchemas, renamedOrMoved: renamedSchemas } = await schemasResolver({
		created: schemasDiff.filter((it) => it.$diffType === 'create'),
		deleted: schemasDiff.filter((it) => it.$diffType === 'drop'),
	});

	for (const rename of renamedSchemas) {
		ddl1.schemas.update({
			set: { name: rename.to.name },
			where: { name: rename.from.name },
		});
	}

	const enumsDiff = diff(ddl1, ddl2, 'enums');
	const { created: createdEnums, deleted: deletedEnums, renamedOrMoved: renamedOrMovedEnums } = await enumsResolver({
		created: enumsDiff.filter((it) => it.$diffType === 'create'),
		deleted: enumsDiff.filter((it) => it.$diffType === 'drop'),
	});

	const renamedEnums = renamedOrMovedEnums.filter((it) => it.from.name !== it.to.name);
	const movedEnums = renamedOrMovedEnums.filter((it) => it.from.schema !== it.to.schema);

	for (const rename of renamedEnums) {
		ddl1.enums.update({
			set: { name: rename.to.name, schema: rename.to.schema },
			where: { name: rename.from.name, schema: rename.from.schema },
		});
	}
	for (const move of movedEnums) {
		ddl1.enums.update({
			set: { schema: move.to.schema },
			where: { name: move.from.name, schema: move.from.schema },
		});
	}

	const sequencesDiff = diff(ddl1, ddl2, 'sequences');
	const { created: createdSeqs, deleted: deletedSeqs, renamedOrMoved: renamedOrMovedSeqs } = await sequencesResolver({
		created: sequencesDiff.filter((it) => it.$diffType === 'create'),
		deleted: sequencesDiff.filter((it) => it.$diffType === 'drop'),
	});

	const renamedSequences = renamedOrMovedSeqs.filter((it) => it.from.name !== it.to.name);
	const movedSequences = renamedOrMovedSeqs.filter((it) => it.from.schema !== it.to.schema);

	// Tables, views, sequences and indexes of one schema share one namespace, and a primary key or a unique
	// constraint owns an index with its name. No statement before the table renames drops or renames a table,
	// an index or a constraint, so their names of the old state are all taken at the statements of sequences
	// and views and at the table renames. The table drops run after the table renames, before the table moves.
	const tablesAndIndexesOf = (ddl: PostgresDDL) =>
		namesOf([...ddl.tables.list(), ...ddl.indexes.list(), ...ddl.pks.list(), ...ddl.uniques.list()]);
	const oldTablesAndIndexes = tablesAndIndexesOf(ddl1);
	// A relation of the old state can be gone when a statement runs, and a relation of the new state can be
	// missing. So a name in this list is only possibly taken.
	const relationsOfBothStates = [
		...oldTablesAndIndexes,
		...tablesAndIndexesOf(ddl2),
		...namesOf([...ddl1.views.list(), ...ddl2.views.list(), ...ddl1.sequences.list(), ...ddl2.sequences.list()]),
	];
	// A new sequence is created before the moves and renames of sequences, views and tables, and a dropped
	// sequence is dropped after them. Both hold their names there, like a sequence that stays.
	const sequencesInPlace = namesOf([
		...createdSeqs,
		...ddl1.sequences.list().filter((it) =>
			!renamedOrMovedSeqs.some((renamed) => renamed.from.schema === it.schema && renamed.from.name === it.name)
		),
	]);
	// A sequence moves first and gets its new name in its new schema. The views of the old state are all
	// still there at that point.
	const sequencesRenamedBeforeMove = new Set(inOtherOrder(
		movedSequences,
		'move',
		[...oldTablesAndIndexes, ...ddl1.views.list(), ...sequencesInPlace],
		relationsOfBothStates,
	));

	for (const it of renamedOrMovedSeqs) {
		ddl1.sequences.update({
			set: { name: it.to.name, schema: it.to.schema },
			where: { name: it.from.name, schema: it.from.schema },
		});
	}

	const rolesDiff = diff(ddl1, ddl2, 'roles');
	const { created: createdRoles, deleted: deletedRoles, renamedOrMoved: renamedRoles } = await roleResolver({
		created: rolesDiff.filter((it) => it.$diffType === 'create'),
		deleted: rolesDiff.filter((it) => it.$diffType === 'drop'),
	});
	for (const rename of renamedRoles) {
		ddl1.roles.update({
			set: { name: rename.to.name },
			where: { name: rename.from.name },
		});
	}

	const tablesDiff = diff(ddl1, ddl2, 'tables');
	const { created: createdTables, deleted: deletedTables, renamedOrMoved: orMovedTables } = await tablesResolver({
		created: tablesDiff.filter((it) => it.$diffType === 'create'),
		deleted: tablesDiff.filter((it) => it.$diffType === 'drop'),
	});

	const renamedTables = orMovedTables.filter((it) => it.from.name !== it.to.name);
	const movedTables = orMovedTables.filter((it) => it.from.schema !== it.to.schema);

	// A new table is created before the moves and renames of views and tables, together with its primary key
	// and its unique constraints.
	const createdWithTables = namesOf(createdTables.flatMap((it) => [
		it,
		...ddl2.pks.list({ schema: it.schema, table: it.name }),
		...ddl2.uniques.list({ schema: it.schema, table: it.name }),
	]));
	// The database prints a view definition in another form than the schema file, so push does not compare it.
	const isViewRecreated = (from: View, to: View) =>
		from.materialized !== to.materialized || (mode !== 'push' && from.definition !== to.definition);
	// A view with the same schema and name in both states is not dropped, renamed or moved. A view with a new
	// definition or a new kind is dropped between the statements of views and the statements of tables, and
	// it is created again later.
	const viewsInPlace = ddl1.views.list().flatMap((it) => {
		const next = ddl2.views.one({ schema: it.schema, name: it.name });
		return next ? [{ schema: it.schema, name: it.name, isRecreated: isViewRecreated(it, next) }] : [];
	});

	// A table that moves and gets a new name is renamed in its old schema and then moved. A dropped table is
	// still there at the rename, so the tables of the old state all count. When a table has the new name in
	// the old schema, the move runs first unless a table has the old name in the new schema. When another
	// relation has the new name in the old schema, the move runs first only if no relation of the two states
	// has the old name in the new schema.
	const oldAndCreatedTables = namesOf([...ddl1.tables.list(), ...createdTables]);
	const tablesMovedBeforeRename = new Set([
		...inOtherOrder(movedTables, 'rename', oldAndCreatedTables, oldAndCreatedTables),
		...inOtherOrder(
			movedTables,
			'rename',
			[
				...oldTablesAndIndexes,
				...createdWithTables,
				...sequencesInPlace,
				...viewsInPlace.filter((it) => !it.isRecreated),
			],
			relationsOfBothStates,
		),
	]);

	for (const rename of orMovedTables) {
		ddl1.tables.update({
			set: { name: rename.to.name, schema: rename.to.schema },
			where: { name: rename.from.name, schema: rename.from.schema },
		});

		// Drizzle Studio builds the new state from the form of one table and copies the rest from the old
		// state. So the foreign keys of other tables and the policies of the renamed table can still name the
		// old table. The new state holds no table with the old name, so every such name is stale.
		ddl2.fks.update({
			set: { schemaTo: rename.to.schema, tableTo: rename.to.name },
			where: { schemaTo: rename.from.schema, tableTo: rename.from.name },
		});
		ddl2.entities.update({
			set: { schema: rename.to.schema, table: rename.to.name },
			where: { schema: rename.from.schema, table: rename.from.name },
		});
	}

	// after table renames
	const privilegesDiff = diff(ddl1, ddl2, 'privileges');
	const createdPrivileges = privilegesDiff.filter((it) => it.$diffType === 'create');
	const deletedPrivileges = privilegesDiff.filter((it) => it.$diffType === 'drop');

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
			set: { name: rename.to.name, schema: rename.to.schema },
			// scope by table: two tables can share a column name, and under dialect2 an
			// unscoped rename would also rename the other column, whose change propagates
			// through fk/index edges into columnsTo — a spurious constraint recreate.
			where: { name: rename.from.name, schema: rename.from.schema, table: rename.from.table },
		});

		// The form of Drizzle Studio renames a column only in the column list. So the indexes and the
		// constraints of the new state can still name the old column. The new state holds no column with the
		// old name in this table, so every such name is stale.
		const newNameOf = (column: string) => column === rename.from.name ? rename.to.name : column;
		const inTable = { schema: rename.to.schema, table: rename.to.table };
		ddl2.indexes.update({
			set: { columns: (it: IndexColumn) => it.isExpression ? it : { ...it, value: newNameOf(it.value) } },
			where: inTable,
		});
		ddl2.pks.update({ set: { columns: newNameOf }, where: inTable });
		ddl2.uniques.update({ set: { columns: newNameOf }, where: inTable });
		ddl2.fks.update({ set: { columns: newNameOf }, where: inTable });
		ddl2.fks.update({
			set: { columnsTo: newNameOf },
			where: { schemaTo: rename.to.schema, tableTo: rename.to.table },
		});
	}

	if (keepGeneratedNames) {
		preserveEntityNames(ddl1.uniques, ddl2.uniques, mode);
		preserveEntityNames(ddl1.fks, ddl2.fks, mode);
		preserveEntityNames(ddl1.pks, ddl2.pks, mode);
		preserveEntityNames(ddl1.indexes, ddl2.indexes, mode);
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
			set: { name: rename.to.name, schema: rename.to.schema },
			where: { name: rename.from.name, schema: rename.from.schema, table: rename.from.table },
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
			set: { name: rename.to.name, schema: rename.to.schema },
			where: { name: rename.from.name, schema: rename.from.schema, table: rename.from.table },
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
	// The key of an index holds no table. An index that keeps its name on another table is a new index, and
	// the old one is dropped.
	for (const it of diff.alters(ddl1, ddl2, 'indexes')) {
		if (it.$left.table === it.$right.table) continue;
		indexesDeletes.push(it.$left);
		indexesCreates.push(it.$right);
	}

	for (const rename of indexesRenames) {
		ddl1.indexes.update({
			set: { name: rename.to.name, schema: rename.to.schema },
			where: { name: rename.from.name, schema: rename.from.schema },
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
			set: { name: rename.to.name, schema: rename.to.schema },
			where: { name: rename.from.name, schema: rename.from.schema, table: rename.from.table },
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
			set: { name: rename.to.name, schema: rename.to.schema },
			where: { name: rename.from.name, schema: rename.from.schema, table: rename.from.table },
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
			set: { name: rename.to.name, schema: rename.to.schema },
			where: { name: rename.from.name, schema: rename.from.schema, table: rename.from.table },
		});
	}

	const viewsDiff = diff(ddl1, ddl2, 'views');

	const { created: createdViews, deleted: deletedViews, renamedOrMoved: renamedOrMovedViews } = await viewsResolver({
		created: viewsDiff.filter((it) => it.$diffType === 'create'),
		deleted: viewsDiff.filter((it) => it.$diffType === 'drop'),
	});

	const renamedViews = renamedOrMovedViews.filter((it) => it.from.name !== it.to.name);
	const movedViews = renamedOrMovedViews.filter((it) => it.from.schema !== it.to.schema);

	// A view that moves and gets a new name is renamed in its old schema and then moved. A view that is
	// created again is still there at the rename.
	const viewsMovedBeforeRename = new Set(inOtherOrder(
		movedViews,
		'rename',
		[...oldTablesAndIndexes, ...createdWithTables, ...sequencesInPlace, ...viewsInPlace],
		relationsOfBothStates,
	));

	for (const it of renamedOrMovedViews) {
		ddl1.views.update({
			set: { name: it.to.name, schema: it.to.schema },
			where: { name: it.from.name, schema: it.from.schema },
		});
	}

	// The order of the roles of a policy has no meaning in SQL. After a role rename, the old state can list
	// them in another order than the schema does. The new state then keeps the order of the old state. So
	// the snapshot stores no change of the whole list, which would overwrite a role rename of another branch.
	for (const { schema, table, name, roles } of ddl2.policies.list()) {
		const old = ddl1.policies.one({ schema, table, name });
		if (!old || old.roles.length !== roles.length) continue;
		const [before, after] = [[...old.roles].sort(), [...roles].sort()];
		if (before.every((role, idx) => role === after[idx])) {
			ddl2.policies.update({ set: { roles: [...old.roles] }, where: { schema, table, name } });
		}
	}

	const all = diff.all(ddl1, ddl2);
	// convert now: the statement code below deletes fields from the alter rows
	const deltas: Delta[] = [...recorded, ...delta(ddl1, ddl2, all)];
	const alters = all.filter((it): it is Extract<typeof it, { $diffType: 'alter' }> => it.$diffType === 'alter');

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

	const indexRenameSteps = indexesRenames.map((r) => ({
		...r,
		statement: prepareStatement('rename_index', {
			schema: r.to.schema,
			table: r.to.table,
			from: r.from.name,
			to: r.to.name,
			columns: (r.to.columns ?? []).filter((c) => !c.isExpression).map((c) => c.value),
		}),
	}));

	const indexesAlters = alters.filter((it): it is DiffEntities['indexes'] => {
		if (it.entityType !== 'indexes' || it.$left.table !== it.$right.table) return false;

		delete it.concurrently;

		return ddl2.indexes.hasDiff(it);
	});

	const jsonRecreateIndex: JsonRecreateIndex[] = [];
	for (const idx of indexesAlters) {
		const forWhere = !!idx.where && (idx.where.from !== null && idx.where.to !== null ? mode !== 'push' : true);
		const forColumns = !!idx.columns && (idx.columns.from.length === idx.columns.to.length ? mode !== 'push' : true);

		if (idx.isUnique || idx.concurrently || idx.method || idx.with || forColumns || forWhere) {
			const index = ddl2.indexes.one({ schema: idx.schema, table: idx.table, name: idx.name })!;

			// when a column used by the index is being dropped, the index is dropped with it (cascade),
			// so the recreate must skip the explicit DROP INDEX
			const prevIndex = ddl1.indexes.one({ schema: idx.schema, table: idx.table, name: idx.name });
			const shouldDrop = !!prevIndex
				&& !columnsToDelete.some((col) =>
					col.schema === idx.schema
					&& col.table === idx.table
					&& prevIndex.columns.some((idxCol) => idxCol.value === col.name)
				);
			jsonRecreateIndex.push(prepareStatement('recreate_index', { index, diff: idx, shouldDrop }));
		}
	}

	const jsonDropTables = deletedTables.map((it) => {
		const oldSchema = renamedSchemas.find((x) => x.to.name === it.schema);
		const key = oldSchema ? `"${oldSchema.from.name}"."${it.name}"` : `"${it.schema}"."${it.name}"`;
		return prepareStatement('drop_table', { table: tableFromDDL(it, ddl2), key });
	});
	const jsonRenameTables = renamedTables.filter((it) => !tablesMovedBeforeRename.has(it)).map((it) =>
		prepareStatement('rename_table', {
			schema: it.from.schema,
			from: it.from.name,
			to: it.to.name,
		})
	);
	const jsonRenameMovedTables = renamedTables.filter((it) => tablesMovedBeforeRename.has(it)).map((it) =>
		prepareStatement('rename_table', {
			schema: it.to.schema,
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

		// A snapshot of an older format can store no schema for the enum of a column. So a change of only the
		// schema of the type counts when both states name a schema.
		if (!it.type && it.typeSchema && (it.typeSchema.from === null || it.typeSchema.to === null)) {
			delete it.typeSchema;
		}

		// Postgres has one type for every count of array dimensions, and the count in its catalog is 0 for a
		// column of a partition, of an inherited table and of a table from CREATE TABLE AS.
		if (mode === 'push' && it.dimensions && it.dimensions.from > 0 && it.dimensions.to > 0) {
			delete it.dimensions;
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
	const uniqueRenameSteps = freedNamesFirst(uniqueRenames).map((it) => ({
		...it,
		statement: prepareStatement('rename_constraint', {
			entityType: 'uniques',
			schema: it.to.schema,
			table: it.to.table,
			from: it.from.name,
			to: it.to.name,
			columns: it.to.columns ?? [],
		}),
	}));

	const jsonAddPrimaryKeys = pksCreates.filter(tablesFilter('created')).map((it) =>
		prepareStatement('add_pk', { pk: it })
	);

	const jsonDropPrimaryKeys = pksDeletes.filter(tablesFilter('deleted')).map((it) =>
		prepareStatement('drop_pk', { pk: it })
	);

	const pkRenameSteps = freedNamesFirst(pksRenames).map((it) => ({
		...it,
		statement: prepareStatement('rename_constraint', {
			entityType: 'pks',
			schema: it.to.schema,
			table: it.to.table,
			from: it.from.name,
			to: it.to.name,
			columns: it.to.columns ?? [],
		}),
	}));

	// A primary key or a unique constraint owns an index with its name, so the three kinds share their names.
	// A rename of a constraint can run at the place of an earlier kind: its SQL names only the table, and the
	// table has its new schema and name before the first of these places.
	const [jsonRenameIndexes, jsonRenamePrimaryKey, jsonRenamedUniqueConstraints] = freedNamesInEarlierGroups<
		Renamed & { statement: JsonStatement }
	>([indexRenameSteps, pkRenameSteps, uniqueRenameSteps]).map((group) => group.map((it) => it.statement));

	const jsonSetTableSchemas = movedTables.map((it) => {
		const ofTable = { schema: it.to.schema, table: it.to.name };
		return prepareStatement('move_table', {
			name: tablesMovedBeforeRename.has(it) ? it.from.name : it.to.name,
			from: it.from.schema,
			to: it.to.schema,
			relations: [...ddl1.indexes.list(ofTable), ...ddl1.pks.list(ofTable), ...ddl1.uniques.list(ofTable)]
				.map((relation) => relation.name).sort(),
		});
	});

	// columns a check references, found by keeping only expression identifiers that
	// are real columns of the table (so a keyword/function is never mistaken for one)
	const checkColumns = (value: string, ddl: PostgresDDL, schema: string, table: string): string[] => {
		const names = new Set(ddl.columns.list({ schema, table }).map((c) => c.name));
		const found = new Set<string>();
		const re = /"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*)/g;
		let m: RegExpExecArray | null;
		while ((m = re.exec(value ?? '')) !== null) {
			const id = m[1] ?? m[2];
			if (names.has(id)) found.add(id);
		}
		return [...found];
	};
	const jsonCreatedCheckConstraints = checkCreates.filter(tablesFilter('created')).map((it) =>
		prepareStatement('add_check', { check: it, columns: checkColumns(it.value, ddl2, it.schema, it.table) })
	);
	const jsonDropCheckConstraints = checkDeletes.filter(tablesFilter('deleted')).map((it) =>
		prepareStatement('drop_check', { check: it, columns: checkColumns(it.value, ddl1, it.schema, it.table) })
	);
	const jsonRenamedCheckConstraints = checkRenames.map((it) =>
		prepareStatement('rename_constraint', {
			entityType: 'checks',
			schema: it.to.schema,
			table: it.to.table,
			from: it.from.name,
			to: it.to.name,
			columns: checkColumns(it.to.value, ddl2, it.to.schema, it.to.table),
		})
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
		if (x.nameExplicit) delete x.nameExplicit;

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

	const jsonAlterCheckConstraints = alteredChecks.filter((it) => it.value && mode !== 'push').map((it) =>
		prepareStatement('alter_check', {
			diff: it,
			newColumns: checkColumns(it.$right?.value ?? '', ddl2, it.schema, it.table),
			oldColumns: checkColumns(it.$left?.value ?? '', ddl2, it.schema, it.table),
		})
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
			// A snapshot of an older format can store no schema for the enum of a column. The schema file then
			// says whether a column with the name of the type has this enum.
			const columns = ddl1.columns.list({ type: alter.name })
				.map((it) => {
					const c2 = ddl2.columns.one({ schema: it.schema, table: it.table, name: it.name });
					if (c2 === null) return null;
					const typeSchema = it.typeSchema ?? (c2.type === it.type ? c2.typeSchema : null);
					if (typeSchema !== alter.schema) return null;

					const def = {
						right: c2.default,
						left: it.default,
					};
					return { ...it, typeSchema, default: def };
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
			const wasEnum = !!(it.type || it.typeSchema || it.dimensions)
				&& ddl1.enums.one({ schema: it.$left.typeSchema ?? 'public', name: it.$left.type }) !== null;

			return prepareStatement('alter_column', {
				diff: it,
				to: column,
				isEnum,
				wasEnum,
				wasSerial,
				toSerial,
			});
		});

	const createSequences = createdSeqs.map((it) => prepareStatement('create_sequence', { sequence: it }));
	const dropSequences = deletedSeqs.map((it) => prepareStatement('drop_sequence', { sequence: it }));
	// The rename runs first here, so the sequence is renamed in its old schema and moves with its new name.
	const renameSequencesInOldSchema = renamedSequences.filter((it) => sequencesRenamedBeforeMove.has(it)).map((it) =>
		prepareStatement('rename_sequence', { from: it.from, to: { ...it.to, schema: it.from.schema } })
	);
	const moveSequences = movedSequences.map((it) => {
		const name = sequencesRenamedBeforeMove.has(it) ? it.to.name : it.from.name;
		return prepareStatement('move_sequence', { from: { ...it.from, name }, to: { ...it.to, name } });
	});
	// The move runs first, so a sequence that also gets a new name is renamed in its new schema.
	const renameSequences = renamedSequences.filter((it) => !sequencesRenamedBeforeMove.has(it)).map((it) =>
		prepareStatement('rename_sequence', { from: { ...it.from, schema: it.to.schema }, to: it.to })
	);
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

	// The rename runs first, so a view that also moves is renamed in its old schema.
	const jsonRenameViews = renamedViews.filter((it) => !viewsMovedBeforeRename.has(it)).map((it) =>
		prepareStatement('rename_view', { from: it.from, to: { ...it.to, schema: it.from.schema } })
	);
	// The move runs first here, so the view moves with its old name and is renamed in its new schema.
	const jsonRenameMovedViews = renamedViews.filter((it) => viewsMovedBeforeRename.has(it)).map((it) =>
		prepareStatement('rename_view', { from: { ...it.from, schema: it.to.schema }, to: it.to })
	);

	// The view still has its old kind when it moves. A view that changes its kind is dropped and created later.
	const jsonMoveViews = movedViews.map((it) =>
		prepareStatement('move_view', {
			fromSchema: it.from.schema,
			toSchema: it.to.schema,
			view: {
				...it.to,
				name: viewsMovedBeforeRename.has(it) ? it.from.name : it.to.name,
				materialized: it.from.materialized,
			},
		})
	);

	const filteredViewAlters = alters.filter((it): it is DiffEntities['views'] => {
		if (it.entityType !== 'views') return false;

		if (it.definition && mode === 'push') {
			delete it.definition;
		}

		// default access method
		// from db -> heap,
		// drizzle schema -> null
		//
		// should work for push and generate since that is commutative
		// + when we introspect we recieve heap,
		if (it.using && !it.using.to && it.using.from === defaults.accessMethod) {
			delete it.using;
		}

		if (mode === 'push' && it.tablespace && it.tablespace.from === null && it.tablespace.to === defaults.tablespace) {
			delete it.tablespace;
		}

		return ddl2.views.hasDiff(it);
	});

	const viewsAlters = filteredViewAlters.map((it) => ({ diff: it, view: it.$right }));

	const jsonAlterViews = viewsAlters.filter((it) => !isViewRecreated(it.diff.$left, it.diff.$right)).map((it) => {
		return prepareStatement('alter_view', {
			diff: it.diff,
			view: it.view,
		});
	});

	const jsonDropRecreatedViews: typeof jsonDropViews = [];
	// recreate views
	viewsAlters.filter((it) => isViewRecreated(it.diff.$left, it.diff.$right)).forEach((entry) => {
		const it = entry.view;
		const viewRename = renamedOrMovedViews.find((r) => r.to.schema === it.schema && r.to.name === it.name);
		const viewSchema = viewRename ? viewRename.from.schema : it.schema;
		const schemaRename = renamedSchemas.find((r) => r.to.name === viewSchema);
		const schema = schemaRename ? schemaRename.from.name : viewSchema;
		const name = viewRename ? viewRename.from.name : it.name;
		const from = ddl1Copy.views.one({ schema, name });

		if (!from) {
			throw new Error(`
				Missing view in original ddl:
				${it.schema}:${it.name}
				${schema}:${name}
				`);
		}

		jsonDropRecreatedViews.push(prepareStatement('drop_view', { view: entry.diff.$left, cause: from }));
		createViews.push(prepareStatement('create_view', { view: it }));
	});

	const columnsToRecreate = columnAlters.filter((it) => it.generated && it.generated.to !== null).filter((it) => {
		// if push and definition changed
		return !(it.generated?.to && it.generated.from && mode === 'push');
	});

	const isSameFk = (a: ForeignKey, b: ForeignKey) => a.schema === b.schema && a.table === b.table && a.name === b.name;
	// A foreign key can use two recreated columns, so each key is in this list one time.
	const fksOfRecreatedColumns: ForeignKey[] = [];

	const jsonRecreateColumns = columnsToRecreate.map((it) => {
		const indexes = ddl2.indexes.list({ table: it.table, schema: it.schema }).filter((index) =>
			index.columns.some((column) => trimChar(column.value, '`') === it.name)
		);
		// A new index and a new unique constraint already have their create statements. An index or a unique
		// constraint of two recreated columns is found two times.
		for (const index of indexes) {
			const isListed = jsonCreateIndexes.some((it) => it.index.schema === index.schema && it.index.name === index.name);
			if (!isListed) jsonCreateIndexes.push({ type: 'create_index', index });
		}

		const uniques = ddl2.uniques.list({ table: it.table, schema: it.schema, columns: { CONTAINS: it.name } });
		for (const unique of uniques) {
			const isListed = jsonAddedUniqueConstraints.some(({ unique: other }) =>
				other.schema === unique.schema && other.table === unique.table && other.name === unique.name
			);
			if (!isListed) jsonAddedUniqueConstraints.push({ type: 'add_unique', unique });
		}

		// Not sure if anyone tries to add fk on generated column or from it, but still...
		const fksFrom = ddl2.fks.list({ table: it.table, schema: it.schema, columns: { CONTAINS: it.name } });
		const fksTo = ddl2.fks.list({ tableTo: it.table, schemaTo: it.schema, columnsTo: { CONTAINS: it.name } });
		for (const fk of [...fksFrom, ...fksTo]) {
			if (!fksOfRecreatedColumns.some((other) => isSameFk(other, fk))) fksOfRecreatedColumns.push(fk);
		}

		return prepareStatement('recreate_column', {
			diff: it,
			isPK: ddl2.pks.one({ schema: it.schema, table: it.table, columns: [it.name] }) !== null,
		});
	});

	for (const fk of fksOfRecreatedColumns) {
		// A new foreign key is not in the database yet, and it has its own create statement.
		if (fksCreates.some((created) => isSameFk(created, fk))) continue;
		// The drops of foreign keys run before the renames of foreign keys. So a renamed key is dropped with its
		// old name and created with its new name.
		const rename = fksRenames.find((it) => isSameFk(it.to, fk));
		jsonDropFKs.push({ type: 'drop_fk', fk: rename?.from ?? fk });
		jsonCreateFKs.push({ type: 'create_fk', fk });
	}

	// A foreign key of a recreated column already has its new name when it is created again.
	const jsonRenameReferences = fksRenames.filter((it) => !fksOfRecreatedColumns.some((fk) => isSameFk(fk, it.to)))
		.map((it) =>
			prepareStatement('rename_constraint', {
				entityType: 'fks',
				schema: it.to.schema,
				table: it.to.table,
				from: it.from.name,
				to: it.to.name,
				columns: it.to.columns ?? [],
			})
		);

	jsonStatements.push(...createSchemas);
	jsonStatements.push(...renameSchemas);
	jsonStatements.push(...jsonCreateEnums);
	jsonStatements.push(...jsonMoveEnums);
	jsonStatements.push(...jsonRenameEnums);
	jsonStatements.push(...jsonAlterEnums);

	jsonStatements.push(...createSequences);
	jsonStatements.push(...renameSequencesInOldSchema);
	jsonStatements.push(...moveSequences);
	jsonStatements.push(...renameSequences);
	jsonStatements.push(...jsonAlterSequences);

	jsonStatements.push(...jsonRenameRoles);
	jsonStatements.push(...jsonCreateRoles);
	jsonStatements.push(...jsonAlterRoles);

	jsonStatements.push(...jsonRevokePrivileges);
	jsonStatements.push(...jsonGrantPrivileges);
	jsonStatements.push(...jsonAlterPrivileges);

	jsonStatements.push(...createTables);

	jsonStatements.push(...jsonDropViews);
	jsonStatements.push(...jsonRenameViews);
	jsonStatements.push(...jsonMoveViews);
	jsonStatements.push(...jsonRenameMovedViews);
	// the drop uses the new name and schema of the view, so it must run after the rename or move
	jsonStatements.push(...jsonDropRecreatedViews);
	jsonStatements.push(...jsonAlterViews);

	jsonStatements.push(...jsonRenameTables);
	// A move takes the indexes and constraints of its table into the new schema, where a dropped table can
	// still hold one of their names. So the table drops run before the moves. A statement about a moved
	// table names the table in its new schema, so it runs after the moves.
	const isMoved = (it: { schema: string; table: string }) =>
		movedTables.some((moved) => moved.to.schema === it.schema && moved.to.name === it.table);
	jsonStatements.push(...jsonDropPoliciesStatements.filter((it) => !isMoved(it.policy))); // before drop tables
	jsonStatements.push(...jsonDropFKs.filter((it) => !isMoved(it.fk)));

	jsonStatements.push(...jsonDropTables);
	jsonStatements.push(...jsonSetTableSchemas);
	jsonStatements.push(...jsonRenameMovedTables);
	jsonStatements.push(...jsonDropPoliciesStatements.filter((it) => isMoved(it.policy)));
	jsonStatements.push(...jsonDropFKs.filter((it) => isMoved(it.fk)));
	jsonStatements.push(...jsonAlterRlsStatements);
	jsonStatements.push(...jsonRenameColumnsStatements);

	jsonStatements.push(...jsonDropUniqueConstraints);
	jsonStatements.push(...jsonDropCheckConstraints);
	jsonStatements.push(...jsonRenamedCheckConstraints);

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

	// Topological sort
	// this sort fixes this issue: https://github.com/drizzle-team/drizzle-orm/issues/4520 and https://github.com/drizzle-team/drizzle-orm/issues/6176
	// View1 can be recreated and other view2 was newly created. view2 depends on view1, need to sort them -> https://github.com/drizzle-team/drizzle-orm/issues/6176
	// Dependent views must be created after their dependencies, otherwise the migration breaks
	//
	// `view2` depends on `view1` when `view1`'s (schema-qualified) name appears in `view2`'s definition
	// Other dialects do this in drizzle.ts files
	// TODO we have some tests on it in pg-views.test.ts
	// but probably we should move this to function and test the function
	const sortedCreateViews: typeof createViews[number][] = [];
	const visited = new Set<typeof createViews[number]>();
	const onStack = new Set<typeof createViews[number]>();
	const visit = (node: typeof createViews[number]) => {
		if (visited.has(node) || onStack.has(node)) return; // onStack guards against dependency cycles
		onStack.add(node);
		for (const other of createViews) {
			// `node` depends on `other` when `other`'s name appears in `node`'s definition
			if (other !== node && existsInViewDef(other.view, node.view)) visit(other);
		}
		onStack.delete(node);
		visited.add(node);
		sortedCreateViews.push(node);
	};
	for (const node of createViews) visit(node);

	jsonStatements.push(...sortedCreateViews);

	jsonStatements.push(...jsonRenamePoliciesStatements);
	jsonStatements.push(...jsonCreatePoliciesStatements);
	jsonStatements.push(...jsonAlterOrRecreatePoliciesStatements);

	// postgres refuses to drop a role that a policy or a privilege still names
	jsonStatements.push(...jsonDropRoles);

	jsonStatements.push(...jsonDropEnums);
	jsonStatements.push(...dropSequences);
	jsonStatements.push(...dropSchemas);

	const { groupedStatements, sqlStatements, snapshotStatements } = fromJson(jsonStatements);

	const renames = prepareMigrationRenames([
		...renameSchemas,
		...renamedEnums,
		...orMovedTables,
		...columnRenames,
		...uniqueRenames,
		...checkRenames,
		...indexesRenames,
		...pksRenames,
		...fksRenames,
		...policyRenames,
		...renamedOrMovedViews,
		...renamedRoles,
		...renamedOrMovedSeqs,
	]);

	return {
		statements: jsonStatements,
		snapshotStatements,
		sqlStatements,
		groupedStatements: groupedStatements,
		renames: renames,
		deltas,
	};
};
