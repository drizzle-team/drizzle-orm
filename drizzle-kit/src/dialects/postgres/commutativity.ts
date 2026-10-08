import { FacetCommutativity, type FacetPaths, type ParsedSnapshotInput } from '../../commutativity/engine';
import type { ConflictTarget } from '../../commutativity/types';
import { type Column, type Index, type IndexColumn, privilegeTypes } from './ddl';
import { builtinPolicyRoles, isSerialType } from './grammar';
import type { PostgresSnapshot } from './snapshot';
import type { SnapshotStatement } from './snapshot-statements';

type NodeKind =
	| 'tbl'
	| 'view'
	| 'seq'
	| 'idx'
	| 'enum'
	| 'uq'
	| 'ck'
	| 'fk'
	| 'pk'
	| 'col'
	| 'colprop'
	| 'sch'
	| 'pol'
	| 'rls'
	| 'role'
	| 'priv'
	| 'ukey'
	| 'rel'
	| 'type'
	| 'con';

// The target that the report and the JSON output of `check` show for a statement. A constraint, a policy and
// a privilege show their table. A role and a renamed index also have the kind 'table', with their own name.
function targetOf(statement: SnapshotStatement): ConflictTarget {
	const tableOf = (child: { schema: string; table: string }): ConflictTarget => ({
		kind: 'table',
		name: child.table,
		schema: child.schema,
	});
	const columnOf = (column: Pick<Column, 'schema' | 'table' | 'name'>): ConflictTarget => ({
		kind: 'column',
		name: column.name,
		table: column.table,
		schema: column.schema,
	});

	switch (statement.type) {
		case 'create_table':
		case 'drop_table':
			return { kind: 'table', name: statement.table.name, schema: statement.table.schema };
		case 'rename_table':
			return { kind: 'table', name: statement.from, schema: statement.schema };
		case 'move_table':
			return { kind: 'table', name: statement.name, schema: statement.from };
		case 'alter_rls':
			return { kind: 'table', name: statement.name, schema: statement.schema };

		case 'add_column':
		case 'drop_column':
		case 'recreate_column':
			return columnOf(statement.column);
		case 'alter_column':
			return columnOf(statement.to);
		case 'rename_column':
			return columnOf(statement.from);

		case 'create_index':
		case 'drop_index':
		case 'recreate_index':
			return { kind: 'index', name: statement.index.name, table: statement.index.table };
		case 'rename_index':
			return { kind: 'table', name: statement.from, schema: statement.schema };

		case 'add_pk':
		case 'drop_pk':
		case 'alter_pk':
			return tableOf(statement.pk);
		case 'create_fk':
		case 'drop_fk':
		case 'recreate_fk':
			return tableOf(statement.fk);
		case 'add_unique':
		case 'drop_unique':
			return tableOf(statement.unique);
		case 'alter_unique':
			return tableOf(statement.to);
		case 'add_check':
		case 'drop_check':
		case 'alter_check':
			return tableOf(statement.check);
		case 'rename_constraint':
			return tableOf(statement);
		case 'create_policy':
		case 'drop_policy':
		case 'alter_policy':
		case 'recreate_policy':
			return tableOf(statement.policy);
		case 'rename_policy':
			return tableOf(statement.from);

		case 'create_enum':
		case 'drop_enum':
			return { kind: 'enum', name: statement.enum.name, schema: statement.enum.schema };
		case 'rename_enum':
			return { kind: 'enum', name: statement.from, schema: statement.schema };
		case 'alter_enum':
		case 'recreate_enum':
			return { kind: 'enum', name: statement.to.name, schema: statement.to.schema };
		case 'move_enum':
			return { kind: 'enum', name: statement.from.name, schema: statement.from.schema };

		case 'create_sequence':
		case 'drop_sequence':
		case 'alter_sequence':
			return { kind: 'sequence', name: statement.sequence.name, schema: statement.sequence.schema };
		case 'rename_sequence':
			return { kind: 'sequence', name: statement.from.name, schema: statement.from.schema };
		case 'move_sequence':
			return { kind: 'sequence', name: statement.from.name, schema: statement.from.schema };

		case 'create_view':
		case 'drop_view':
		case 'alter_view':
			return { kind: 'view', name: statement.view.name, schema: statement.view.schema };
		case 'rename_view':
			return { kind: 'view', name: statement.from.name, schema: statement.from.schema };
		case 'move_view':
			return { kind: 'view', name: statement.view.name, schema: statement.fromSchema };

		case 'create_schema':
		case 'drop_schema':
			return { kind: 'schema', name: statement.name };
		case 'rename_schema':
			return { kind: 'schema', name: statement.from.name };

		case 'create_role':
		case 'drop_role':
		case 'alter_role':
			return { kind: 'table', name: statement.role.name, schema: '' };
		case 'rename_role':
			return { kind: 'table', name: statement.from.name, schema: '' };

		case 'grant_privilege':
		case 'revoke_privilege':
		case 'regrant_privilege':
			return { kind: 'table', name: statement.privilege.table || '', schema: statement.privilege.schema || '' };
	}
}

