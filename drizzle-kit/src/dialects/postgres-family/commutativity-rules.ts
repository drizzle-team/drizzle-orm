import { createHash } from 'crypto';
import type { Footprint } from '../../commutativity/engine';
import type { ConflictTarget } from '../../commutativity/types';
import type { JsonStatement as CockroachStatement } from '../cockroach/statements';
import { privilegeTypes } from '../postgres/ddl';
import type { JsonStatement as PostgresStatement } from '../postgres/statements';

// Footprint rules for the postgres family: postgres itself and cockroach, which share almost every statement
// kind and differ in a handful of well-identified places. `FamilyStatement` is the plain union of the two
// dialects' `JsonStatement` types, not a generic parameter: most cases share one field shape across the two
// dialects, so the switch below narrows `s` to the matching member(s) of the union and reads common fields
// directly. Where a dialect's variant of a shared case is missing a field that the other has (for example
// cockroach's `move_table` has no `indexNames`), the code reads it through an `in` check rather than a cast,
// so a missing field narrows to `undefined` instead of lying to the type checker.
export type FamilyStatement = PostgresStatement | CockroachStatement;

export type FamilyProfile = {
	// Whether CREATE/DROP/RENAME INDEX name only the index, or the index and its table. Cockroach always names
	// the table, because its index identity is `[schema, table, name]` and two tables of a schema can share an
	// index name.
	readonly indexScope: 'schema' | 'table';
	// The schema that holds the dialect's built-in types, excluded from the enum name reference of a column.
	readonly builtinTypeSchema: string;
	// Keywords that a policy can list in place of a role. No schema can rename or drop them.
	readonly builtinPolicyRoles: readonly string[];
	// Null for a dialect with no serial/identity-sequence column type.
	readonly serial: { isSerialType(type: string): boolean } | null;
};

type ColumnLike = { schema: string; table: string; name: string; typeSchema: string | null; type: string };
type IndexColumnLike = { value: string; isExpression: boolean };
type IndexLike = {
	schema: string;
	table: string;
	isUnique: boolean;
	where: string | null;
	columns: IndexColumnLike[];
};
type PolicyLike = { roles: string[] };

const schemaLevelActions = new Set([
	'create_table',
	'drop_table',
	'rename_table',
	'move_table',
	'remove_from_schema',
	'set_new_schema',
	'create_view',
	'drop_view',
	'alter_view',
	'rename_view',
	'move_view',
	'create_enum',
	'drop_enum',
	'alter_enum',
	'recreate_enum',
	'rename_enum',
	'move_enum',
	'create_sequence',
	'drop_sequence',
	'alter_sequence',
	'rename_sequence',
	'move_sequence',
	'create_schema',
	'drop_schema',
	'rename_schema',
	'create_role',
	'drop_role',
	'alter_role',
	'rename_role',
]);

// Gives the description of a footprint for the report of `check`.
export const describeFootprint = (footprint: Footprint) => {
	const action = footprint.statementType;
	const target = conflictTargetOf(footprint.statementTarget);

	let description = `${action} on ${target.name} table`;
	if (target.kind === 'role') {
		description = `${action}: ${target.name} role`;
	} else if (target.kind === 'index' || target.kind === 'column') {
		description = `${action}: ${target.name} on ${target.table} table`;
	} else if (target.kind === 'schema') {
		description = `${action}: ${target.name} schema`;
	} else if (schemaLevelActions.has(action)) {
		description = `${action}: ${target.name} in ${target.schema || 'schema'} schema`;
	}
	return { description, target, action };
};

// Builds the footprint that a snapshot stores for one statement of its migration.
export const footprintOf = (statement: FamilyStatement, sql: string[], profile: FamilyProfile): Footprint => {
	return {
		statementType: statement.type,
		statementTarget: targetOf(statement),
		...nodesOf(statement, profile),
		// 16 hex characters keep a snapshot short. Two different changes with one hash would pass `check` only
		// when both are idempotent statements of one kind on the same nodes.
		...(isIdempotent(statement, profile) && {
			sqlHash: createHash('sha256').update(sql.join('\n')).digest('hex').slice(0, 16),
		}),
	};
};

// Turns a stored target into the target of the report. The last name is the name of the target, and the names
// before it are its schema and its table.
export const conflictTargetOf = ([kind, ...names]: Footprint['statementTarget']): ConflictTarget => {
	const name = names[names.length - 1];
	if (names.length === 3) return { kind, schema: names[0], table: names[1], name };
	if (names.length === 2) return { kind, schema: names[0], name };
	return { kind, name };
};

