// Verifies that `generate` with a rename hint stores one rename delta, for every kind of entity that can be
// renamed: schema, table, column, enum, sequence, role, index, primary key, unique, foreign key, check,
// policy and view. Entities that reference the renamed entity get no delta, and the reconstructed state still
// equals the schema. Each case also checks the SQL of the migration, runs it on PGlite, and checks that the
// next `generate` finds no changes.
import { sql } from 'drizzle-orm';
import {
	check,
	foreignKey,
	index,
	integer,
	pgEnum,
	pgPolicy,
	pgRole,
	pgSchema,
	pgSequence,
	pgTable,
	pgView,
	primaryKey,
	unique,
	varchar,
} from 'drizzle-orm/pg-core';
import type { Hint } from 'src/cli/hints';
import type { Delta } from 'src/dialects/dialect';
import { describe, expect, test } from 'vitest';
import { createFolderFlow, rename, schemaState } from './folder-flow';
import type { PostgresSchema } from './mocks';

// One rename case. `sql` is the whole migration of the rename, and `delta` is the only delta that the
// snapshot stores for it.
type Scenario = { before: PostgresSchema; after: PostgresSchema; hint: Hint; sql: string; delta: Delta };

// The tables of the rename cases. Every constraint has an explicit name, because after a table or column
// rename a constraint with a generated name keeps its old name in the reconstructed state, and
// `schemaState(after)` derives a new name from the schema file.
const usersTable = (table: string, contact: string, role = pgRole('staff'), policy = 'users_read') => {
	const users = pgTable(table, { id: integer().notNull(), [contact]: varchar().notNull() }, (t) => [
		primaryKey({ name: 'users_pk', columns: [t.id, t[contact]] }),
		unique('users_contact_unique').on(t[contact]),
		index('users_contact_idx').on(t[contact]),
		check('users_id_check', sql`${t.id} > 0`),
		pgPolicy(policy, { for: 'select', to: role }),
	]);
	const posts = pgTable('posts', { id: integer(), author: varchar() }, (t) => [
		foreignKey({ name: 'posts_author_fk', columns: [t.author], foreignColumns: [users[contact]] }),
	]);
	return { role, users, posts };
};

const app = pgSchema('app');
const core = pgSchema('core');
const inSchema = (schema: ReturnType<typeof pgSchema>) => {
	const mood = schema.enum('mood', ['ok', 'bad']);
	const items = schema.table('items', { id: integer().notNull(), mood: mood() }, (t) => [
		primaryKey({ name: 'items_pk', columns: [t.id] }),
		index('items_mood_idx').on(t.mood),
	]);
	return {
		schema,
		mood,
		items,
		counter: schema.sequence('counter'),
		// The definition names no schema, so the schema rename does not change it.
		one: schema.view('one', { id: integer() }).as(sql`select 1 as id`),
		users: pgTable('users', { id: integer(), mood: mood(), itemId: integer('item_id') }, (t) => [
			foreignKey({ name: 'users_item_fk', columns: [t.itemId], foreignColumns: [items.id] }),
		]),
	};
};

const withEnum = (name: string) => {
	const mood = pgEnum(name, ['ok', 'bad']);
	return { mood, users: pgTable('users', { id: integer(), mood: mood() }) };
};

const withConstraints = (names: { pk?: string; unique?: string; fk?: string; check?: string; index?: string }) => {
	const users = pgTable('users', { id: integer().notNull(), email: varchar().notNull() }, (t) => [
		primaryKey({ name: names.pk ?? 'users_pk', columns: [t.id] }),
		unique(names.unique ?? 'users_email_unique').on(t.email),
		index(names.index ?? 'users_email_idx').on(t.email),
		check(names.check ?? 'users_id_check', sql`${t.id} > 0`),
	]);
	const posts = pgTable('posts', { id: integer(), author: integer() }, (t) => [
		foreignKey({ name: names.fk ?? 'posts_author_fk', columns: [t.author], foreignColumns: [users.id] }),
	]);
	return { users, posts };
};

const withView = (name: string) => {
	const users = pgTable('users', { id: integer() });
	return { users, view: pgView(name).as((qb) => qb.select().from(users)) };
};

