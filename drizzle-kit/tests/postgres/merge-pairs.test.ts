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
} from 'drizzle-orm/pg-core';
import type { Hint, RenameCreateHintKind } from 'src/cli/hints';
import { expect, test } from 'vitest';
import { createFolderFlow } from './folder-flow';
import type { PostgresSchema } from './mocks';

// Every row is a base schema and two or more branches. A branch is a list of migrations, and each
// migration is the schema after it with the rename decisions that generate needs.
//
// A row with `merged` holds branches whose SQL runs in either order. `merged` is the schema that the
// branches give together. A row without `merged` holds branches whose SQL does not run in either order.
//
// To add a case, add a row. The tests below run every row with each branch as the first parent of the merge.
type Step = { schema: PostgresSchema; hints: Hint[] };
type Row = { name: string; base: PostgresSchema; branches: Step[][]; merged?: PostgresSchema };

const step = (schema: PostgresSchema, ...hints: Hint[]): Step => ({ schema, hints });

// `from` and `to` are the names of the entity with a dot between them, for example `public.users.email`.
const rename = (kind: RenameCreateHintKind, from: string, to: string) =>
	({ type: 'rename', kind, from: from.split('.'), to: to.split('.') }) as unknown as Hint;

type Namespace = ReturnType<typeof pgSchema>;
type Extra = (t: any) => any[];

// Every column is an integer. A name that ends with `!` is NOT NULL.
const columns = (names: string[]) =>
	Object.fromEntries(names.map((it) => {
		const name = it.replace('!', '');
		return [name, it.endsWith('!') ? integer(name).notNull() : integer(name)];
	}));

const table = (name: string, names: string[], extra?: Extra, schema?: Namespace) =>
	schema ? schema.table(name, columns(names), extra) : pgTable(name, columns(names), extra);

const all = (...extras: Extra[]): Extra => (t) => extras.flatMap((it) => it(t));
const withIndex = (name: string, column: string): Extra => (t) => [index(name).on(t[column])];
const withPrimaryKey = (name: string, ...names: string[]): Extra => (t) => [
	primaryKey({ name, columns: names.map((it) => t[it]) as any }),
];
const withUnique = (name: string, column: string): Extra => (t) => [unique(name).on(t[column])];
const withCheck = (name: string, column: string): Extra => (t) => [check(name, sql`${t[column]} > 0`)];
const policy = (name: string, using = sql`true`): Extra => () => [
	pgPolicy(name, { for: 'select', to: 'public', using }),
];

const app = pgSchema('app');
const core = pgSchema('core');

const users = table('users', ['id']);
const accounts = table('accounts', ['id']);
const posts = table('posts', ['id', 'title']);
const usersToAccounts = rename('table', 'public.users', 'public.accounts');
const usersToApp = rename('table', 'public.users', 'app.users');
const appToCore = rename('schema', 'app', 'core');

// One table `t`. Most rows change only this table.
const tableT = (names: string[], extra?: Extra) => ({ t: table('t', names, extra) });
const emailToContact = rename('column', 'public.t.email', 'public.t.contact');

const mood = pgEnum('mood', ['ok', 'sad']);
const feeling = pgEnum('feeling', ['ok', 'sad']);
const appMood = app.enum('mood', ['ok', 'sad']);
const appFeeling = app.enum('feeling', ['ok', 'sad']);
const moodToFeeling = rename('enum', 'public.mood', 'public.feeling');
// The enum and a table `t` with a column of that enum type.
const withEnum = (type: typeof mood, column: string, more: string[] = []) => ({
	[type.enumName]: type,
	t: pgTable('t', { id: integer(), state: type(column), ...columns(more) }),
});

const sequence = (name: string, increment = 1, schema?: Namespace) =>
	schema ? schema.sequence(name, { increment }) : pgSequence(name, { increment });
const counter = sequence('counter');
const ticker = sequence('ticker');
const counterToTicker = rename('sequence', 'public.counter', 'public.ticker');

// A view over the table `posts`.
const titles = (name: string, schema?: Namespace) =>
	(schema ? schema.view(name, { title: integer() }) : pgView(name, { title: integer() }))
		.as(sql`select title from posts`);

// The roles and a table `t` with one policy for all of them.
const withRoles = (roleNames: string[], names: string[]) => {
	const roles = roleNames.map((it) => pgRole(it));
	return {
		...Object.fromEntries(roles.map((it) => [it.name, it])),
		t: table('t', names, () => [pgPolicy('t_read', { for: 'select', to: roles })]),
	};
};

