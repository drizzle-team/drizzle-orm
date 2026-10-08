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
import { normalizeDDL } from 'src/dialects/ddl-canonical';
import type { Delta } from 'src/dialects/dialect';
import { describe, expect, test } from 'vitest';
import { createFolderFlow, schemaState } from './folder-flow';
import type { PostgresSchema } from './mocks';

// `sql` is the whole migration of the rename, and `rename` is the delta that the snapshot stores for it.
type Scenario = { before: PostgresSchema; after: PostgresSchema; hint: Hint; sql: string; rename: Delta };

// Every constraint has an explicit name, because a constraint with a generated name keeps the name that it
// had before the rename, and the schema then derives another name.
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
		hint: { type: 'rename', kind: 'schema', from: ['app'], to: ['core'] },
		sql: 'ALTER SCHEMA "app" RENAME TO "core";\n',
		rename: { op: 'rename', key: 'schemas\0["app"]', set: { name: 'core' } },
	},
	table: {
		before: usersTable('users', 'email'),
		after: usersTable('accounts', 'email'),
		hint: { type: 'rename', kind: 'table', from: ['public', 'users'], to: ['public', 'accounts'] },
		sql: 'ALTER TABLE "users" RENAME TO "accounts";',
		rename: { op: 'rename', key: 'tables\0["public","users"]', set: { name: 'accounts' } },
	},
	column: {
		before: usersTable('users', 'email'),
		after: usersTable('users', 'contact'),
		hint: { type: 'rename', kind: 'column', from: ['public', 'users', 'email'], to: ['public', 'users', 'contact'] },
		sql: 'ALTER TABLE "users" RENAME COLUMN "email" TO "contact";',
		rename: { op: 'rename', key: 'columns\0["public","users","email"]', set: { name: 'contact' } },
	},
	enum: {
		before: withEnum('mood'),
		after: withEnum('feeling'),
		hint: { type: 'rename', kind: 'enum', from: ['public', 'mood'], to: ['public', 'feeling'] },
		sql: 'ALTER TYPE "mood" RENAME TO "feeling";',
		rename: { op: 'rename', key: 'enums\0["public","mood"]', set: { name: 'feeling' } },
	},
	sequence: {
		before: { counter: pgSequence('counter') },
		after: { counter: pgSequence('ticket') },
		hint: { type: 'rename', kind: 'sequence', from: ['public', 'counter'], to: ['public', 'ticket'] },
		sql: 'ALTER SEQUENCE "counter" RENAME TO "ticket";',
		rename: { op: 'rename', key: 'sequences\0["public","counter"]', set: { name: 'ticket' } },
	},
	role: {
		before: usersTable('users', 'email', pgRole('staff')),
		after: usersTable('users', 'email', pgRole('team')),
		hint: { type: 'rename', kind: 'role', from: ['staff'], to: ['team'] },
		sql: 'ALTER ROLE "staff" RENAME TO "team";',
		rename: { op: 'rename', key: 'roles\0["staff"]', set: { name: 'team' } },
	},
	index: {
		before: withConstraints({}),
		after: withConstraints({ index: 'users_contact_idx' }),
		hint: {
			type: 'rename',
			kind: 'index',
			from: ['public', 'users', 'users_email_idx'],
			to: ['public', 'users', 'users_contact_idx'],
		},
		sql: 'ALTER INDEX "users_email_idx" RENAME TO "users_contact_idx";',
		rename: { op: 'rename', key: 'indexes\0["public","users_email_idx"]', set: { name: 'users_contact_idx' } },
	},
	'primary key': {
		before: withConstraints({}),
		after: withConstraints({ pk: 'users_key' }),
		hint: {
			type: 'rename',
			kind: 'primary_key',
			from: ['public', 'users', 'users_pk'],
			to: ['public', 'users', 'users_key'],
		},
		sql: 'ALTER TABLE "users" RENAME CONSTRAINT "users_pk" TO "users_key";',
		rename: { op: 'rename', key: 'pks\0["public","users","users_pk"]', set: { name: 'users_key' } },
	},
	'unique constraint': {
		before: withConstraints({}),
		after: withConstraints({ unique: 'users_contact_unique' }),
		hint: {
			type: 'rename',
			kind: 'unique',
			from: ['public', 'users', 'users_email_unique'],
			to: ['public', 'users', 'users_contact_unique'],
		},
		sql: 'ALTER TABLE "users" RENAME CONSTRAINT "users_email_unique" TO "users_contact_unique";',
		rename: {
			op: 'rename',
			key: 'uniques\0["public","users","users_email_unique"]',
			set: { name: 'users_contact_unique' },
		},
	},
	'foreign key': {
		before: withConstraints({}),
		after: withConstraints({ fk: 'posts_user_fk' }),
		hint: {
			type: 'rename',
			kind: 'foreign key',
			from: ['public', 'posts', 'posts_author_fk'],
			to: ['public', 'posts', 'posts_user_fk'],
		},
		sql: 'ALTER TABLE "posts" RENAME CONSTRAINT "posts_author_fk" TO "posts_user_fk";',
		rename: { op: 'rename', key: 'fks\0["public","posts","posts_author_fk"]', set: { name: 'posts_user_fk' } },
	},
	'check constraint': {
		before: withConstraints({}),
		after: withConstraints({ check: 'users_positive_id' }),
		hint: {
			type: 'rename',
			kind: 'check',
			from: ['public', 'users', 'users_id_check'],
			to: ['public', 'users', 'users_positive_id'],
		},
		sql: 'ALTER TABLE "users" RENAME CONSTRAINT "users_id_check" TO "users_positive_id";',
		rename: { op: 'rename', key: 'checks\0["public","users","users_id_check"]', set: { name: 'users_positive_id' } },
	},
	policy: {
		before: usersTable('users', 'email', pgRole('staff'), 'users_read'),
		after: usersTable('users', 'email', pgRole('staff'), 'users_select'),
		hint: {
			type: 'rename',
			kind: 'policy',
			from: ['public', 'users', 'users_read'],
			to: ['public', 'users', 'users_select'],
		},
		sql: 'ALTER POLICY "users_read" ON "users" RENAME TO "users_select";',
		rename: { op: 'rename', key: 'policies\0["public","users","users_read"]', set: { name: 'users_select' } },
	},
	view: {
		before: withView('users_view'),
		after: withView('people'),
		hint: { type: 'rename', kind: 'view', from: ['public', 'users_view'], to: ['public', 'people'] },
		sql: 'ALTER VIEW "users_view" RENAME TO "people";',
		rename: { op: 'rename', key: 'views\0["public","users_view"]', set: { name: 'people' } },
	},
};

