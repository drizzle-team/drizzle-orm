import type { TypeOf, ZodTypeAny } from 'zod';
import { array, boolean, custom, literal, object, string } from 'zod';
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
};

type Schemas = typeof snapshotStatementSchemas;

// A kind without a schema stores the statement as the diff builds it.
export type SnapshotStatement = {
	[K in JsonStatement['type']]: K extends keyof Schemas ? TypeOf<Schemas[K]> : Extract<JsonStatement, { type: K }>;
}[JsonStatement['type']];