const scenarios: Record<string, Scenario> = {
	schema: {
		before: inSchema(app),
		after: inSchema(core),
		hint: rename('schema', 'app', 'core'),
		sql: 'ALTER SCHEMA "app" RENAME TO "core";\n',
		delta: { op: 'rename', key: 'schemas\0["app"]', set: { name: 'core' } },
	},
	table: {
		before: usersTable('users', 'email'),
		after: usersTable('accounts', 'email'),
		hint: rename('table', 'public.users', 'public.accounts'),
		sql: 'ALTER TABLE "users" RENAME TO "accounts";',
		delta: { op: 'rename', key: 'tables\0["public","users"]', set: { name: 'accounts' } },
	},
	column: {
		before: usersTable('users', 'email'),
		after: usersTable('users', 'contact'),
		hint: rename('column', 'public.users.email', 'public.users.contact'),
		sql: 'ALTER TABLE "users" RENAME COLUMN "email" TO "contact";',
		delta: { op: 'rename', key: 'columns\0["public","users","email"]', set: { name: 'contact' } },
	},
	enum: {
		before: withEnum('mood'),
		after: withEnum('feeling'),
		hint: rename('enum', 'public.mood', 'public.feeling'),
		sql: 'ALTER TYPE "mood" RENAME TO "feeling";',
		delta: { op: 'rename', key: 'enums\0["public","mood"]', set: { name: 'feeling' } },
	},
	sequence: {
		before: { counter: pgSequence('counter') },
		after: { counter: pgSequence('ticket') },
		hint: rename('sequence', 'public.counter', 'public.ticket'),
		sql: 'ALTER SEQUENCE "counter" RENAME TO "ticket";',
		delta: { op: 'rename', key: 'sequences\0["public","counter"]', set: { name: 'ticket' } },
	},
	role: {
		before: usersTable('users', 'email', pgRole('staff')),
		after: usersTable('users', 'email', pgRole('team')),
		hint: rename('role', 'staff', 'team'),
		sql: 'ALTER ROLE "staff" RENAME TO "team";',
		delta: { op: 'rename', key: 'roles\0["staff"]', set: { name: 'team' } },
	},
	index: {
		before: withConstraints({}),
		after: withConstraints({ index: 'users_contact_idx' }),
		hint: rename('index', 'public.users.users_email_idx', 'public.users.users_contact_idx'),
		sql: 'ALTER INDEX "users_email_idx" RENAME TO "users_contact_idx";',
		delta: { op: 'rename', key: 'indexes\0["public","users_email_idx"]', set: { name: 'users_contact_idx' } },
	},
	'primary key': {
		before: withConstraints({}),
		after: withConstraints({ pk: 'users_key' }),
		hint: rename('primary_key', 'public.users.users_pk', 'public.users.users_key'),
		sql: 'ALTER TABLE "users" RENAME CONSTRAINT "users_pk" TO "users_key";',
		delta: { op: 'rename', key: 'pks\0["public","users","users_pk"]', set: { name: 'users_key' } },
	},
	'unique constraint': {
		before: withConstraints({}),
		after: withConstraints({ unique: 'users_contact_unique' }),
		hint: rename('unique', 'public.users.users_email_unique', 'public.users.users_contact_unique'),
		sql: 'ALTER TABLE "users" RENAME CONSTRAINT "users_email_unique" TO "users_contact_unique";',
		delta: {
			op: 'rename',
			key: 'uniques\0["public","users","users_email_unique"]',
			set: { name: 'users_contact_unique' },
		},
	},
	'foreign key': {
		before: withConstraints({}),
		after: withConstraints({ fk: 'posts_user_fk' }),
		hint: rename('foreign key', 'public.posts.posts_author_fk', 'public.posts.posts_user_fk'),
		sql: 'ALTER TABLE "posts" RENAME CONSTRAINT "posts_author_fk" TO "posts_user_fk";',
		delta: { op: 'rename', key: 'fks\0["public","posts","posts_author_fk"]', set: { name: 'posts_user_fk' } },
	},
	'check constraint': {
		before: withConstraints({}),
		after: withConstraints({ check: 'users_positive_id' }),
		hint: rename('check', 'public.users.users_id_check', 'public.users.users_positive_id'),
		sql: 'ALTER TABLE "users" RENAME CONSTRAINT "users_id_check" TO "users_positive_id";',
		delta: { op: 'rename', key: 'checks\0["public","users","users_id_check"]', set: { name: 'users_positive_id' } },
	},
	policy: {
		before: usersTable('users', 'email', pgRole('staff'), 'users_read'),
		after: usersTable('users', 'email', pgRole('staff'), 'users_select'),
		hint: rename('policy', 'public.users.users_read', 'public.users.users_select'),
		sql: 'ALTER POLICY "users_read" ON "users" RENAME TO "users_select";',
		delta: { op: 'rename', key: 'policies\0["public","users","users_read"]', set: { name: 'users_select' } },
	},
	view: {
		before: withView('users_view'),
		after: withView('people'),
		hint: rename('view', 'public.users_view', 'public.people'),
		sql: 'ALTER VIEW "users_view" RENAME TO "people";',
		delta: { op: 'rename', key: 'views\0["public","users_view"]', set: { name: 'people' } },
	},
};

// Each case expects one delta. The snapshot stores no delta for an entity that references the renamed
// entity, because reconstruct changes those entities through the edges.
describe('a rename is stored as one delta, and the reconstructed state and the database equal the schema', () => {
	for (const [name, { before, after, hint, sql, delta }] of Object.entries(scenarios)) {
		test(name, async () => {
			const flow = createFolderFlow();
			await flow.generate('main', before);

			const { folder } = await flow.generate('main', after, { hints: [hint] });

			expect(flow.sql('main', folder)).toBe(sql);
			expect(flow.deltas('main', folder)).toStrictEqual([delta]);
			expect(flow.state('main', folder)).toStrictEqual(schemaState(after));
			expect(await flow.tryGenerate('main', after)).toMatchObject({ status: 'no_changes' });
			expect(await flow.migrate('main', after)).toStrictEqual([]);
		});
	}
});
