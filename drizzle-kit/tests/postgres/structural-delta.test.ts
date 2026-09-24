import { sql } from 'drizzle-orm';
import {
	check,
	foreignKey,
	index,
	integer,
	pgEnum,
	pgMaterializedView,
	pgPolicy,
	pgRole,
	pgSchema,
	pgSequence,
	pgTable,
	pgView,
	primaryKey,
	text,
	unique,
	uniqueIndex,
	varchar,
} from 'drizzle-orm/pg-core';
import { normalizeDDL } from 'src/dialects/ddl-canonical';
import { apply, delta } from 'src/dialects/dialect';
import { createDDL } from 'src/dialects/postgres/ddl';
import { describe, expect, test } from 'vitest';
import { drizzleToDDL } from './mocks';

// A DDL instance (for delta/apply, which read the engine's identity generators) and its
// materialized rows (for canonical comparison, which is identity-independent over the set).
const ddlOf = (schema: any) => drizzleToDDL(schema).ddl;
const rowsOf = (schema: any) => drizzleToDDL(schema).ddl.entities.list();
// Two ddls are equal iff their canonical forms are — exact, no hashing.
const eq = (a: any, b: any) =>
	normalizeDDL(a.entities.list()).join('\n') === normalizeDDL(b.entities.list()).join('\n');

/**
 * Scenarios are keyed by ENTITY type, not statement type. Structural deltas do not
 * know statements exist, so what has to be covered is the entity model — roughly a
 * dozen shapes rather than 59 statement cases.
 */
const users = pgTable('users', { id: integer('id'), email: varchar('email') });
const other = pgSchema('other');
const mood = pgEnum('mood', ['ok', 'sad']);
const mood3 = pgEnum('mood', ['ok', 'sad', 'happy']);
const admin = pgRole('admin');

const scenarios: Record<string, [any, any]> = {
	'table added': [{ users }, { users, orders: pgTable('orders', { id: integer('id') }) }],
	'table dropped': [{ users, orders: pgTable('orders', { id: integer('id') }) }, { users }],
	'column added': [{ users }, {
		users: pgTable('users', { id: integer('id'), email: varchar('email'), age: integer('age') }),
	}],
	'column altered (notNull)': [{ users }, {
		users: pgTable('users', { id: integer('id'), email: varchar('email').notNull() }),
	}],
	'column type changed': [{ users }, { users: pgTable('users', { id: integer('id'), email: text('email') }) }],
	'column default changed': [{ users }, {
		users: pgTable('users', { id: integer('id'), email: varchar('email').default('x') }),
	}],
	'column generated added': [
		{ users },
		{ users: pgTable('users', { id: integer('id'), email: varchar('email').generatedAlwaysAs(sql`'x'`) }) },
	],
	'index added': [
		{ users },
		{ users: pgTable('users', { id: integer('id'), email: varchar('email') }, (t) => [index('ix').on(t.email)]) },
	],
	'unique index added': [
		{ users },
		{
			users: pgTable('users', { id: integer('id'), email: varchar('email') }, (t) => [uniqueIndex('uix').on(t.email)]),
		},
	],
	'pk added': [
		{ users },
		{
			users: pgTable('users', { id: integer('id'), email: varchar('email') }, (t) => [primaryKey({ columns: [t.id] })]),
		},
	],
	'unique constraint added': [
		{ users },
		{ users: pgTable('users', { id: integer('id'), email: varchar('email') }, (t) => [unique('uq').on(t.email)]) },
	],
	'check added': [
		{ users },
		{ users: pgTable('users', { id: integer('id'), email: varchar('email') }, (t) => [check('ck', sql`${t.id} > 0`)]) },
	],
	'fk added': [
		{
			users,
			orders: pgTable('orders', { id: integer('id'), userId: integer('user_id') }),
		},
		{
			users: pgTable('users', { id: integer('id').primaryKey(), email: varchar('email') }),
			orders: pgTable('orders', { id: integer('id'), userId: integer('user_id') }, (t) => [
				foreignKey({ columns: [t.userId], foreignColumns: [users.id], name: 'fk' }),
			]),
		},
	],
	'schema added': [{ users }, { users, other }],
	'table moved to another schema': [
		{ users, other },
		{ other, moved: other.table('users', { id: integer('id'), email: varchar('email') }) },
	],
	'enum added': [{ users }, { users, mood }],
	'enum values appended': [{ users, mood }, { users, mood: mood3 }],
	'sequence added': [{ users }, { users, seq: pgSequence('seq', { startWith: 1 }) }],
	'view added': [{ users }, { users, v: pgView('v').as((qb) => qb.select().from(users)) }],
	'materialized view added': [
		{ users },
		{ users, mv: pgMaterializedView('mv').as((qb) => qb.select().from(users)) },
	],
	'role added': [{ users }, { users, admin }],
	'policy added': [
		{ users },
		{
			admin,
			users: pgTable('users', { id: integer('id'), email: varchar('email') }, () => [
				pgPolicy('pol', { for: 'select', to: admin }),
			]),
		},
	],
};