// A parent table with a primary key, and a child table with a foreign key to that key. Without `fk`,
// the child has no foreign key.
const family = (
	names: {
		parent?: string;
		key?: string;
		other?: string;
		column?: string;
		note?: string;
		fk?: string | null;
		schema?: Namespace;
	} = {},
) => {
	const { parent = 'parent', key = 'id', other = 'name', column = 'parentId', note = 'note' } = names;
	const fk = names.fk === undefined ? 'child_parent_fk' : names.fk;
	const parentTable = table(parent, [`${key}!`, other], withPrimaryKey('parent_pk', key), names.schema);
	const child = table(
		'child',
		[column, note],
		(t) => fk ? [foreignKey({ name: fk, columns: [t[column]], foreignColumns: [(parentTable as any)[key]] })] : [],
	);
	return { parent: parentTable, child };
};
const parentIdToOwnerId = rename('column', 'public.child.parentId', 'public.child.ownerId');

// A table with a primary key over three columns, and a foreign key that references that key.
const keyed = (first: string, second: string, third: string) => {
	const parent = table(
		'parent',
		[`${first}!`, `${second}!`, `${third}!`],
		withPrimaryKey('parent_pk', first, second, third),
	);
	const child = table('child', ['a', 'b', 'c'], (t) => [
		foreignKey({
			name: 'child_parent_fk',
			columns: [t.a, t.b, t.c],
			foreignColumns: [first, second, third].map((it) => (parent as any)[it]) as any,
		}),
	]);
	return { parent, child };
};