// Returns the target that the report and the JSON output of `check` show for a statement, from the outer name to
// the inner name. A constraint, a policy and a privilege show their table.
export function targetOf(statement: FamilyStatement): Footprint['statementTarget'] {
	type Target = Footprint['statementTarget'];
	const tableOf = (child: { schema: string; table: string }): Target => ['table', child.schema, child.table];
	const columnOf = (column: Pick<ColumnLike, 'schema' | 'table' | 'name'>): Target => [
		'column',
		column.schema,
		column.table,
		column.name,
	];

	const s = statement;
	switch (s.type) {
		case 'create_table':
		case 'drop_table':
			return ['table', s.table.schema, s.table.name];
		case 'rename_table':
			return ['table', s.schema, s.from];
		case 'move_table':
			return ['table', s.from, s.name];
		case 'remove_from_schema':
			return ['table', s.schema, s.table];
		case 'set_new_schema':
			return ['table', s.from, s.table];
		case 'alter_rls':
			return ['table', s.schema, s.name];

		case 'add_column':
		case 'drop_column':
			return columnOf(s.column);
		case 'recreate_column':
			return columnOf(s.diff.$right);
		case 'alter_column':
			return columnOf(s.to);
		case 'rename_column':
			return columnOf(s.from);
		case 'alter_add_column_not_null':
		case 'alter_drop_column_not_null':
			return ['column', s.schema, s.table, s.column];

		case 'create_index':
		case 'drop_index':
			return ['index', s.index.schema, s.index.table, s.index.name];
		case 'recreate_index': {
			const index = 'index' in s ? s.index : s.diff.$right;
			return ['index', index.schema, index.table, index.name];
		}
		case 'rename_index':
			return ['index', s.schema, s.table, s.from];

		case 'add_pk':
		case 'drop_pk':
		case 'alter_pk':
			return tableOf(s.pk);
		case 'recreate_pk':
			return tableOf(s.right);
		case 'create_fk':
		case 'drop_fk':
		case 'recreate_fk':
			return tableOf(s.fk);
		case 'add_unique':
		case 'drop_unique':
			return tableOf(s.unique);
		case 'alter_unique':
			return tableOf(s.diff.$right);
		case 'add_check':
		case 'drop_check':
			return tableOf(s.check);
		case 'alter_check':
			return tableOf(s.diff.$right);
		case 'rename_constraint':
			return tableOf(s);
		case 'create_policy':
		case 'drop_policy':
		case 'alter_policy':
		case 'recreate_policy':
			return tableOf(s.policy);
		case 'rename_policy':
			return tableOf(s.from);

		case 'create_enum':
		case 'drop_enum':
			return ['enum', s.enum.schema, s.enum.name];
		case 'rename_enum':
			return ['enum', s.schema, s.from];
		case 'alter_enum':
		case 'recreate_enum':
			return ['enum', s.to.schema, s.to.name];
		case 'alter_type_drop_value':
			return ['enum', s.enum.schema, s.enum.name];
		case 'move_enum':
			return ['enum', s.from.schema ?? '', s.from.name];

		case 'create_sequence':
		case 'drop_sequence':
		case 'alter_sequence':
			return ['sequence', s.sequence.schema, s.sequence.name];
		case 'rename_sequence':
			return ['sequence', s.from.schema, s.from.name];
		case 'move_sequence':
			return ['sequence', s.from.schema ?? '', s.from.name];

		case 'create_view':
		case 'drop_view':
		case 'alter_view':
			return ['view', s.view.schema, s.view.name];
		case 'rename_view':
			return ['view', s.from.schema, s.from.name];
		case 'move_view':
			return ['view', s.fromSchema, s.view.name];

		case 'create_schema':
		case 'drop_schema':
			return ['schema', s.name];
		case 'rename_schema':
			return ['schema', s.from.name];

		case 'create_role':
		case 'drop_role':
		case 'alter_role':
			return ['role', s.role.name];
		case 'rename_role':
			return ['role', s.from.name];

		case 'grant_privilege':
		case 'revoke_privilege':
		case 'regrant_privilege':
			return ['table', s.privilege.schema || '', s.privilege.table || ''];

		default: {
			const unhandled: never = s;
			throw new Error(`targetOf: unhandled statement type '${(unhandled as { type: string }).type}'`);
		}
	}
}

// Tells whether the SQL of a statement is idempotent.
export function isIdempotent(statement: FamilyStatement, profile: FamilyProfile): boolean {
	switch (statement.type) {
		// The SQL fails on the second run for a change of `identity`, for DROP EXPRESSION (`generated`), and, in a
		// dialect with a serial type, when the column gets or loses its serial sequence. A change between two
		// serial types keeps the sequence. For a change between a scalar type and an array type, the user writes
		// the conversion in the USING clause, so the second run might fail.
		case 'alter_column': {
			const { dimensions, generated, identity } = statement.diff;
			const dropsSequence = profile.serial !== null && 'wasSerial' in statement && statement.wasSerial
				&& !profile.serial.isSerialType(statement.to.type);
			const becomesSerial = profile.serial !== null && 'toSerial' in statement && statement.toSerial;
			const isArrayConversion = !!dimensions && (dimensions.from === 0 || dimensions.to === 0);
			return !dropsSequence && !becomesSerial && !generated && !identity && !isArrayConversion;
		}
		// When the old primary key is already deleted, the SQL has no DROP CONSTRAINT, and the second ADD PRIMARY KEY
		// fails. Cockroach's `alter_pk` carries no `deleted` flag, so it is never dropped first and stays idempotent.
		case 'alter_pk':
			return !('deleted' in statement && statement.deleted);
		case 'recreate_column':
		case 'recreate_index':
		case 'recreate_fk':
		case 'recreate_pk':
		case 'alter_unique':
		case 'alter_check':
		case 'recreate_enum':
		case 'alter_sequence':
		case 'alter_view':
		case 'alter_policy':
		case 'recreate_policy':
		case 'alter_rls':
		case 'alter_role':
		case 'alter_add_column_not_null':
		case 'alter_drop_column_not_null':
		case 'grant_privilege':
		case 'revoke_privilege':
		case 'regrant_privilege':
			return true;
		default:
			return false;
	}
}