// The snapshot stores no delta for an entity that references the renamed entity. Reconstruct changes these
// entities through the edges.
describe('a rename is stored as one delta, and the reconstructed state and the database equal the schema', () => {
	for (const [name, { before, after, hint, sql, rename }] of Object.entries(scenarios)) {
		test(name, async () => {
			const flow = createFolderFlow();
			await flow.generate('main', before);

			const { folder } = await flow.generate('main', after, { hints: [hint] });

			expect(flow.sql('main', folder!)).toBe(sql);
			expect(flow.deltas('main', folder!)).toStrictEqual([rename]);
			expect(flow.state('main', folder!)).toStrictEqual(schemaState(after));
			expect(await flow.generate('main', after)).toMatchObject({ status: 'no_changes' });
			expect(await flow.migrate('main', after)).toStrictEqual([]);
		});
	}
});

// Each branch renames one column of the primary key. The first parent is the leaf with the newest folder name,
// so the branch that generates last is the first parent.
describe('two branches that each rename one column of one primary key', () => {
	const table = (first: string, second: string) => ({
		items: pgTable('items', { [first]: integer().notNull(), [second]: integer().notNull() }, (t) => [
			primaryKey({ name: 'items_pk', columns: [t[first], t[second]] }),
		]),
	});
	const renameOf = (from: string, to: string): Hint => ({
		type: 'rename',
		kind: 'column',
		from: ['public', 'items', from],
		to: ['public', 'items', to],
	});
	const branches = {
		a: { schema: table('y', 'z'), hint: renameOf('x', 'y') },
		b: { schema: table('x', 'w'), hint: renameOf('z', 'w') },
	};
	const merged = table('y', 'w');

	for (const [older, newer] of [['a', 'b'], ['b', 'a']] as const) {
		test(`the combined state lists both new names when branch ${newer} is the first parent`, async () => {
			const flow = createFolderFlow();
			await flow.generate('main', table('x', 'z'));
			flow.branch('a', 'main');
			flow.branch('b', 'main');
			await flow.generate(older, branches[older].schema, { hints: [branches[older].hint] });
			const first = await flow.generate(newer, branches[newer].schema, { hints: [branches[newer].hint] });
			flow.merge('main', 'a', 'b');

			expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
			expect(flow.leaves('main').at(-1)).toBe(first.folder);
			const combined = await flow.stateBeforeGenerate('main', merged);
			expect(normalizeDDL(combined.entities.list())).toStrictEqual(schemaState(merged));
			expect(await flow.generate('main', merged)).toMatchObject({ status: 'no_changes' });
			expect(await flow.migrate('main', merged)).toStrictEqual([]);
		});
	}
});