const rows: Row[] = [
	// ---- tables ----
	{
		name: 'a table rename against a new column of another table',
		base: { users, posts },
		branches: [
			[step({ accounts, posts }, usersToAccounts)],
			[step({ users, posts: table('posts', ['id', 'title', 'body']) })],
		],
		merged: { accounts, posts: table('posts', ['id', 'title', 'body']) },
	},
	{
		name: 'two renames of two tables',
		base: { users, posts },
		branches: [
			[step({ accounts, posts }, usersToAccounts)],
			[step(
				{ users, articles: table('articles', ['id', 'title']) },
				rename('table', 'public.posts', 'public.articles'),
			)],
		],
		merged: { accounts, articles: table('articles', ['id', 'title']) },
	},
	{
		name: 'a table rename against a new index of another table',
		base: { users, posts },
		branches: [
			[step({ accounts, posts }, usersToAccounts)],
			[step({ users, posts: table('posts', ['id', 'title'], withIndex('posts_title_ix', 'title')) })],
		],
		merged: { accounts, posts: table('posts', ['id', 'title'], withIndex('posts_title_ix', 'title')) },
	},
	{
		name: 'a table move to another schema against a column rename of another table',
		base: { app, users, posts },
		branches: [
			[step({ app, users: table('users', ['id'], undefined, app), posts }, usersToApp)],
			[step(
				{ app, users, posts: table('posts', ['id', 'name']) },
				rename('column', 'public.posts.title', 'public.posts.name'),
			)],
		],
		merged: { app, users: table('users', ['id'], undefined, app), posts: table('posts', ['id', 'name']) },
	},
	{
		name: 'a table rename against a drop of another table',
		base: { users, posts },
		branches: [
			[step({ accounts, posts }, usersToAccounts)],
			[step({ users })],
		],
		merged: { accounts },
	},
	{
		name: 'a table rename against a new column of that table',
		base: { users, posts },
		branches: [
			[step({ accounts, posts }, usersToAccounts)],
			[step({ users: table('users', ['id', 'email']), posts })],
		],
	},
	{
		name: 'a table rename against a new table with the new name',
		base: { users },
		branches: [
			[step({ accounts }, usersToAccounts)],
			[step({ users, accounts })],
		],
	},
	{
		name: 'a table move to another schema against a new column of that table',
		base: { app, users },
		branches: [
			[step({ app, users: table('users', ['id'], undefined, app) }, usersToApp)],
			[step({ app, users: table('users', ['id', 'email']) })],
		],
	},

	// ---- columns ----
	{
		name: 'two renames of two columns of one key that a foreign key references',
		base: keyed('x', 'z', 'c'),
		branches: [
			[step(keyed('y', 'z', 'c'), rename('column', 'public.parent.x', 'public.parent.y'))],
			[step(keyed('x', 'w', 'c'), rename('column', 'public.parent.z', 'public.parent.w'))],
		],
		merged: keyed('y', 'w', 'c'),
	},
	{
		name: 'three branches that each rename one column of one key',
		base: keyed('x', 'z', 'c'),
		branches: [
			[step(keyed('y', 'z', 'c'), rename('column', 'public.parent.x', 'public.parent.y'))],
			[step(keyed('x', 'w', 'c'), rename('column', 'public.parent.z', 'public.parent.w'))],
			[step(keyed('x', 'z', 'd'), rename('column', 'public.parent.c', 'public.parent.d'))],
		],
		merged: keyed('y', 'w', 'd'),
	},
	{
		name: 'a column rename against a new column of the same table',
		base: tableT(['id', 'email']),
		branches: [
			[step(tableT(['id', 'contact']), emailToContact)],
			[step(tableT(['id', 'email', 'age']))],
		],
		merged: tableT(['id', 'contact', 'age']),
	},
	{
		name: 'a column rename against a drop of another column of the same table',
		base: tableT(['id', 'email', 'age']),
		branches: [
			[step(tableT(['id', 'contact', 'age']), emailToContact)],
			[step(tableT(['id', 'email']))],
		],
		merged: tableT(['id', 'contact']),
	},
	{
		name: 'a column rename against NOT NULL on another column of the same table',
		base: tableT(['id', 'email', 'age']),
		branches: [
			[step(tableT(['id', 'contact', 'age']), emailToContact)],
			[step(tableT(['id', 'email', 'age!']))],
		],
		merged: tableT(['id', 'contact', 'age!']),
	},
	{
		name: 'a chain of two renames of one column in one branch against a new column',
		base: tableT(['id', 'email']),
		branches: [
			[
				step(tableT(['id', 'contact']), emailToContact),
				step(tableT(['id', 'address']), rename('column', 'public.t.contact', 'public.t.address')),
			],
			[step(tableT(['id', 'email', 'age']))],
		],
		merged: tableT(['id', 'address', 'age']),
	},
	{
		name: 'a column rename and a rename back to the old name in one branch against a rename of another column',
		base: tableT(['id', 'email', 'age']),
		branches: [
			[
				step(tableT(['id', 'contact', 'age']), emailToContact),
				step(tableT(['id', 'email', 'age']), rename('column', 'public.t.contact', 'public.t.email')),
			],
			[step(tableT(['id', 'email', 'years']), rename('column', 'public.t.age', 'public.t.years'))],
		],
		merged: tableT(['id', 'email', 'years']),
	},
	{
		name: 'a column rename with NOT NULL on another column against a default on that other column',
		base: { t: pgTable('t', { email: integer(), age: integer() }) },
		branches: [
			[step({ t: pgTable('t', { contact: integer(), age: integer().notNull() }) }, emailToContact)],
			[step({ t: pgTable('t', { email: integer(), age: integer().default(0) }) })],
		],
		merged: { t: pgTable('t', { contact: integer(), age: integer().notNull().default(0) }) },
	},
	{
		name: 'NOT NULL on one column in both branches, with a column rename in one branch',
		base: tableT(['id', 'email', 'age']),
		branches: [
			[step(tableT(['id', 'contact', 'age!']), emailToContact)],
			[step(tableT(['id', 'email', 'age!']))],
		],
		merged: tableT(['id', 'contact', 'age!']),
	},
	{
		name: 'two different defaults for one column, with a column rename in one branch',
		base: { t: pgTable('t', { email: integer(), age: integer() }) },
		branches: [
			[step({ t: pgTable('t', { contact: integer(), age: integer().default(1) }) }, emailToContact)],
			[step({ t: pgTable('t', { email: integer(), age: integer().default(2) }) })],
		],
	},
	{
		name: 'the same new column in both branches, with a column rename in one branch',
		base: tableT(['id', 'email']),
		branches: [
			[step(tableT(['id', 'contact', 'age']), emailToContact)],
			[step(tableT(['id', 'email', 'age']))],
		],
	},
	{
		name: 'a column rename against NOT NULL on that column',
		base: tableT(['id', 'email']),
		branches: [
			[step(tableT(['id', 'contact']), emailToContact)],
			[step(tableT(['id', 'email!']))],
		],
	},
	{
		name: 'a column rename against a new column with the new name',
		base: tableT(['id', 'email']),
		branches: [
			[step(tableT(['id', 'contact']), emailToContact)],
			[step(tableT(['id', 'email', 'contact']))],
		],
	},

	// ---- schemas ----
	{
		name: 'a schema rename against a new table in the default schema',
		base: { app, things: table('things', ['id'], undefined, app) },
		branches: [
			[step({ core, things: table('things', ['id'], undefined, core) }, appToCore)],
			[step({ app, things: table('things', ['id'], undefined, app), posts })],
		],
		merged: { core, things: table('things', ['id'], undefined, core), posts },
	},
	{
		name: 'a schema rename against a table rename in the default schema',
		base: { app, things: table('things', ['id'], undefined, app), users },
		branches: [
			[step({ core, things: table('things', ['id'], undefined, core), users }, appToCore)],
			[step({ app, things: table('things', ['id'], undefined, app), accounts }, usersToAccounts)],
		],
		merged: { core, things: table('things', ['id'], undefined, core), accounts },
	},
	{
		name: 'a schema rename against a new enum in the default schema',
		base: { app, things: table('things', ['id'], undefined, app) },
		branches: [
			[step({ core, things: table('things', ['id'], undefined, core) }, appToCore)],
			[step({ app, things: table('things', ['id'], undefined, app), mood })],
		],
		merged: { core, things: table('things', ['id'], undefined, core), mood },
	},
	{
		name: 'a new schema with a table move into it against a column rename of another table',
		base: { users, posts },
		branches: [
			[step({ app, users: table('users', ['id'], undefined, app), posts }, usersToApp)],
			[step(
				{ users, posts: table('posts', ['id', 'name']) },
				rename('column', 'public.posts.title', 'public.posts.name'),
			)],
		],
		merged: { app, users: table('users', ['id'], undefined, app), posts: table('posts', ['id', 'name']) },
	},
	{
		name: 'a schema rename against a new column of a table in that schema',
		base: { app, things: table('things', ['id'], undefined, app) },
		branches: [
			[step({ core, things: table('things', ['id'], undefined, core) }, appToCore)],
			[step({ app, things: table('things', ['id', 'name'], undefined, app) })],
		],
	},

	// ---- enums ----
	{
		name: 'an enum rename against a rename of a column of that enum type',
		base: withEnum(mood, 'state'),
		branches: [
			[step(withEnum(feeling, 'state'), moodToFeeling)],
			[step(withEnum(mood, 'status'), rename('column', 'public.t.state', 'public.t.status'))],
		],
		merged: withEnum(feeling, 'status'),
	},
	{
		name: 'an enum rename against a new value of another enum',
		base: { mood, size: pgEnum('size', ['s', 'm']) },
		branches: [
			[step({ feeling, size: pgEnum('size', ['s', 'm']) }, moodToFeeling)],
			[step({ mood, size: pgEnum('size', ['s', 'm', 'l']) })],
		],
		merged: { feeling, size: pgEnum('size', ['s', 'm', 'l']) },
	},
	{
		name: 'a rename of an enum in another schema against a rename of a column of that enum type',
		base: { app, ...withEnum(appMood, 'state') },
		branches: [
			[step({ app, ...withEnum(appFeeling, 'state') }, rename('enum', 'app.mood', 'app.feeling'))],
			[step({ app, ...withEnum(appMood, 'status') }, rename('column', 'public.t.state', 'public.t.status'))],
		],
		merged: { app, ...withEnum(appFeeling, 'status') },
	},
	{
		name: 'an enum move to another schema against a rename of a column of that enum type',
		base: { app, ...withEnum(mood, 'state') },
		branches: [
			[step({ app, ...withEnum(appMood, 'state') }, rename('enum', 'public.mood', 'app.mood'))],
			[step({ app, ...withEnum(mood, 'status') }, rename('column', 'public.t.state', 'public.t.status'))],
		],
		merged: { app, ...withEnum(appMood, 'status') },
	},
	{
		name: 'an enum rename against a new integer column in a table with a column of that enum type',
		base: withEnum(mood, 'state'),
		branches: [
			[step(withEnum(feeling, 'state'), moodToFeeling)],
			[step(withEnum(mood, 'state', ['age']))],
		],
		merged: withEnum(feeling, 'state', ['age']),
	},
	{
		name: 'an enum rename against a new value of that enum',
		base: { mood },
		branches: [
			[step({ feeling }, moodToFeeling)],
			[step({ mood: pgEnum('mood', ['ok', 'sad', 'glad']) })],
		],
	},
	{
		name: 'an enum rename against a new column of that enum type',
		base: { mood, t: pgTable('t', { id: integer() }) },
		branches: [
			[step({ feeling, t: pgTable('t', { id: integer() }) }, moodToFeeling)],
			[step(withEnum(mood, 'state'))],
		],
	},

	// ---- sequences ----
	{
		name: 'a sequence rename against a table rename',
		base: { counter, users },
		branches: [
			[step({ ticker, users }, counterToTicker)],
			[step({ counter, accounts }, usersToAccounts)],
		],
		merged: { ticker, accounts },
	},
	{
		name: 'a sequence move to another schema against a change of another sequence',
		base: { app, counter, steps: sequence('steps') },
		branches: [
			[step(
				{ app, counter: sequence('counter', 1, app), steps: sequence('steps') },
				rename('sequence', 'public.counter', 'app.counter'),
			)],
			[step({ app, counter, steps: sequence('steps', 2) })],
		],
		merged: { app, counter: sequence('counter', 1, app), steps: sequence('steps', 2) },
	},
	{
		name: 'a sequence rename against a new sequence',
		base: { counter },
		branches: [
			[step({ ticker }, counterToTicker)],
			[step({ counter, steps: sequence('steps') })],
		],
		merged: { ticker, steps: sequence('steps') },
	},
	{
		name: 'a sequence rename against a change of that sequence',
		base: { counter },
		branches: [
			[step({ ticker }, counterToTicker)],
			[step({ counter: sequence('counter', 2) })],
		],
	},

	// ---- views ----
	{
		name: 'a view rename against a new column of another table',
		base: { users, posts, titles: titles('titles') },
		branches: [
			[step({ users, posts, titles: titles('headings') }, rename('view', 'public.titles', 'public.headings'))],
			[step({ users: table('users', ['id', 'email']), posts, titles: titles('titles') })],
		],
		merged: { users: table('users', ['id', 'email']), posts, titles: titles('headings') },
	},
	{
		name: 'a view move to another schema against a table rename',
		base: { app, users, posts, titles: titles('titles') },
		branches: [
			[step({ app, users, posts, titles: titles('titles', app) }, rename('view', 'public.titles', 'app.titles'))],
			[step({ app, accounts, posts, titles: titles('titles') }, usersToAccounts)],
		],
		merged: { app, accounts, posts, titles: titles('titles', app) },
	},
	{
		name: 'a table rename against a new view over another table',
		base: { users, posts },
		branches: [
			[step({ accounts, posts }, usersToAccounts)],
			[step({ users, posts, titles: titles('titles') })],
		],
		merged: { accounts, posts, titles: titles('titles') },
	},
	{
		name: 'a view rename against a new view with the new name',
		base: { posts, titles: titles('titles') },
		branches: [
			[step({ posts, titles: titles('headings') }, rename('view', 'public.titles', 'public.headings'))],
			[step({ posts, titles: titles('titles'), headings: titles('headings') })],
		],
	},

	// ---- indexes ----
	{
		name: 'an index rename against a rename of a column of that index',
		base: tableT(['id', 'email'], withIndex('t_email_ix', 'email')),
		branches: [
			[step(
				tableT(['id', 'email'], withIndex('t_contact_ix', 'email')),
				rename('index', 'public.t.t_email_ix', 'public.t.t_contact_ix'),
			)],
			[step(tableT(['id', 'contact'], withIndex('t_email_ix', 'contact')), emailToContact)],
		],
		merged: tableT(['id', 'contact'], withIndex('t_contact_ix', 'contact')),
	},
	{
		name: 'an index rename against a new index on the same table',
		base: tableT(['id', 'email'], withIndex('t_email_ix', 'email')),
		branches: [
			[step(
				tableT(['id', 'email'], withIndex('t_contact_ix', 'email')),
				rename('index', 'public.t.t_email_ix', 'public.t.t_contact_ix'),
			)],
			[step(tableT(['id', 'email'], all(withIndex('t_email_ix', 'email'), withIndex('t_id_ix', 'id'))))],
		],
		merged: tableT(['id', 'email'], all(withIndex('t_contact_ix', 'email'), withIndex('t_id_ix', 'id'))),
	},
	{
		name: 'an index rename against a drop of a column outside that index',
		base: tableT(['id', 'email', 'age'], withIndex('t_email_ix', 'email')),
		branches: [
			[step(
				tableT(['id', 'email', 'age'], withIndex('t_contact_ix', 'email')),
				rename('index', 'public.t.t_email_ix', 'public.t.t_contact_ix'),
			)],
			[step(tableT(['id', 'email'], withIndex('t_email_ix', 'email')))],
		],
		merged: tableT(['id', 'email'], withIndex('t_contact_ix', 'email')),
	},
	{
		name: 'a column rename against a new index on another column of the same table',
		base: tableT(['id', 'email']),
		branches: [
			[step(tableT(['id', 'contact']), emailToContact)],
			[step(tableT(['id', 'email'], withIndex('t_id_ix', 'id')))],
		],
		merged: tableT(['id', 'contact'], withIndex('t_id_ix', 'id')),
	},
	{
		name: 'a column rename against a drop of an index on another column of the same table',
		base: tableT(['id', 'email'], withIndex('t_id_ix', 'id')),
		branches: [
			[step(tableT(['id', 'contact'], withIndex('t_id_ix', 'id')), emailToContact)],
			[step(tableT(['id', 'email']))],
		],
		merged: tableT(['id', 'contact']),
	},
	{
		name: 'a column rename against a new index on that column',
		base: tableT(['id', 'email']),
		branches: [
			[step(tableT(['id', 'contact']), emailToContact)],
			[step(tableT(['id', 'email'], withIndex('t_email_ix', 'email')))],
		],
	},

	{
		name: 'a table rename against a drop of an index of that table',
		base: { users: table('users', ['id', 'email'], withIndex('users_email_ix', 'email')) },
		branches: [
			[step({ accounts: table('accounts', ['id', 'email'], withIndex('users_email_ix', 'email')) }, usersToAccounts)],
			[step({ users: table('users', ['id', 'email']) })],
		],
		merged: { accounts: table('accounts', ['id', 'email']) },
	},
	{
		name: 'a table rename against a rename of an index of that table',
		base: { users: table('users', ['id', 'email'], withIndex('users_email_ix', 'email')) },
		branches: [
			[step({ accounts: table('accounts', ['id', 'email'], withIndex('users_email_ix', 'email')) }, usersToAccounts)],
			[step(
				{ users: table('users', ['id', 'email'], withIndex('users_contact_ix', 'email')) },
				rename('index', 'public.users.users_email_ix', 'public.users.users_contact_ix'),
			)],
		],
		merged: { accounts: table('accounts', ['id', 'email'], withIndex('users_contact_ix', 'email')) },
	},
	{
		name: 'a table move to another schema against a drop of an index of that table',
		base: { app, users: table('users', ['id', 'email'], withIndex('users_email_ix', 'email')) },
		branches: [
			[step({ app, users: table('users', ['id', 'email'], withIndex('users_email_ix', 'email'), app) }, usersToApp)],
			[step({ app, users: table('users', ['id', 'email']) })],
		],
	},
	{
		name: 'a table move to another schema against a rename of an index of that table',
		base: { app, users: table('users', ['id', 'email'], withIndex('users_email_ix', 'email')) },
		branches: [
			[step({ app, users: table('users', ['id', 'email'], withIndex('users_email_ix', 'email'), app) }, usersToApp)],
			[step(
				{ app, users: table('users', ['id', 'email'], withIndex('users_contact_ix', 'email')) },
				rename('index', 'public.users.users_email_ix', 'public.users.users_contact_ix'),
			)],
		],
	},

	// ---- primary keys ----
	{
		name: 'a primary key rename against a rename of a column of that key',
		base: tableT(['x!', 'z!'], withPrimaryKey('t_pk', 'x', 'z')),
		branches: [
			[step(
				tableT(['x!', 'z!'], withPrimaryKey('t_key', 'x', 'z')),
				rename('primary_key', 'public.t.t_pk', 'public.t.t_key'),
			)],
			[step(tableT(['y!', 'z!'], withPrimaryKey('t_pk', 'y', 'z')), rename('column', 'public.t.x', 'public.t.y'))],
		],
		merged: tableT(['y!', 'z!'], withPrimaryKey('t_key', 'y', 'z')),
	},
	{
		name: 'a primary key rename against a new column',
		base: tableT(['id!', 'email'], withPrimaryKey('t_pk', 'id')),
		branches: [
			[step(
				tableT(['id!', 'email'], withPrimaryKey('t_key', 'id')),
				rename('primary_key', 'public.t.t_pk', 'public.t.t_key'),
			)],
			[step(tableT(['id!', 'email', 'age'], withPrimaryKey('t_pk', 'id')))],
		],
		merged: tableT(['id!', 'email', 'age'], withPrimaryKey('t_key', 'id')),
	},
	{
		name: 'a column rename against a new primary key on another column of the same table',
		base: tableT(['id!', 'email']),
		branches: [
			[step(tableT(['id!', 'contact']), emailToContact)],
			[step(tableT(['id!', 'email'], withPrimaryKey('t_pk', 'id')))],
		],
		merged: tableT(['id!', 'contact'], withPrimaryKey('t_pk', 'id')),
	},

	// ---- unique constraints ----
	{
		name: 'a unique constraint rename against a rename of the column of that constraint',
		base: tableT(['id', 'email'], withUnique('t_email_uq', 'email')),
		branches: [
			[step(
				tableT(['id', 'email'], withUnique('t_contact_uq', 'email')),
				rename('unique', 'public.t.t_email_uq', 'public.t.t_contact_uq'),
			)],
			[step(tableT(['id', 'contact'], withUnique('t_email_uq', 'contact')), emailToContact)],
		],
		merged: tableT(['id', 'contact'], withUnique('t_contact_uq', 'contact')),
	},
	{
		name: 'a column rename against a new unique constraint on another column of the same table',
		base: tableT(['id', 'email']),
		branches: [
			[step(tableT(['id', 'contact']), emailToContact)],
			[step(tableT(['id', 'email'], withUnique('t_id_uq', 'id')))],
		],
		merged: tableT(['id', 'contact'], withUnique('t_id_uq', 'id')),
	},
	{
		name: 'a unique constraint rename against a new check constraint',
		base: tableT(['id', 'email'], withUnique('t_email_uq', 'email')),
		branches: [
			[step(
				tableT(['id', 'email'], withUnique('t_contact_uq', 'email')),
				rename('unique', 'public.t.t_email_uq', 'public.t.t_contact_uq'),
			)],
			[step(tableT(['id', 'email'], all(withUnique('t_email_uq', 'email'), withCheck('t_id_ck', 'id'))))],
		],
		merged: tableT(['id', 'email'], all(withUnique('t_contact_uq', 'email'), withCheck('t_id_ck', 'id'))),
	},

	// ---- check constraints ----
	{
		name: 'a check constraint rename against a new column',
		base: tableT(['id', 'age'], withCheck('t_age_ck', 'age')),
		branches: [
			[step(
				tableT(['id', 'age'], withCheck('t_adult_ck', 'age')),
				rename('check', 'public.t.t_age_ck', 'public.t.t_adult_ck'),
			)],
			[step(tableT(['id', 'age', 'email'], withCheck('t_age_ck', 'age')))],
		],
		merged: tableT(['id', 'age', 'email'], withCheck('t_adult_ck', 'age')),
	},
	{
		name: 'a column rename against a new check constraint on another column of the same table',
		base: tableT(['id', 'email', 'age']),
		branches: [
			[step(tableT(['id', 'contact', 'age']), emailToContact)],
			[step(tableT(['id', 'email', 'age'], withCheck('t_age_ck', 'age')))],
		],
		merged: tableT(['id', 'contact', 'age'], withCheck('t_age_ck', 'age')),
	},
	{
		name: 'a column rename against a new check constraint on that column',
		base: tableT(['id', 'email']),
		branches: [
			[step(tableT(['id', 'contact']), emailToContact)],
			[step(tableT(['id', 'email'], withCheck('t_email_ck', 'email')))],
		],
	},

	// ---- foreign keys ----
	{
		name: 'a foreign key rename against a rename of a parent column outside the key',
		base: family(),
		branches: [
			[step(
				family({ fk: 'child_owner_fk' }),
				rename('foreign key', 'public.child.child_parent_fk', 'public.child.child_owner_fk'),
			)],
			[step(family({ other: 'title' }), rename('column', 'public.parent.name', 'public.parent.title'))],
		],
		merged: family({ fk: 'child_owner_fk', other: 'title' }),
	},
	{
		name: 'a rename of the parent table of a foreign key against a rename of a child column outside the key',
		base: family(),
		branches: [
			[step(family({ parent: 'owner' }), rename('table', 'public.parent', 'public.owner'))],
			[step(family({ note: 'memo' }), rename('column', 'public.child.note', 'public.child.memo'))],
		],
		merged: family({ parent: 'owner', note: 'memo' }),
	},
	{
		name: 'a rename of a foreign key column against a rename of the column that the key references',
		base: family(),
		branches: [
			[step(family({ column: 'ownerId' }), parentIdToOwnerId)],
			[step(family({ key: 'key' }), rename('column', 'public.parent.id', 'public.parent.key'))],
		],
		merged: family({ column: 'ownerId', key: 'key' }),
	},
	{
		name: 'a rename of the schema of the parent table of a foreign key against a rename of the foreign key column',
		base: { app, ...family({ schema: app }) },
		branches: [
			[step({ core, ...family({ schema: core }) }, appToCore)],
			[step({ app, ...family({ schema: app, column: 'ownerId' }) }, parentIdToOwnerId)],
		],
		merged: { core, ...family({ schema: core, column: 'ownerId' }) },
	},
	{
		name:
			'a rename of a column that a foreign key references in another schema against a rename of the foreign key column',
		base: { app, ...family({ schema: app }) },
		branches: [
			[step({ app, ...family({ schema: app, key: 'key' }) }, rename('column', 'app.parent.id', 'app.parent.key'))],
			[step({ app, ...family({ schema: app, column: 'ownerId' }) }, parentIdToOwnerId)],
		],
		merged: { app, ...family({ schema: app, key: 'key', column: 'ownerId' }) },
	},
	{
		name: 'a rename of the parent table of a foreign key against a drop of that foreign key',
		base: family(),
		branches: [
			[step(family({ parent: 'owner' }), rename('table', 'public.parent', 'public.owner'))],
			[step(family({ fk: null }))],
		],
		merged: family({ parent: 'owner', fk: null }),
	},
	{
		name: 'a table rename against a new foreign key to that table',
		base: family({ fk: null }),
		branches: [
			[step(family({ parent: 'owner', fk: null }), rename('table', 'public.parent', 'public.owner'))],
			[step(family())],
		],
	},

	// ---- policies ----
	{
		name: 'a policy rename against a column rename of the table of that policy',
		base: tableT(['id', 'email'], policy('t_read')),
		branches: [
			[step(tableT(['id', 'email'], policy('t_view')), rename('policy', 'public.t.t_read', 'public.t.t_view'))],
			[step(tableT(['id', 'contact'], policy('t_read')), emailToContact)],
		],
		merged: tableT(['id', 'contact'], policy('t_view')),
	},
	{
		name: 'a policy rename against a new column',
		base: tableT(['id', 'email'], policy('t_read')),
		branches: [
			[step(tableT(['id', 'email'], policy('t_view')), rename('policy', 'public.t.t_read', 'public.t.t_view'))],
			[step(tableT(['id', 'email', 'age'], policy('t_read')))],
		],
		merged: tableT(['id', 'email', 'age'], policy('t_view')),
	},
	{
		name: 'a table rename against a new policy on another table',
		base: { users, posts },
		branches: [
			[step({ accounts, posts }, usersToAccounts)],
			[step({ users, posts: table('posts', ['id', 'title'], policy('posts_read')) })],
		],
		merged: { accounts, posts: table('posts', ['id', 'title'], policy('posts_read')) },
	},
	{
		name: 'a policy rename against a new policy on the same table',
		base: tableT(['id', 'email'], policy('t_read')),
		branches: [
			[step(tableT(['id', 'email'], policy('t_view')), rename('policy', 'public.t.t_read', 'public.t.t_view'))],
			[step(tableT(['id', 'email'], all(policy('t_read'), policy('t_list'))))],
		],
		merged: tableT(['id', 'email'], all(policy('t_view'), policy('t_list'))),
	},
	{
		name: 'a policy rename against a change of that policy',
		base: tableT(['id', 'email'], policy('t_read')),
		branches: [
			[step(tableT(['id', 'email'], policy('t_view')), rename('policy', 'public.t.t_read', 'public.t.t_view'))],
			[step(tableT(['id', 'email'], policy('t_read', sql`false`)))],
		],
	},
	{
		name: 'a table rename against a new policy on that table',
		base: { users, posts },
		branches: [
			[step({ accounts, posts }, usersToAccounts)],
			[step({ users: table('users', ['id'], policy('users_read')), posts })],
		],
	},

	// ---- roles ----
	{
		name: 'a role rename against a new column of a table with a policy for that role',
		base: withRoles(['staff'], ['id']),
		branches: [
			[step(withRoles(['team'], ['id']), rename('role', 'staff', 'team'))],
			[step(withRoles(['staff'], ['id', 'email']))],
		],
		merged: withRoles(['team'], ['id', 'email']),
	},
	{
		// Each new name sorts at another place of the role list than the old name.
		name: 'two renames of two roles of one policy',
		base: withRoles(['auditor', 'staff', 'viewer'], ['id']),
		branches: [
			[step(withRoles(['auditor', 'admin', 'viewer'], ['id']), rename('role', 'staff', 'admin'))],
			[step(withRoles(['zed', 'staff', 'viewer'], ['id']), rename('role', 'auditor', 'zed'))],
		],
		merged: withRoles(['zed', 'admin', 'viewer'], ['id']),
	},

	// ---- three branches ----
	{
		name: 'three branches: a schema rename, a table rename and an enum rename',
		base: { app, things: table('things', ['id'], undefined, app), users, mood },
		branches: [
			[step({ core, things: table('things', ['id'], undefined, core), users, mood }, appToCore)],
			[step({ app, things: table('things', ['id'], undefined, app), accounts, mood }, usersToAccounts)],
			[step({ app, things: table('things', ['id'], undefined, app), users, feeling }, moodToFeeling)],
		],
		merged: { core, things: table('things', ['id'], undefined, core), accounts, feeling },
	},
];