/**
 * Postgres-specific commutativity rules.
 *
 * `buildFacetPaths` decides which statements conflict. `targetOf` and `describe` feed only the report.
 */
class PostgresCommutativity extends FacetCommutativity<
	SnapshotStatement,
	PostgresSnapshot
> {
	private schemaLevelActions = new Set([
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

	protected override describe(statement: SnapshotStatement) {
		const action = statement.type;
		const target = targetOf(statement);

		let description = `${action} on ${target.name} table`;
		if (target.kind === 'index' || target.kind === 'column') {
			description = `${action}: ${target.name} on ${target.table} table`;
		} else if (target.kind === 'schema') {
			description = `${action}: ${target.name} schema`;
		} else if (this.schemaLevelActions.has(action)) {
			description = `${action}: ${target.name} in ${target.schema || 'schema'} schema`;
		}
		return { description, target };
	}

	// ----------------------------------------------------------------------
	// Each statement declares the nodes it structurally owns, the existence it
	// destroys (drops), and the existence it needs (ancestors + cross-refs).
	// Node identity here mirrors the DDL's own `schema:table:name:entityType`
	// key, so children/cross-refs line up with the nodes drops remove.
	// ----------------------------------------------------------------------

	protected override isRepeatable(statement: SnapshotStatement): boolean {
		switch (statement.type) {
			// ADD and DROP of an identity, DROP EXPRESSION, and the CREATE and DROP of the sequence of a serial
			// column fail on the second run. A change between two serial types keeps the sequence. The user
			// writes the conversion between a scalar type and its array type, so nothing says that it runs a
			// second time.
			case 'alter_column': {
				const { dimensions, generated, identity } = statement.diff;
				const dropsSequence = statement.wasSerial && !isSerialType(statement.to.type);
				const isArrayConversion = !!dimensions && (dimensions.from === 0 || dimensions.to === 0);
				return !dropsSequence && !statement.becomesSerial && !generated && !identity && !isArrayConversion;
			}
			// Without the DROP, the second CREATE INDEX fails.
			case 'recreate_index':
				return statement.shouldDrop;
			// Without the DROP, the second ADD PRIMARY KEY fails.
			case 'alter_pk':
				return statement.shouldDrop;
			// For a column with a foreign key, an index or a unique constraint, the diff stores a drop_fk, a
			// create_fk, a create_index or an add_unique next to the recreate_column. Those run a second time only
			// in the migration that also recreates the column, and a statement here does not know its migration.
			// So the same recreate of such a column on two branches is reported.
			case 'recreate_column':
			case 'recreate_fk':
			case 'alter_unique':
			case 'alter_check':
			case 'recreate_enum':
			case 'alter_sequence':
			case 'alter_view':
			case 'alter_policy':
			case 'recreate_policy':
			case 'alter_rls':
			case 'alter_role':
			case 'grant_privilege':
			case 'revoke_privilege':
			case 'regrant_privilege':
				return true;
			default:
				return false;
		}
	}

	public override buildFacetPaths(statement: SnapshotStatement): FacetPaths {
		// EXACT (strict) COMMUTATIVITY via three facets per node:
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
		const self = (k: NodeKind, ...p: string[]) => `s|${k}|${p.join('.')}`;
		const name = (k: NodeKind, ...p: string[]) => `n|${k}|${p.join('.')}`;
		const exist = (k: NodeKind, ...p: string[]) => `e|${k}|${p.join('.')}`;
		// Postgres keeps the names of several kinds of objects in one namespace: relations (tables, views,
		// sequences and indexes) and types (tables, views and enums) in a schema, and constraints in a table.
		// Two objects of different kinds cannot take one name there, so each name is also written in its
		// namespaces. A primary key or a unique constraint is kept by an index with its name.
		const sharedNames = (k: NodeKind, p: string[]): string[] => {
			switch (k) {
				case 'tbl':
				case 'view':
					return [name('rel', ...p), name('type', ...p)];
				case 'seq':
				case 'idx':
					return [name('rel', ...p)];
				case 'enum':
					return [name('type', ...p)];
				case 'uq':
					return [name('con', ...p), name('rel', p[0], p[2])];
				case 'ck':
				case 'fk':
					return [name('con', ...p)];
				case 'pk':
				case 'col':
				case 'colprop':
				case 'sch':
				case 'pol':
				case 'rls':
				case 'role':
				case 'priv':
				case 'ukey':
				case 'rel':
				case 'type':
				case 'con':
					return [];
			}
		};
		// The node of a primary key holds no name, so its names are written with these.
		const pkNames = (schema: string, table: string, pk: string) => sharedNames('uq', [schema, table, pk]);
		const created = (k: NodeKind, ...p: string[]) => [
			self(k, ...p),
			name(k, ...p),
			exist(k, ...p),
			...sharedNames(k, p),
		]; // create/drop
		const endpoint = (k: NodeKind, ...p: string[]) => [self(k, ...p), name(k, ...p), ...sharedNames(k, p)]; // one endpoint of a rename/move
		const altered = (k: NodeKind, ...p: string[]) => [self(k, ...p)];
		const nref = (k: NodeKind, ...p: string[]) => name(k, ...p); // name reference (broken by rename OR drop)
		const eref = (k: NodeKind, ...p: string[]) => exist(k, ...p); // cascade reference (broken only by drop)
		const underTable = (schema: string, table: string) => [nref('tbl', schema, table), nref('sch', schema)];
		// What DROP INDEX and ALTER INDEX read of the table of the index. They name the index by its schema,
		// so a rename of the table does not break them. A drop of the table drops the index, and a move of
		// the table to another schema moves the index.
		const indexHome = (schema: string, table: string) => [eref('tbl', schema, table), nref('sch', schema)];
		const colEnum = (column: Pick<Column, 'typeSchema' | 'type'>): string[] =>
			column.typeSchema && column.typeSchema !== 'pg_catalog' && column.type
				? [nref('enum', column.typeSchema, column.type)]
				: [];
		const idxCols = (cols: Pick<IndexColumn, 'value' | 'isExpression'>[], ref: (c: string) => string) =>
			cols.filter((c) => !c.isExpression).map((c) => ref(c.value));
		// A foreign key needs a primary key, a unique constraint or a unique index on the columns that it
		// references, in any column order.
		const uniqueKey = (schema: string, table: string, columns: string[]) =>
			exist('ukey', schema, table, ...[...columns].sort());
		const indexKey = (
			index: Pick<Index, 'schema' | 'table' | 'isUnique' | 'where'> & {
				columns: Pick<IndexColumn, 'value' | 'isExpression'>[];
			},
		) =>
			index.isUnique && !index.where && index.columns.every((c) => !c.isExpression)
				? [uniqueKey(index.schema, index.table, index.columns.map((c) => c.value))]
				: [];
		const policyRoles = (policy: { roles: string[] }) =>
			policy.roles.filter((role) => !builtinPolicyRoles.includes(role)).map((role) => nref('role', role));

		// A short name for the statement. The switch narrows it to one statement kind in every case.
		const s = statement;
		switch (s.type) {
			// ---- tables ----
			case 'create_table':
				return {
					owns: [
						...created('tbl', s.table.schema, s.table.name),
						...(s.table.pk ? [name('rel', s.table.schema, s.table.pk.name)] : []),
						...s.table.uniques.map((unique) => name('rel', s.table.schema, unique.name)),
					],
					needs: [nref('sch', s.table.schema), ...s.table.columns.flatMap(colEnum)],
				};
			case 'drop_table':
				return { owns: created('tbl', s.table.schema, s.table.name), needs: [nref('sch', s.table.schema)] };
			case 'rename_table':
				return {
					owns: [...endpoint('tbl', s.schema, s.from), ...endpoint('tbl', s.schema, s.to)],
					needs: [nref('sch', s.schema)],
				};
			case 'move_table': // the indexes of the table move with it, so the table stops existing in its schema
				return {
					owns: [
						...endpoint('tbl', s.from, s.name),
						...endpoint('tbl', s.to, s.name),
						exist('tbl', s.from, s.name),
						exist('tbl', s.to, s.name),
						...s.indexNames.flatMap((index) => [name('rel', s.from, index), name('rel', s.to, index)]),
					],
					needs: [nref('sch', s.from), nref('sch', s.to)],
				};

			// ---- columns ----
			case 'add_column':
				return {
					owns: created('col', s.column.schema, s.column.table, s.column.name),
					needs: [...underTable(s.column.schema, s.column.table), ...colEnum(s.column)],
				};
			case 'drop_column':
				return {
					owns: created('col', s.column.schema, s.column.table, s.column.name),
					needs: underTable(s.column.schema, s.column.table),
				};
			case 'alter_column': {
				// The statement keeps the name and the existence of the column, so it only reads the name. It
				// writes one node for each property that its SQL changes or needs. SET NOT NULL and DROP NOT NULL
				// run in either order with a change of the type, the default or the generation expression. A change
				// of the type rewrites the default. An identity needs NOT NULL and no default. A generated column
				// takes no default.
				const d = s.diff;
				const properties = new Set<string>();
				if (d.notNull) properties.add('notNull');
				if (d.default) properties.add('default');
				if (d.type || d.typeSchema || d.dimensions) properties.add('type').add('default');
				if (d.generated) properties.add('generated').add('default');
				if (d.identity) properties.add('identity').add('default').add('notNull');
				const column = [s.to.schema, s.to.table, s.to.name] as const;
				return {
					owns: [...properties].flatMap((property) => altered('colprop', ...column, property)),
					needs: [
						...underTable(s.to.schema, s.to.table),
						nref('col', ...column),
						// Only SET DATA TYPE and SET DEFAULT name the type of the column in their SQL.
						...(d.default || properties.has('type') ? colEnum(s.to) : []),
					],
				};
			}
			case 'recreate_column': // DROP + re-ADD the column: destroys & re-establishes it (cascading its
				// indexes/constraints), so it writes existence like a create/drop, not just `self` like an alter
				return {
					owns: created('col', s.column.schema, s.column.table, s.column.name),
					needs: [...underTable(s.column.schema, s.column.table), ...colEnum(s.column)],
				};
			case 'rename_column':
				return {
					owns: [
						...endpoint('col', s.from.schema, s.from.table, s.from.name),
						...endpoint('col', s.to.schema, s.to.table, s.to.name),
					],
					needs: underTable(s.from.schema, s.from.table),
				};

			// ---- indexes ----
			case 'create_index': // DDL hardcodes the columns -> NAME refs (break on rename)
				return {
					owns: created('idx', s.index.schema, s.index.name),
					needs: [
						...underTable(s.index.schema, s.index.table),
						...idxCols(s.index.columns, (c) => nref('col', s.index.schema, s.index.table, c)),
					],
					provides: indexKey(s.index),
				};
			// no table and no columns in SQL, but cascaded by a table drop or a column drop -> EXISTENCE refs
			case 'drop_index': {
				const key = indexKey(s.index);
				return {
					owns: created('idx', s.index.schema, s.index.name),
					needs: [
						// The key of a unique index is written with the name of its table. A rename of the table
						// would hide the key from a new foreign key of the other branch, so this drop reads the name.
						...(key.length > 0 ? underTable : indexHome)(s.index.schema, s.index.table),
						...idxCols(s.index.columns, (c) => eref('col', s.index.schema, s.index.table, c)),
					],
					provides: key,
				};
			}
			case 'recreate_index':
				return {
					owns: created('idx', s.index.schema, s.index.name),
					needs: [
						...underTable(s.index.schema, s.index.table),
						...idxCols(s.index.columns, (c) => nref('col', s.index.schema, s.index.table, c)),
					],
					provides: [
						...indexKey({ ...s.old, schema: s.index.schema, table: s.index.table }),
						...indexKey(s.index),
					],
				};
			// rename follows table and column renames, cascaded by table and column drops -> EXISTENCE refs
			case 'rename_index':
				return {
					owns: [...endpoint('idx', s.schema, s.from), ...endpoint('idx', s.schema, s.to)],
					needs: [
						...indexHome(s.schema, s.table),
						...s.columns.map((c) => eref('col', s.schema, s.table, c)),
					],
				};

			// ---- primary keys ----
			case 'add_pk': // `ADD PRIMARY KEY (c)` hardcodes columns -> NAME refs
				return {
					owns: [...created('pk', s.pk.schema, s.pk.table), ...pkNames(s.pk.schema, s.pk.table, s.pk.name)],
					needs: [
						...underTable(s.pk.schema, s.pk.table),
						...s.pk.columns.map((c) => nref('col', s.pk.schema, s.pk.table, c)),
					],
					provides: [uniqueKey(s.pk.schema, s.pk.table, s.pk.columns)],
				};
			case 'drop_pk': // cascaded by column drop -> EXISTENCE refs
				return {
					owns: [...created('pk', s.pk.schema, s.pk.table), ...pkNames(s.pk.schema, s.pk.table, s.pk.name)],
					needs: [
						...underTable(s.pk.schema, s.pk.table),
						...s.pk.columns.map((c) => eref('col', s.pk.schema, s.pk.table, c)),
					],
					provides: [uniqueKey(s.pk.schema, s.pk.table, s.pk.columns)],
				};
			case 'alter_pk':
				return {
					owns: altered('pk', s.pk.schema, s.pk.table),
					needs: [
						...underTable(s.pk.schema, s.pk.table),
						...s.pk.columns.map((c) => nref('col', s.pk.schema, s.pk.table, c)),
					],
					provides: [s.oldColumns, s.pk.columns].map((columns) => uniqueKey(s.pk.schema, s.pk.table, columns)),
				};

			// ---- foreign keys ----
			case 'create_fk':
			case 'recreate_fk':
				return {
					owns: created('fk', s.fk.schema, s.fk.table, s.fk.name),
					needs: [
						...underTable(s.fk.schema, s.fk.table),
						nref('tbl', s.fk.schemaTo, s.fk.tableTo),
						nref('sch', s.fk.schemaTo),
						...s.fk.columns.map((c) => nref('col', s.fk.schema, s.fk.table, c)),
						...s.fk.columnsTo.map((c) => nref('col', s.fk.schemaTo, s.fk.tableTo, c)),
						uniqueKey(s.fk.schemaTo, s.fk.tableTo, s.fk.columnsTo),
					],
				};
			case 'drop_fk':
				return {
					owns: created('fk', s.fk.schema, s.fk.table, s.fk.name),
					needs: [
						...underTable(s.fk.schema, s.fk.table),
						...s.fk.columns.map((c) => eref('col', s.fk.schema, s.fk.table, c)),
					],
				};

			// ---- unique constraints ----
			case 'add_unique':
				return {
					owns: created('uq', s.unique.schema, s.unique.table, s.unique.name),
					needs: [
						...underTable(s.unique.schema, s.unique.table),
						...s.unique.columns.map((c) => nref('col', s.unique.schema, s.unique.table, c)),
					],
					provides: [uniqueKey(s.unique.schema, s.unique.table, s.unique.columns)],
				};
			case 'drop_unique':
				return {
					owns: created('uq', s.unique.schema, s.unique.table, s.unique.name),
					needs: [
						...underTable(s.unique.schema, s.unique.table),
						...s.unique.columns.map((c) => eref('col', s.unique.schema, s.unique.table, c)),
					],
					provides: [uniqueKey(s.unique.schema, s.unique.table, s.unique.columns)],
				};
			case 'alter_unique': // recreated as DROP $left + ADD $right: name-ref the new cols, existence-ref the old
				return {
					owns: altered('uq', s.to.schema, s.to.table, s.to.name),
					needs: [
						...underTable(s.to.schema, s.to.table),
						...s.to.columns.map((c) => nref('col', s.to.schema, s.to.table, c)),
						...s.from.columns.map((c) => eref('col', s.to.schema, s.to.table, c)),
					],
					provides: [s.from, s.to].map((unique) => uniqueKey(s.to.schema, s.to.table, unique.columns)),
				};

			// ---- check constraints (columns come from parsing the CHECK expression) ----
			case 'add_check': // `ADD CHECK (c > 0)` hardcodes the columns -> NAME refs
				return {
					owns: created('ck', s.check.schema, s.check.table, s.check.name),
					needs: [
						...underTable(s.check.schema, s.check.table),
						...s.columns.map((c) => nref('col', s.check.schema, s.check.table, c)),
					],
				};
			case 'drop_check': // cascaded by a column drop -> EXISTENCE refs
				return {
					owns: created('ck', s.check.schema, s.check.table, s.check.name),
					needs: [
						...underTable(s.check.schema, s.check.table),
						...s.columns.map((c) => eref('col', s.check.schema, s.check.table, c)),
					],
				};
			case 'alter_check': // recreated as DROP old + ADD new: name-ref new expr cols, existence-ref old
				return {
					owns: altered('ck', s.check.schema, s.check.table, s.check.name),
					needs: [
						...underTable(s.check.schema, s.check.table),
						...s.newColumns.map((c) => nref('col', s.check.schema, s.check.table, c)),
						...s.oldColumns.map((c) => eref('col', s.check.schema, s.check.table, c)),
					],
				};

			case 'rename_constraint': { // RENAME CONSTRAINT follows a column rename but is cascaded by a column drop -> EXISTENCE refs
				const needs = [
					...underTable(s.schema, s.table),
					...s.columns.map((c) => eref('col', s.schema, s.table, c)),
				];
				const named = (k: NodeKind) => ({
					owns: [...endpoint(k, s.schema, s.table, s.from), ...endpoint(k, s.schema, s.table, s.to)],
					needs,
				});
				switch (s.entityType) {
					case 'pks': // a table has one primary key, so the node of the key holds no name
						return {
							owns: [
								...endpoint('pk', s.schema, s.table),
								...pkNames(s.schema, s.table, s.from),
								...pkNames(s.schema, s.table, s.to),
							],
							needs,
						};
					case 'uniques':
						return named('uq');
					case 'checks':
						return named('ck');
					case 'fks':
						return named('fk');
					default: {
						const unhandled: never = s.entityType;
						throw new Error(`rename_constraint has the unknown constraint kind '${unhandled}'`);
					}
				}
			}

			// ---- enums (schema-scoped) ----
			case 'create_enum':
				return { owns: created('enum', s.enum.schema, s.enum.name), needs: [nref('sch', s.enum.schema)] };
			case 'drop_enum':
				return { owns: created('enum', s.enum.schema, s.enum.name), needs: [nref('sch', s.enum.schema)] };
			case 'rename_enum':
				return {
					owns: [...endpoint('enum', s.schema, s.from), ...endpoint('enum', s.schema, s.to)],
					needs: [nref('sch', s.schema)],
				};
			case 'alter_enum':
				return { owns: altered('enum', s.to.schema, s.to.name), needs: [nref('sch', s.to.schema)] };
			case 'recreate_enum': // DROP TYPE + CREATE TYPE, and an ALTER TABLE for every column of the type
				return {
					owns: [
						...created('enum', s.to.schema, s.to.name),
						// The SQL ends with SET DATA TYPE for every column of the type, and that sets the type back when
						// another branch gave the column another type. A change of the type rewrites the default.
						...s.columns.flatMap((c) =>
							['type', 'default'].flatMap((property) => altered('colprop', c.schema, c.table, c.name, property))
						),
					],
					needs: [
						nref('sch', s.to.schema),
						...s.columns.flatMap((c) => [...underTable(c.schema, c.table), nref('col', c.schema, c.table, c.name)]),
					],
				};
			case 'move_enum':
				return {
					owns: [
						...endpoint('enum', s.from.schema, s.from.name),
						...endpoint('enum', s.to.schema, s.to.name),
					],
					needs: [nref('sch', s.from.schema), nref('sch', s.to.schema)],
				};

			// ---- sequences (schema-scoped) ----
			case 'create_sequence':
				return { owns: created('seq', s.sequence.schema, s.sequence.name), needs: [nref('sch', s.sequence.schema)] };
			case 'drop_sequence':
				return { owns: created('seq', s.sequence.schema, s.sequence.name), needs: [nref('sch', s.sequence.schema)] };
			case 'rename_sequence':
				return {
					owns: [...endpoint('seq', s.from.schema, s.from.name), ...endpoint('seq', s.to.schema, s.to.name)],
					needs: [nref('sch', s.from.schema)],
				};
			case 'alter_sequence':
				return { owns: altered('seq', s.sequence.schema, s.sequence.name), needs: [nref('sch', s.sequence.schema)] };
			case 'move_sequence':
				return {
					owns: [
						...endpoint('seq', s.from.schema, s.from.name),
						...endpoint('seq', s.to.schema, s.to.name),
					],
					needs: [nref('sch', s.from.schema), nref('sch', s.to.schema)],
				};

			// ---- views (schema-scoped) ----
			case 'create_view':
				return { owns: created('view', s.view.schema, s.view.name), needs: [nref('sch', s.view.schema)] };
			case 'drop_view':
				return { owns: created('view', s.view.schema, s.view.name), needs: [nref('sch', s.view.schema)] };
			case 'rename_view':
				return {
					owns: [...endpoint('view', s.from.schema, s.from.name), ...endpoint('view', s.to.schema, s.to.name)],
					needs: [nref('sch', s.from.schema)],
				};
			case 'alter_view':
				return { owns: altered('view', s.view.schema, s.view.name), needs: [nref('sch', s.view.schema)] };
			case 'move_view':
				return {
					owns: [...endpoint('view', s.fromSchema, s.view.name), ...endpoint('view', s.toSchema, s.view.name)],
					needs: [nref('sch', s.fromSchema), nref('sch', s.toSchema)],
				};

			// ---- schemas (top level) ----
			case 'create_schema':
				return { owns: created('sch', s.name) };
			case 'drop_schema':
				return { owns: created('sch', s.name) };
			case 'rename_schema':
				return { owns: [...endpoint('sch', s.from.name), ...endpoint('sch', s.to.name)] };

			// ---- policies (children of the table) ----
			case 'create_policy': // the SQL names the roles of the policy
				return {
					owns: created('pol', s.policy.schema, s.policy.table, s.policy.name),
					needs: [
						...underTable(s.policy.schema, s.policy.table),
						...policyRoles(s.policy),
						// Postgres does not enforce a policy on a table without row level security.
						eref('rls', s.policy.schema, s.policy.table),
					],
				};
			case 'alter_policy':
			case 'recreate_policy':
				return {
					owns: altered('pol', s.policy.schema, s.policy.table, s.policy.name),
					needs: [...underTable(s.policy.schema, s.policy.table), ...policyRoles(s.policy)],
				};
			case 'drop_policy':
				return {
					owns: created('pol', s.policy.schema, s.policy.table, s.policy.name),
					needs: underTable(s.policy.schema, s.policy.table),
				};
			case 'rename_policy':
				return {
					owns: [
						...endpoint('pol', s.from.schema, s.from.table, s.from.name),
						...endpoint('pol', s.to.schema, s.to.table, s.to.name),
					],
					needs: underTable(s.from.schema, s.from.table),
				};

			// ---- RLS toggle (a child aspect of the table) ----
			// A DISABLE and a new policy of another branch run in either order, and the policy is then not
			// enforced. So a DISABLE ends the row level security that a new policy reads.
			case 'alter_rls':
				return {
					owns: altered('rls', s.schema, s.name),
					destroys: s.isRlsEnabled ? [] : [exist('rls', s.schema, s.name)],
					needs: underTable(s.schema, s.name),
				};

			// ---- roles (cluster level) ----
			case 'create_role':
				return { owns: created('role', s.role.name) };
			case 'alter_role':
				return { owns: altered('role', s.role.name) };
			case 'drop_role':
				return { owns: created('role', s.role.name) };
			case 'rename_role':
				return { owns: [...endpoint('role', s.from.name), ...endpoint('role', s.to.name)] };

			// ---- privileges ----
			case 'grant_privilege':
			case 'revoke_privilege':
			case 'regrant_privilege': {
				const { schema, table, grantee, grantor } = s.privilege;
				// ALL holds every other privilege type, so it claims each of them.
				const types = s.privilege.type === 'ALL' ? privilegeTypes : [s.privilege.type];
				return {
					owns: types.flatMap((type) => altered('priv', schema || '', table || '', grantee, type)),
					needs: [
						...(table ? underTable(schema || 'public', table) : []),
						nref('role', grantee),
						// GRANT names the grantor in GRANTED BY. REVOKE does not, and it still reads the grantor: the key of
						// a privilege holds it, so a rename of that role would hide the row from the drop.
						nref('role', grantor),
					],
				};
			}

			default: {
				// Exhaustiveness guard: `statement` is `never` here only when every
				// SnapshotStatement type has an explicit case above. Adding a new statement
				// type without handling it here is therefore a compile error — forcing
				// its footprint to be declared rather than silently defaulted.
				const unhandled: never = s;
				throw new Error(`buildFacetPaths: unhandled statement type '${(unhandled as { type: string }).type}'`);
			}
		}
	}

	public override async detectNonCommutative(snapshots: string[] | ParsedSnapshotInput[]) {
		const nodes = this.buildSnapshotGraph(snapshots);
		// The conflicts come only from the statements that each snapshot stores. Nothing is diffed here.
		return this.detectBranchConflicts(nodes, (id) => nodes[id].raw.statements);
	}
}

export const postgresCommutativity = new PostgresCommutativity();
