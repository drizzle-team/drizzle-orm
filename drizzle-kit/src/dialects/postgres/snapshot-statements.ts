import type { TypeOf, ZodTypeAny } from 'zod';
import { array, boolean, custom, enum as oneOf, literal, object, string } from 'zod';
import { validateRow } from '../dialect';
import { createDDL, type PostgresEntities } from './ddl';
import type { JsonStatement } from './statements';

// The form of each statement kind that a snapshot stores. A stored statement holds what the SQL writer and
// the claim rule of its kind read, and nothing else. Every object is strict, so a missing field or an
// unknown field makes the snapshot malformed.

const definitions = createDDL()._.defs;

type EntityType = keyof PostgresEntities;

// A full row of one entity type, without `entityType`. It is checked like a row of a snapshot.
export type StoredRow<K extends EntityType> = Omit<PostgresEntities[K], 'entityType'>;
const row = <K extends EntityType>(type: K) =>
	custom<StoredRow<K>>((it) =>
		typeof it === 'object' && it !== null && !('entityType' in it) && validateRow(it, definitions[type])
	);

// The value of one field of an entity type, checked against the definition of that field.
const field = <K extends EntityType, F extends keyof PostgresEntities[K] & string>(type: K, name: F) =>
	custom<PostgresEntities[K][F]>((it) => validateRow({ [name]: it }, { [name]: definitions[type][name] }, true));

// A changed field of an altered entity.
const change = <T extends ZodTypeAny>(value: T) => object({ from: value, to: value }).strict().optional();

const statement = <T extends string, S extends Record<string, ZodTypeAny>>(type: T, shape: S) =>
	object({ type: literal(type), ...shape }).strict();

// The names of an entity that belongs to a table.
const inTable = object({ schema: string(), table: string(), name: string() }).strict();

// What the claim rules read of an index that is dropped or replaced.
const indexColumns = array(object({ value: string(), isExpression: boolean() }).strict());
const uniqueness = { columns: indexColumns, isUnique: boolean(), where: string().nullable() };

// The names of a constraint and its columns.
const constraint = object({ schema: string(), table: string(), name: string(), columns: array(string()) }).strict();

export const snapshotStatementSchemas = {
	create_table: statement('create_table', {
		table: object({
			schema: string(),
			name: string(),
			// The statement also enables row level security: the table has it enabled, or it has policies.
			enablesRls: boolean(),
			columns: array(row('columns')),
			pk: row('pks').nullable(),
			uniques: array(row('uniques')),
			checks: array(row('checks')),
		}).strict(),
	}),
	drop_table: statement('drop_table', {
		table: object({ schema: string(), name: string(), policies: array(inTable) }).strict(),
	}),
	rename_table: statement('rename_table', { schema: string(), from: string(), to: string() }),
	move_table: statement('move_table', { name: string(), from: string(), to: string() }),
	add_column: statement('add_column', { column: row('columns'), isPK: boolean(), isCompositePK: boolean() }),
	drop_column: statement('drop_column', { column: inTable }),
	rename_column: statement('rename_column', { from: inTable, to: inTable }),
	alter_column: statement('alter_column', {
		to: row('columns'),
		// The default of the column before the statement, whether the statement changes it or not.
		oldDefault: field('columns', 'default'),
		isEnum: boolean(),
		wasEnum: boolean(),
		wasSerial: boolean(),
		toSerial: boolean(),
		diff: object({
			type: change(field('columns', 'type')),
			typeSchema: change(field('columns', 'typeSchema')),
			dimensions: change(field('columns', 'dimensions')),
			default: change(field('columns', 'default')),
			notNull: change(field('columns', 'notNull')),
			generated: change(field('columns', 'generated')),
			identity: change(field('columns', 'identity')),
		}).strict(),
	}),
	recreate_column: statement('recreate_column', { column: row('columns'), isPK: boolean() }),

	create_index: statement('create_index', { index: row('indexes') }),
	drop_index: statement('drop_index', {
		index: object({ schema: string(), table: string(), name: string(), ...uniqueness }).strict(),
	}),
	rename_index: statement('rename_index', {
		schema: string(),
		table: string(),
		from: string(),
		to: string(),
		columns: array(string()),
	}),
	recreate_index: statement('recreate_index', {
		index: row('indexes'),
		// False when a column of the index is dropped in the same migration, because that drops the index too.
		shouldDrop: boolean(),
		old: object(uniqueness).strict(),
	}),
	add_pk: statement('add_pk', { pk: row('pks') }),
	drop_pk: statement('drop_pk', { pk: constraint }),
	alter_pk: statement('alter_pk', {
		pk: row('pks'),
		// True when a column of the old key is dropped in the same migration, because that drops the key too.
		deleted: boolean(),
		oldColumns: array(string()),
	}),
	create_fk: statement('create_fk', { fk: row('fks') }),
	drop_fk: statement('drop_fk', { fk: constraint }),
	recreate_fk: statement('recreate_fk', { fk: row('fks') }),
	add_unique: statement('add_unique', { unique: row('uniques') }),
	drop_unique: statement('drop_unique', { unique: constraint }),
	alter_unique: statement('alter_unique', { from: constraint, to: row('uniques') }),
	// `columns` are the columns of the table that the expression of the check names.
	add_check: statement('add_check', { check: row('checks'), columns: array(string()) }),
	drop_check: statement('drop_check', { check: inTable, columns: array(string()) }),
	alter_check: statement('alter_check', {
		check: row('checks'),
		newColumns: array(string()),
		oldColumns: array(string()),
	}),
	rename_constraint: statement('rename_constraint', {
		entityType: oneOf(['pks', 'uniques', 'checks', 'fks']),
		schema: string(),
		table: string(),
		from: string(),
		to: string(),
		columns: array(string()),
	}),
};

type Schemas = typeof snapshotStatementSchemas;

// A kind without a schema stores the statement as the diff builds it.
export type SnapshotStatement = {
	[K in JsonStatement['type']]: K extends keyof Schemas ? TypeOf<Schemas[K]> : Extract<JsonStatement, { type: K }>;
}[JsonStatement['type']];