describe('structural deltas round-trip every entity type', () => {
	for (const [name, [from, to]] of Object.entries(scenarios)) {
		test(name, () => {
			const A = ddlOf(from);
			const B = ddlOf(to);

			// The delta must be non-trivial, or the scenario proves nothing.
			const deltas = delta(A, B);
			expect(deltas.length).toBeGreaterThan(0);

			expect(normalizeDDL(apply(A, deltas).entities.list())).toStrictEqual(normalizeDDL(B.entities.list()));

			// ...and backwards, which exercises `drop` and the reverse alters.
			const back = delta(B, A);
			expect(normalizeDDL(apply(B, back).entities.list())).toStrictEqual(normalizeDDL(A.entities.list()));

			// apply is pure — the base is never mutated.
			expect(eq(A, ddlOf(from))).toBe(true);
		});
	}
});

describe('entity identity is injective (no collisions)', () => {
	// The engine keys every entity by its injective identity generator, so pushing a full
	// entity set never loses a row to a collision. `pushAll` returns CONFLICT on a genuine
	// duplicate, so an OK status is the collision-free proof — the successor to the old
	// fixed `entityType|schema|table|name` keyOf's `findKeyCollisions`.
	for (const [name, [from, to]] of Object.entries(scenarios)) {
		test(name, () => {
			expect(createDDL().entities.pushAll(rowsOf(from)).status).toBe('OK');
			expect(createDDL().entities.pushAll(rowsOf(to)).status).toBe('OK');
		});
	}

	test('a pk and a unique constraint sharing one name on one table', () => {
		// Postgres shares a constraint namespace across pks/uniques/fks/checks, but the
		// engine key includes entityType, so same-named different-typed constraints do NOT
		// collide. Pinning that, since it is the nearest miss.
		const t = pgTable('t', { id: integer('id') }, (x) => [
			primaryKey({ name: 'same', columns: [x.id] }),
			unique('same').on(x.id),
		]);
		expect(createDDL().entities.pushAll(rowsOf({ t })).status).toBe('OK');
	});
});

describe('nameless entities (privileges) key off the whole row', () => {
	// A grant has no name; the engine keys it by (schema, table, grantor, grantee, type).
	// The alter delta must therefore take its key from the WHOLE new row ($right), not the
	// bare alter row which only carries the changed field — this is the regression guard for
	// that contract. If _diff ever stops attaching $right, this collapses and fails here.
	test('a grantability change is a single, correctly-keyed alter', () => {
		const A = createDDL();
		A.privileges.push({
			schema: 'public',
			table: 't',
			grantor: 'g1',
			grantee: 'g2',
			type: 'SELECT',
			isGrantable: false,
		});
		const B = createDDL();
		B.privileges.push({
			schema: 'public',
			table: 't',
			grantor: 'g1',
			grantee: 'g2',
			type: 'SELECT',
			isGrantable: true,
		});

		const d = delta(A, B);
		expect(d).toHaveLength(1);
		expect(d[0].op).toBe('alter');
		expect((d[0] as any).set).toStrictEqual({ isGrantable: true });

		expect(eq(apply(A, d), B)).toBe(true);
		expect(eq(apply(B, delta(B, A)), A)).toBe(true);
	});

	test('two grants that differ only by grantee are distinct, not a collision', () => {
		const A = createDDL();
		A.privileges.push({
			schema: 'public',
			table: 't',
			grantor: 'g1',
			grantee: 'g2',
			type: 'SELECT',
			isGrantable: false,
		});
		A.privileges.push({
			schema: 'public',
			table: 't',
			grantor: 'g1',
			grantee: 'g3',
			type: 'SELECT',
			isGrantable: false,
		});
		expect(A.privileges.list().length).toBe(2);
	});
});

describe('canonical form', () => {
	test('depends on meaning, not on key or entity order', () => {
		const a = rowsOf({ users });
		// Same entities, reversed order, and every object's keys reversed too.
		const shuffled = [...a].reverse().map((e) =>
			Object.fromEntries(Object.entries(e).reverse()) as Record<string, any>
		);
		expect(normalizeDDL(shuffled)).toStrictEqual(normalizeDDL(a));
	});

	test('changes when any field changes', () => {
		const a = rowsOf({ users });
		const b = rowsOf({ users: pgTable('users', { id: integer('id'), email: varchar('email').notNull() }) });
		expect(normalizeDDL(a)).not.toStrictEqual(normalizeDDL(b));
	});
});