function buildHelpers(profile: FamilyProfile) {
	// EXACT (strict) COMMUTATIVITY via three nodes per object:
	//   s|N  self       — written by EVERY structural op on N. Two ops on the same
	//                     node collide here (add+drop, two alters, …).
	//   n|N  name       — written by create/drop/rename/move (anything that changes
	//                     N's NAME). Read by statements whose SQL hardcodes N's name,
	//                     so a rename of N breaks them (e.g. `CREATE INDEX … ON (c)`).
	//   e|N  existence  — written by create/drop (a rename preserves existence). Two more
	//                     statements write it: a move of a table to another schema, and
	//                     a DISABLE of row level security (see `move_table`, `alter_rls`).
	//                     Read by cascade dependents that FOLLOW a rename but are
	//                     destroyed by a drop (e.g. an existing index/pk on a column:
	//                     `DROP INDEX ix` breaks if the column is dropped, not renamed).
	// A write meeting a read-or-write of the same key is a conflict. Because alter
	// writes only `s|`, a name reference (`n|`) does NOT collide with an alter — the
	// two genuinely commute. Because rename writes `n|` but not `e|`, a cascade
	// reference (`e|`) does NOT collide with a rename. Both are exact, not conservative.
	const self = (k: string, ...p: string[]) => `s|${k}|${p.join('.')}`;
	const name = (k: string, ...p: string[]) => `n|${k}|${p.join('.')}`;
	const exist = (k: string, ...p: string[]) => `e|${k}|${p.join('.')}`;
	// Returns the names that an object also writes in a shared namespace, so that two objects of different
	// kinds with one name conflict. In a schema, `rel` holds tables, views and sequences (and, when the dialect
	// scopes index names to the schema, indexes too), and `type` holds tables, views and enums. In a table, `con`
	// holds constraints. A primary key or a unique constraint also has an index with its name.
	const sharedNames = (k: string, p: string[]): string[] => {
		switch (k) {
			case 'tbl':
			case 'view':
				return [name('rel', ...p), name('type', ...p)];
			case 'seq':
				return [name('rel', ...p)];
			case 'idx':
				// When the dialect scopes an index name to its table, two tables of a schema can share an index
				// name, so the index does not join the schema's `rel` namespace at all.
				return profile.indexScope === 'schema' ? [name('rel', p[0], p[p.length - 1])] : [];
			case 'enum':
				return [name('type', ...p)];
			case 'uq':
				return [name('con', ...p), name('rel', p[0], p[2])];
			case 'ck':
			case 'fk':
				return [name('con', ...p)];
			default:
				return [];
		}
	};
	// Returns the shared names of a primary key. A table has one primary key, so the `pk` node holds no name.
	// The names come from `uq`, which has the same namespaces.
	const pkNames = (schema: string, table: string, pk: string) => sharedNames('uq', [schema, table, pk]);
	const created = (k: string, ...p: string[]) => [
		self(k, ...p),
		name(k, ...p),
		exist(k, ...p),
		...sharedNames(k, p),
	]; // create/drop
	const endpoint = (k: string, ...p: string[]) => [self(k, ...p), name(k, ...p), ...sharedNames(k, p)]; // one endpoint of a rename/move
	const altered = (k: string, ...p: string[]) => [self(k, ...p)];
	const nref = (k: string, ...p: string[]) => name(k, ...p); // name reference (broken by rename OR drop)
	const eref = (k: string, ...p: string[]) => exist(k, ...p); // cascade reference (broken only by drop)
	const underTable = (schema: string, table: string) => [nref('tbl', schema, table), nref('sch', schema)];
	// Returns what DROP INDEX and ALTER INDEX read of the table of the index. When the dialect names only the
	// index in that SQL, a rename of the table does not break them, so the read is cascade-only (`eref`). When
	// the dialect always names the table too (cockroach: `"s"."t"@"i"`), a rename of the table breaks the SQL
	// exactly like a drop, so the read is name-sensitive (`nref`) as well.
	const indexHome = (schema: string, table: string) =>
		profile.indexScope === 'table'
			? [nref('tbl', schema, table), nref('sch', schema)]
			: [eref('tbl', schema, table), nref('sch', schema)];
	// Returns the path that identifies an index: with the table when the dialect scopes index names to the
	// table, without it when the dialect scopes them to the schema.
	const indexPath = (schema: string, table: string, indexName: string) =>
		profile.indexScope === 'table' ? [schema, table, indexName] : [schema, indexName];
	const colEnum = (column: Pick<ColumnLike, 'typeSchema' | 'type'>): string[] =>
		column.typeSchema && column.typeSchema !== profile.builtinTypeSchema && column.type
			? [nref('enum', column.typeSchema, column.type)]
			: [];
	const idxCols = (cols: IndexColumnLike[], ref: (c: string) => string) =>
		cols.filter((c) => !c.isExpression).map((c) => ref(c.value));
	// Returns the node for the uniqueness of a set of columns, with the columns in any order. A foreign key reads
	// it on the columns that it references, because the dialect requires a primary key, a unique constraint or a
	// unique index there. Only a drop of such a guarantee writes the node, because an add cannot break a foreign
	// key. Two drops share the write, because each one alone leaves the uniqueness to the other guarantees.
	// The rules cannot count the guarantees, so a drop conflicts with a new foreign key on another branch even
	// when another guarantee of the same columns remains.
	const uniqueness = (schema: string, table: string, columns: string[]) =>
		exist('uniqueness', schema, table, ...[...columns].sort());
	const indexUniqueness = (index: Pick<IndexLike, 'schema' | 'table' | 'isUnique' | 'where' | 'columns'>) =>
		index.isUnique && !index.where && index.columns.every((c) => !c.isExpression)
			? [uniqueness(index.schema, index.table, index.columns.map((c) => c.value))]
			: [];
	const policyRoles = (policy: Pick<PolicyLike, 'roles'>) =>
		policy.roles.filter((role) => !profile.builtinPolicyRoles.includes(role)).map((role) => nref('role', role));

	return {
		self,
		name,
		exist,
		pkNames,
		created,
		endpoint,
		altered,
		nref,
		eref,
		underTable,
		indexHome,
		indexPath,
		colEnum,
		idxCols,
		uniqueness,
		indexUniqueness,
		policyRoles,
	};
}