// The merge migration adds this table, so its SQL shows whether the combined state equals `merged`.
const marker = pgTable('merge_marker', { id: integer() });
const markerSql = 'CREATE TABLE "merge_marker" (\n\t"id" integer\n);\n';

// The branch that generates last has the newest folder, so it is the first parent of the merge.
const runs = (rows: Row[]) => rows.flatMap((it) => it.branches.map((_, first) => ({ ...it, first })));

const mergeBranches = async ({ base, branches, first }: Row & { first: number }) => {
	const flow = createFolderFlow();
	await flow.generate('main', base);
	const names = branches.map((_, idx) => `branch${idx}`);
	for (const name of names) flow.branch(name, 'main');
	const order = [...branches.keys()].filter((idx) => idx !== first).concat(first);
	for (const idx of order) {
		for (const { schema, hints } of branches[idx]) {
			expect(await flow.generate(names[idx], schema, { hints })).toMatchObject({ status: 'ok' });
		}
	}
	flow.merge('main', ...names);
	expect(flow.leaves('main').at(-1)).toMatch(new RegExp(`_branch${first}$`));
	return flow;
};

test.each(runs(rows.filter((it) => it.merged)))(
	'$name: the branches merge, with branch $first as the first parent',
	async (row) => {
		const flow = await mergeBranches(row);
		const merged = { ...row.merged, marker };

		expect(await flow.check('main')).toStrictEqual({ status: 'passed' });
		const { status, folder } = await flow.generate('main', merged);
		expect(status).toBe('ok');
		expect(flow.sql('main', folder!)).toBe(markerSql);
		expect(flow.snapshot('main', folder!).prevIds).toHaveLength(row.branches.length);
		expect(await flow.migrate('main', merged)).toStrictEqual([]);
	},
);

test.each(runs(rows.filter((it) => !it.merged)))(
	'$name: check reports a conflict, with branch $first as the first parent',
	async (row) => {
		const flow = await mergeBranches(row);

		expect(await flow.check('main')).toMatchObject({ status: 'conflicts' });
	},
);