// Builds the nodes that a statement writes, reads and shares. Node identity mirrors the DDL's own
// `schema:table:name:entityType` key, so children and cross-references line up with the nodes that a drop removes.
export function nodesOf(
	statement: FamilyStatement,
	profile: FamilyProfile,
): Pick<Footprint, 'writes' | 'reads' | 'sharedWrites'> {
	const {
		name,
		exist,
		pkNames,
		created,
		endpoint,
		altered,
		nref,
		eref,
		underTable,
		indexHome,
		indexPath,
		colEnum,
		idxCols,
		uniqueness,
		indexUniqueness,
		policyRoles,
	} = buildHelpers(profile);

	const s = statement;
	switch (s.type) {
		// ---- tables ----
		case 'create_table':
			return {
				writes: [
					...created('tbl', s.table.schema, s.table.name),
					...(s.table.pk ? [name('rel', s.table.schema, s.table.pk.name)] : []),
					// A dialect without a `uniques` entity turns a unique column into a unique index instead, so
					// its table carries no `uniques` list at all.
					...('uniques' in s.table ? s.table.uniques.map((unique) => name('rel', s.table.schema, unique.name)) : []),
				],
				reads: [nref('sch', s.table.schema), ...s.table.columns.flatMap(colEnum)],
			};
		case 'drop_table':
			return { writes: created('tbl', s.table.schema, s.table.name), reads: [nref('sch', s.table.schema)] };
		case 'rename_table':
			return {
				writes: [...endpoint('tbl', s.schema, s.from), ...endpoint('tbl', s.schema, s.to)],
				reads: [nref('sch', s.schema)],
			};
		case 'move_table': { // the indexes move too, so it writes `exist` and, in a schema-scoped dialect, the
			// index names in both schemas; a table-scoped dialect needs neither, because its index identity
			// already includes the table and does not depend on the schema at all
			const indexNames = 'indexNames' in s ? s.indexNames : [];
			return {
				writes: [
					...endpoint('tbl', s.from, s.name),
					...endpoint('tbl', s.to, s.name),
					exist('tbl', s.from, s.name),
					exist('tbl', s.to, s.name),
					...indexNames.flatMap((index) => [name('rel', s.from, index), name('rel', s.to, index)]),
				],
				reads: [nref('sch', s.from), nref('sch', s.to)],
			};
		}
		// `remove_from_schema` and `set_new_schema` are part of cockroach's `JsonStatement` union, but the diff
		// never builds one: a table move is always a `move_table`. Handled here only so the switch stays
		// exhaustive.
		case 'remove_from_schema':
			return {
				writes: [...endpoint('tbl', s.schema, s.table), exist('tbl', s.schema, s.table)],
				reads: [nref('sch', s.schema)],
			};
		case 'set_new_schema':
			return {
				writes: [
					...endpoint('tbl', s.from, s.table),
					...endpoint('tbl', s.to, s.table),
					exist('tbl', s.from, s.table),
					exist('tbl', s.to, s.table),
				],
				reads: [nref('sch', s.from), nref('sch', s.to)],
			};
		case 'alter_rls':
			// In either order, a DISABLE and a new policy of another branch leave the policy without effect. So
			// when `isRlsEnabled` is false, the statement writes the `rls` node that `create_policy` reads.
			return {
				writes: [...altered('rls', s.schema, s.name), ...(s.isRlsEnabled ? [] : [exist('rls', s.schema, s.name)])],
				reads: underTable(s.schema, s.name),
			};

		// ---- columns ----
		case 'add_column':
			return {
				writes: created('col', s.column.schema, s.column.table, s.column.name),
				reads: [...underTable(s.column.schema, s.column.table), ...colEnum(s.column)],
			};
		case 'drop_column':
			return {
				writes: created('col', s.column.schema, s.column.table, s.column.name),
				reads: underTable(s.column.schema, s.column.table),
			};
		case 'alter_column': {
			// `properties` lists each property that the SQL changes or needs. Each property is a node of its
			// own, so changes of different properties do not conflict. A change of the type rewrites the
			// default. An identity needs NOT NULL and no default, and a generated column takes no default.
			// The column keeps its name and its existence, so the statement reads only the name with `nref`.
			const d = s.diff;
			const properties = new Set<string>();
			if (d.notNull) properties.add('notNull');
			if (d.default) properties.add('default');
			if (d.type || d.typeSchema || d.dimensions) properties.add('type').add('default');
			if (d.generated) properties.add('generated').add('default');
			if (d.identity) properties.add('identity').add('default').add('notNull');
			const column = [s.to.schema, s.to.table, s.to.name] as const;
			return {
				writes: [...properties].flatMap((property) => altered('colprop', ...column, property)),
				reads: [
					...underTable(s.to.schema, s.to.table),
					nref('col', ...column),
					// Only SET DATA TYPE and SET DEFAULT name the enum in SQL, so only they need `colEnum`.
					...(d.default || properties.has('type') ? colEnum(s.to) : []),
				],
			};
		}
		// Cockroach issues SET/DROP NOT NULL as its own statement next to `alter_column`, instead of folding it
		// into one ALTER COLUMN. It touches the same `notNull` property node, so a NOT NULL change still
		// conflicts with another branch's change of the same column the same way an `alter_column` would.
		case 'alter_add_column_not_null':
		case 'alter_drop_column_not_null':
			return {
				writes: altered('colprop', s.schema, s.table, s.column, 'notNull'),
				reads: [...underTable(s.schema, s.table), nref('col', s.schema, s.table, s.column)],
			};
		case 'recreate_column': // DROP + re-ADD the column: destroys & re-establishes it (cascading its
		// indexes/constraints), so it writes existence like a create/drop, not just `self` like an alter
		{
			const column = s.diff.$right;
			return {
				writes: created('col', column.schema, column.table, column.name),
				reads: [...underTable(column.schema, column.table), ...colEnum(column)],
			};
		}
		case 'rename_column':
			return {
				writes: [
					...endpoint('col', s.from.schema, s.from.table, s.from.name),
					...endpoint('col', s.to.schema, s.to.table, s.to.name),
				],
				reads: underTable(s.from.schema, s.from.table),
			};

		// ---- indexes ----
		case 'create_index': // DDL hardcodes the columns -> NAME refs (break on rename)
			return {
				writes: created('idx', ...indexPath(s.index.schema, s.index.table, s.index.name)),
				reads: [
					...underTable(s.index.schema, s.index.table),
					...idxCols(s.index.columns, (c) => nref('col', s.index.schema, s.index.table, c)),
				],
			};
		// A dialect that names only the index in DROP INDEX reads the existence of the table and of the columns
		// with `indexHome` and `eref`. A dialect that always names the table too reads its name instead, through
		// the same `indexHome`.
		case 'drop_index': {
			const key = indexUniqueness(s.index);
			return {
				writes: created('idx', ...indexPath(s.index.schema, s.index.table, s.index.name)),
				reads: [
					// `key` holds the name of the table. If another branch renames the table and adds a
					// foreign key to it, the key of that foreign key has the new name and does not match.
					// So a drop of a unique index reads the table name with `underTable`.
					...(key.length > 0 ? underTable : indexHome)(s.index.schema, s.index.table),
					...idxCols(s.index.columns, (c) => eref('col', s.index.schema, s.index.table, c)),
				],
				sharedWrites: key,
			};
		}
		case 'recreate_index': {
			const index = 'index' in s ? s.index : s.diff.$right;
			return {
				writes: created('idx', ...indexPath(index.schema, index.table, index.name)),
				reads: [
					...underTable(index.schema, index.table),
					...idxCols(index.columns, (c) => nref('col', index.schema, index.table, c)),
				],
				sharedWrites: indexUniqueness(s.diff.$left),
			};
		}
		// A rename of the index works after a rename of its table or columns and fails after a drop of them.
		// So the statement reads their existence with `indexHome` and `eref`.
		case 'rename_index':
			return {
				writes: [
					...endpoint('idx', ...indexPath(s.schema, s.table, s.from)),
					...endpoint('idx', ...indexPath(s.schema, s.table, s.to)),
				],
				reads: [...indexHome(s.schema, s.table), ...s.columns.map((c) => eref('col', s.schema, s.table, c))],
			};

		// ---- primary keys ----
		case 'add_pk': // `ADD PRIMARY KEY (c)` hardcodes columns -> NAME refs
			return {
				writes: [...created('pk', s.pk.schema, s.pk.table), ...pkNames(s.pk.schema, s.pk.table, s.pk.name)],
				reads: [
					...underTable(s.pk.schema, s.pk.table),
					...s.pk.columns.map((c) => nref('col', s.pk.schema, s.pk.table, c)),
				],
			};
		case 'drop_pk': // cascaded by column drop -> EXISTENCE refs
			return {
				writes: [...created('pk', s.pk.schema, s.pk.table), ...pkNames(s.pk.schema, s.pk.table, s.pk.name)],
				reads: [
					...underTable(s.pk.schema, s.pk.table),
					...s.pk.columns.map((c) => eref('col', s.pk.schema, s.pk.table, c)),
				],
				sharedWrites: [uniqueness(s.pk.schema, s.pk.table, s.pk.columns)],
			};
		case 'alter_pk':
			return {
				writes: altered('pk', s.pk.schema, s.pk.table),
				reads: [
					...underTable(s.pk.schema, s.pk.table),
					...s.pk.columns.map((c) => nref('col', s.pk.schema, s.pk.table, c)),
				],
				sharedWrites: [uniqueness(s.pk.schema, s.pk.table, s.diff.columns?.from ?? s.pk.columns)],
			};
		// Cockroach represents a primary key change too large for ALTER as a drop of the old key plus an add of
		// the new one, in `recreate_pk`, instead of postgres's `alter_pk`.
		case 'recreate_pk': {
			const { left, right } = s;
			return {
				writes: [
					...altered('pk', right.schema, right.table),
					...pkNames(right.schema, right.table, left.name),
					...pkNames(right.schema, right.table, right.name),
				],
				reads: [
					...underTable(right.schema, right.table),
					...right.columns.map((c) => nref('col', right.schema, right.table, c)),
				],
				sharedWrites: [uniqueness(right.schema, right.table, left.columns)],
			};
		}

		// ---- foreign keys ----
		case 'create_fk':
		case 'recreate_fk':
			return {
				writes: created('fk', s.fk.schema, s.fk.table, s.fk.name),
				reads: [
					...underTable(s.fk.schema, s.fk.table),
					nref('tbl', s.fk.schemaTo, s.fk.tableTo),
					nref('sch', s.fk.schemaTo),
					...s.fk.columns.map((c) => nref('col', s.fk.schema, s.fk.table, c)),
					...s.fk.columnsTo.map((c) => nref('col', s.fk.schemaTo, s.fk.tableTo, c)),
					uniqueness(s.fk.schemaTo, s.fk.tableTo, s.fk.columnsTo),
				],
			};
		case 'drop_fk':
			return {
				writes: created('fk', s.fk.schema, s.fk.table, s.fk.name),
				reads: [
					...underTable(s.fk.schema, s.fk.table),
					...s.fk.columns.map((c) => eref('col', s.fk.schema, s.fk.table, c)),
				],
			};

		// ---- unique constraints (postgres only: a dialect without a `uniques` entity turns these into a
		// unique index, handled by the index cases above) ----
		case 'add_unique':
			return {
				writes: created('uq', s.unique.schema, s.unique.table, s.unique.name),
				reads: [
					...underTable(s.unique.schema, s.unique.table),
					...s.unique.columns.map((c) => nref('col', s.unique.schema, s.unique.table, c)),
				],
			};
		case 'drop_unique':
			return {
				writes: created('uq', s.unique.schema, s.unique.table, s.unique.name),
				reads: [
					...underTable(s.unique.schema, s.unique.table),
					...s.unique.columns.map((c) => eref('col', s.unique.schema, s.unique.table, c)),
				],
				sharedWrites: [uniqueness(s.unique.schema, s.unique.table, s.unique.columns)],
			};
		case 'alter_unique': { // recreated as DROP $left + ADD $right: name-ref the new cols, existence-ref the old
			const { $left: from, $right: to } = s.diff;
			return {
				writes: altered('uq', to.schema, to.table, to.name),
				reads: [
					...underTable(to.schema, to.table),
					...to.columns.map((c) => nref('col', to.schema, to.table, c)),
					...from.columns.map((c) => eref('col', to.schema, to.table, c)),
				],
				sharedWrites: [uniqueness(to.schema, to.table, from.columns)],
			};
		}

		// ---- check constraints (columns come from parsing the CHECK expression; a dialect that does not parse
		// it, such as cockroach today, falls back to reading the table only, so a column rename or drop under
		// the check is not caught here) ----
		case 'add_check': { // `ADD CHECK (c > 0)` hardcodes the columns -> NAME refs
			const columns = 'columns' in s ? s.columns : [];
			return {
				writes: created('ck', s.check.schema, s.check.table, s.check.name),
				reads: [
					...underTable(s.check.schema, s.check.table),
					...columns.map((c) => nref('col', s.check.schema, s.check.table, c)),
				],
			};
		}
		case 'drop_check': { // cascaded by a column drop -> EXISTENCE refs
			const columns = 'columns' in s ? s.columns : [];
			return {
				writes: created('ck', s.check.schema, s.check.table, s.check.name),
				reads: [
					...underTable(s.check.schema, s.check.table),
					...columns.map((c) => eref('col', s.check.schema, s.check.table, c)),
				],
			};
		}
		case 'alter_check': { // recreated as DROP old + ADD new: name-ref new expr cols, existence-ref old
			const check = s.diff.$right;
			const newColumns = 'newColumns' in s ? s.newColumns : [];
			const oldColumns = 'oldColumns' in s ? s.oldColumns : [];
			return {
				writes: altered('ck', check.schema, check.table, check.name),
				reads: [
					...underTable(check.schema, check.table),
					...newColumns.map((c) => nref('col', check.schema, check.table, c)),
					...oldColumns.map((c) => eref('col', check.schema, check.table, c)),
				],
			};
		}

		case 'rename_constraint': { // RENAME CONSTRAINT follows a column rename but is cascaded by a column drop -> EXISTENCE refs
			const columns = 'columns' in s ? s.columns ?? [] : [];
			const reads = [...underTable(s.schema, s.table), ...columns.map((c) => eref('col', s.schema, s.table, c))];
			const named = (k: string) => ({
				writes: [...endpoint(k, s.schema, s.table, s.from), ...endpoint(k, s.schema, s.table, s.to)],
				reads,
			});
			switch (s.entityType) {
				case 'pks': // `pkNames` writes the old and the new name, because the `pk` node holds no name
					return {
						writes: [
							...endpoint('pk', s.schema, s.table),
							...pkNames(s.schema, s.table, s.from),
							...pkNames(s.schema, s.table, s.to),
						],
						reads,
					};
				case 'uniques':
					return named('uq');
				case 'checks':
					return named('ck');
				case 'fks':
					return named('fk');
				default: {
					const unhandled: never = s;
					throw new Error(
						`rename_constraint has the unknown constraint kind '${(unhandled as { entityType: string }).entityType}'`,
					);
				}
			}
		}

		// ---- enums (schema-scoped) ----
		case 'create_enum':
			return { writes: created('enum', s.enum.schema, s.enum.name), reads: [nref('sch', s.enum.schema)] };
		case 'drop_enum':
			return { writes: created('enum', s.enum.schema, s.enum.name), reads: [nref('sch', s.enum.schema)] };
		case 'rename_enum':
			return {
				writes: [...endpoint('enum', s.schema, s.from), ...endpoint('enum', s.schema, s.to)],
				reads: [nref('sch', s.schema)],
			};
		case 'alter_enum':
			return { writes: altered('enum', s.to.schema, s.to.name), reads: [nref('sch', s.to.schema)] };
		case 'recreate_enum': // DROP TYPE + CREATE TYPE, and an ALTER TABLE for every column of the type
			return {
				writes: [
					...created('enum', s.to.schema, s.to.name),
					// The SQL ends with SET DATA TYPE for each column in `s.columns`, which would undo a
					// type change of another branch. A type change rewrites the default, so the statement
					// writes both `type` and `default`.
					...s.columns.flatMap((c) =>
						['type', 'default'].flatMap((property) => altered('colprop', c.schema, c.table, c.name, property))
					),
				],
				reads: [
					nref('sch', s.to.schema),
					...s.columns.flatMap((c) => [...underTable(c.schema, c.table), nref('col', c.schema, c.table, c.name)]),
				],
			};
		// `alter_type_drop_value` is part of cockroach's `JsonStatement` union, but the diff always recreates the
		// enum when a value is removed instead. Handled here only so the switch stays exhaustive.
		case 'alter_type_drop_value':
			return { writes: altered('enum', s.enum.schema, s.enum.name), reads: [nref('sch', s.enum.schema)] };
		case 'move_enum': {
			const from = { schema: s.from.schema ?? '', name: s.from.name };
			const to = { schema: s.to.schema ?? '', name: s.to.name };
			return {
				writes: [...endpoint('enum', from.schema, from.name), ...endpoint('enum', to.schema, to.name)],
				reads: [nref('sch', from.schema), nref('sch', to.schema)],
			};
		}

		// ---- sequences (schema-scoped) ----
		case 'create_sequence':
			return { writes: created('seq', s.sequence.schema, s.sequence.name), reads: [nref('sch', s.sequence.schema)] };
		case 'drop_sequence':
			return { writes: created('seq', s.sequence.schema, s.sequence.name), reads: [nref('sch', s.sequence.schema)] };
		case 'rename_sequence':
			return {
				writes: [...endpoint('seq', s.from.schema, s.from.name), ...endpoint('seq', s.to.schema, s.to.name)],
				reads: [nref('sch', s.from.schema)],
			};
		case 'alter_sequence':
			return { writes: altered('seq', s.sequence.schema, s.sequence.name), reads: [nref('sch', s.sequence.schema)] };
		case 'move_sequence': {
			const from = { schema: s.from.schema ?? '', name: s.from.name };
			const to = { schema: s.to.schema ?? '', name: s.to.name };
			return {
				writes: [...endpoint('seq', from.schema, from.name), ...endpoint('seq', to.schema, to.name)],
				reads: [nref('sch', from.schema), nref('sch', to.schema)],
			};
		}

		// ---- views (schema-scoped) ----
		case 'create_view':
			return { writes: created('view', s.view.schema, s.view.name), reads: [nref('sch', s.view.schema)] };
		case 'drop_view':
			return { writes: created('view', s.view.schema, s.view.name), reads: [nref('sch', s.view.schema)] };
		case 'rename_view':
			return {
				writes: [...endpoint('view', s.from.schema, s.from.name), ...endpoint('view', s.to.schema, s.to.name)],
				reads: [nref('sch', s.from.schema)],
			};
		case 'alter_view':
			return { writes: altered('view', s.view.schema, s.view.name), reads: [nref('sch', s.view.schema)] };
		case 'move_view':
			return {
				writes: [...endpoint('view', s.fromSchema, s.view.name), ...endpoint('view', s.toSchema, s.view.name)],
				reads: [nref('sch', s.fromSchema), nref('sch', s.toSchema)],
			};

		// ---- schemas (top level) ----
		case 'create_schema':
			return { writes: created('sch', s.name) };
		case 'drop_schema':
			return { writes: created('sch', s.name) };
		case 'rename_schema':
			return { writes: [...endpoint('sch', s.from.name), ...endpoint('sch', s.to.name)] };

		// ---- policies (children of the table) ----
		case 'create_policy': // the SQL names the roles of the policy, so `policyRoles` reads their names
			return {
				writes: created('pol', s.policy.schema, s.policy.table, s.policy.name),
				reads: [
					...underTable(s.policy.schema, s.policy.table),
					...policyRoles(s.policy),
					// A policy has no effect on a table without row level security, so it reads that `rls` exists.
					eref('rls', s.policy.schema, s.policy.table),
				],
			};
		case 'alter_policy':
		case 'recreate_policy':
			return {
				writes: altered('pol', s.policy.schema, s.policy.table, s.policy.name),
				reads: [...underTable(s.policy.schema, s.policy.table), ...policyRoles(s.policy)],
			};
		case 'drop_policy':
			return {
				writes: created('pol', s.policy.schema, s.policy.table, s.policy.name),
				reads: underTable(s.policy.schema, s.policy.table),
			};
		case 'rename_policy':
			return {
				writes: [
					...endpoint('pol', s.from.schema, s.from.table, s.from.name),
					...endpoint('pol', s.to.schema, s.to.table, s.to.name),
				],
				reads: underTable(s.from.schema, s.from.table),
			};

		// ---- roles (cluster level) ----
		case 'create_role':
			return { writes: created('role', s.role.name) };
		case 'alter_role':
			return { writes: altered('role', s.role.name) };
		case 'drop_role':
			return { writes: created('role', s.role.name) };
		case 'rename_role':
			return { writes: [...endpoint('role', s.from.name), ...endpoint('role', s.to.name)] };

		// ---- privileges (postgres only) ----
		case 'grant_privilege':
		case 'revoke_privilege':
		case 'regrant_privilege': {
			const { schema, table, grantee, grantor } = s.privilege;
			// ALL holds every other privilege type, so the statement writes the node of each type.
			const types = s.privilege.type === 'ALL' ? privilegeTypes : [s.privilege.type];
			return {
				writes: types.flatMap((type) => altered('priv', schema || '', table || '', grantee, type)),
				reads: [
					...(table ? underTable(schema || 'public', table) : []),
					nref('role', grantee),
					// The SQL does not name `grantor`: GRANT omits GRANTED BY, so the current user grants, and REVOKE
					// never names it. But the DDL key of a privilege holds `grantor`, and the `roles` edge renames it.
					// If another branch renames that role first, the create delta of GRANT keeps the old name, and
					// reconstruct finds no privilege under the key of the drop delta of REVOKE and skips the delta.
					nref('role', grantor),
				],
			};
		}

		default: {
			// Exhaustiveness guard: `statement` is `never` here only when every `JsonStatement` type of both
			// dialects has an explicit case above. Adding a new statement type to either dialect's union without
			// handling it here is therefore a compile error — forcing its footprint to be declared rather than
			// silently defaulted.
			const unhandled: never = s;
			throw new Error(`nodesOf: unhandled statement type '${(unhandled as { type: string }).type}'`);
		}
	}
}
