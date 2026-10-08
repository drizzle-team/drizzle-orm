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
	serial,
	text,
	unique,
	uniqueIndex,
	varchar,
} from 'drizzle-orm/pg-core';
import { toSnapshotStatements } from 'src/dialects/postgres/convertor';
import type { PostgresDDL } from 'src/dialects/postgres/ddl';
import { isSnapshotStatement } from 'src/dialects/postgres/snapshot';
import { type SnapshotStatement, snapshotStatementSchemas } from 'src/dialects/postgres/snapshot-statements';
import { describe, expect, test } from 'vitest';
import { diff, drizzleToDDL, type PostgresSchema } from './mocks';

// Each case is a real diff that writes statements of the named kinds. A side is a function when it
// holds entities that a drizzle schema cannot declare. The diff changes its states, so each run
// builds a new state.
type Side = PostgresSchema | (() => PostgresDDL);
type Case = { kinds: string[]; from: Side; to: Side; renames?: string[] };

const archive = pgSchema('archive');
const users = pgTable('users', { id: integer(), email: varchar() });

// The table `users` with other indexes and constraints, and a table that references it.
const constrained = (extra: (t: any) => any[]) => {
	const table = pgTable('users', { id: integer().notNull(), email: varchar().notNull() }, extra);
	return { users: table, posts: pgTable('posts', { userId: integer(), userEmail: varchar() }) };
};
const referencing = (onDelete?: 'cascade') => {
	const table = pgTable('users', { id: integer().primaryKey(), email: varchar() });
	const posts = pgTable('posts', { userId: integer() }, (t) => [
		foreignKey({ name: 'posts_user_fk', columns: [t.userId], foreignColumns: [table.id] }).onDelete(
			onDelete ?? 'no action',
		),
	]);
	return { users: table, posts };
};
const unreferenced = {
	users: pgTable('users', { id: integer().primaryKey(), email: varchar() }),
	posts: pgTable('posts', { userId: integer() }),
};

const status = pgEnum('status', ['open', 'closed']);
const tickets = (type: ReturnType<typeof pgEnum>) => pgTable('tickets', { status: type().default('open') });
const counter = pgSequence('counter', { increment: 1 });
const emails = (name: string, checkOption: 'local' | 'cascaded', schema?: ReturnType<typeof pgSchema>) =>
	(schema ? schema.view(name, { email: varchar() }) : pgView(name, { email: varchar() }))
		.with({ checkOption })
		.as(sql`select email from users`);

const guarded = (name: string, command: 'select' | 'all' = 'select', using = sql`true`) => ({
	users: pgTable('users', { id: integer(), email: varchar() }, () => [
		pgPolicy(name, { for: command, to: 'public', using }),
	]),
});
// The table `users` with a privilege, or without one when `isGrantable` is not given.
const granted = (isGrantable?: boolean) => () => {
	const { ddl } = drizzleToDDL({ users });
	if (isGrantable !== undefined) {
		ddl.privileges.push({
			schema: 'public',
			table: 'users',
			grantor: 'postgres',
			grantee: 'app',
			type: 'SELECT',
			isGrantable,
		});
	}
	return ddl;
};

const cases: Case[] = [
	{ kinds: ['create_table'], from: {}, to: { users } },
	{ kinds: ['drop_table'], from: { users }, to: {} },
	{
		kinds: ['rename_table'],
		from: { users },
		to: { accounts: pgTable('accounts', { id: integer(), email: varchar() }) },
		renames: ['public.users->public.accounts'],
	},
	{
		kinds: ['move_table'],
		from: { archive, users },
		to: { archive, users: archive.table('users', { id: integer(), email: varchar() }) },
		renames: ['public.users->archive.users'],
	},
	{
		kinds: ['add_column', 'drop_column'],
		from: { users },
		to: { users: pgTable('users', { id: integer(), name: text() }) },
	},
	{
		kinds: ['rename_column'],
		from: { users },
		to: { users: pgTable('users', { id: integer(), contact: varchar() }) },
		renames: ['public.users.email->public.users.contact'],
	},
	{
		kinds: ['alter_column'],
		from: { users },
		to: { users: pgTable('users', { id: integer(), email: text().notNull().default('none') }) },
	},
	{
		kinds: ['recreate_column'],
		from: { users },
		to: { users: pgTable('users', { id: integer(), email: varchar().generatedAlwaysAs(sql`'x'`) }) },
	},
	{
		kinds: ['create_index'],
		from: constrained(() => []),
		to: constrained((t) => [index('users_email_ix').on(t.email)]),
	},
	{
		kinds: ['drop_index'],
		from: constrained((t) => [index('users_email_ix').on(t.email)]),
		to: constrained(() => []),
	},
	{
		kinds: ['rename_index'],
		from: constrained((t) => [index('users_email_ix').on(t.email)]),
		to: constrained((t) => [index('users_mail_ix').on(t.email)]),
		renames: ['public.users.users_email_ix->public.users.users_mail_ix'],
	},
	{
		kinds: ['recreate_index'],
		from: constrained((t) => [index('users_email_ix').on(t.email)]),
		to: constrained((t) => [uniqueIndex('users_email_ix').on(t.email, t.id)]),
	},
	{
		kinds: ['add_pk'],
		from: constrained(() => []),
		to: constrained((t) => [primaryKey({ name: 'users_pk', columns: [t.id] })]),
	},
	{
		kinds: ['drop_pk'],
		from: constrained((t) => [primaryKey({ name: 'users_pk', columns: [t.id] })]),
		to: constrained(() => []),
	},
	{
		kinds: ['alter_pk'],
		from: constrained((t) => [primaryKey({ name: 'users_pk', columns: [t.id] })]),
		to: constrained((t) => [primaryKey({ name: 'users_pk', columns: [t.id, t.email] })]),
	},
	{ kinds: ['create_fk'], from: unreferenced, to: referencing() },
	{ kinds: ['drop_fk'], from: referencing(), to: unreferenced },
	{ kinds: ['recreate_fk'], from: referencing(), to: referencing('cascade') },
	{
		kinds: ['add_unique'],
		from: constrained(() => []),
		to: constrained((t) => [unique('users_email_uq').on(t.email)]),
	},
	{
		kinds: ['drop_unique'],
		from: constrained((t) => [unique('users_email_uq').on(t.email)]),
		to: constrained(() => []),
	},
	{
		kinds: ['alter_unique'],
		from: constrained((t) => [unique('users_email_uq').on(t.email)]),
		to: constrained((t) => [unique('users_email_uq').on(t.email, t.id)]),
	},
	{
		kinds: ['rename_constraint'],
		from: constrained((t) => [unique('users_email_uq').on(t.email)]),
		to: constrained((t) => [unique('users_mail_uq').on(t.email)]),
		renames: ['public.users.users_email_uq->public.users.users_mail_uq'],
	},
	{
		kinds: ['add_check'],
		from: constrained(() => []),
		to: constrained((t) => [check('users_id_ck', sql`${t.id} > 0`)]),
	},
	{
		kinds: ['drop_check'],
		from: constrained((t) => [check('users_id_ck', sql`${t.id} > 0`)]),
		to: constrained(() => []),
	},
	{
		kinds: ['alter_check'],
		from: constrained((t) => [check('users_id_ck', sql`${t.id} > 0`)]),
		to: constrained((t) => [check('users_id_ck', sql`${t.id} > 1`)]),
	},
	{ kinds: ['create_schema'], from: {}, to: { archive } },
	{ kinds: ['drop_schema'], from: { archive }, to: {} },
	{ kinds: ['rename_schema'], from: { archive }, to: { vault: pgSchema('vault') }, renames: ['archive->vault'] },
	{ kinds: ['create_enum'], from: {}, to: { status } },
	{ kinds: ['drop_enum'], from: { status }, to: {} },
	{
		kinds: ['rename_enum'],
		from: { status },
		to: { state: pgEnum('state', ['open', 'closed']) },
		renames: ['public.status->public.state'],
	},
	{
		kinds: ['move_enum'],
		from: { archive, status },
		to: { archive, status: archive.enum('status', ['open', 'closed']) },
		renames: ['public.status->archive.status'],
	},
	{
		kinds: ['alter_enum'],
		from: { status },
		to: { status: pgEnum('status', ['open', 'pending', 'closed', 'lost']) },
	},
	{
		kinds: ['recreate_enum'],
		from: { status, tickets: tickets(status) },
		to: (() => {
			const status = pgEnum('status', ['open']);
			return { status, tickets: tickets(status) };
		})(),
	},
	{ kinds: ['create_sequence'], from: {}, to: { counter } },
	{ kinds: ['drop_sequence'], from: { counter }, to: {} },
	{
		kinds: ['rename_sequence'],
		from: { counter },
		to: { counter: pgSequence('ticker', { increment: 1 }) },
		renames: ['public.counter->public.ticker'],
	},
	{
		kinds: ['move_sequence'],
		from: { archive, counter },
		to: { archive, counter: archive.sequence('counter', { increment: 1 }) },
		renames: ['public.counter->archive.counter'],
	},
	{ kinds: ['alter_sequence'], from: { counter }, to: { counter: pgSequence('counter', { increment: 2 }) } },
	{ kinds: ['create_view'], from: { users }, to: { users, emails: emails('emails', 'local') } },
	{ kinds: ['drop_view'], from: { users, emails: emails('emails', 'local') }, to: { users } },
	{
		kinds: ['rename_view'],
		from: { users, emails: emails('emails', 'local') },
		to: { users, emails: emails('contacts', 'local') },
		renames: ['public.emails->public.contacts'],
	},
	{
		kinds: ['move_view'],
		from: { archive, users, emails: emails('emails', 'local') },
		to: { archive, users, emails: emails('emails', 'local', archive) },
		renames: ['public.emails->archive.emails'],
	},
	{
		kinds: ['alter_view'],
		from: { users, emails: emails('emails', 'local') },
		to: { users, emails: emails('emails', 'cascaded') },
	},
	{ kinds: ['create_policy', 'alter_rls'], from: { users }, to: guarded('users_read') },
	{ kinds: ['drop_policy'], from: guarded('users_read'), to: { users } },
	{
		kinds: ['rename_policy'],
		from: guarded('users_read'),
		to: guarded('users_view'),
		renames: ['public.users.users_read->public.users.users_view'],
	},
	{ kinds: ['alter_policy'], from: guarded('users_read'), to: guarded('users_read', 'select', sql`false`) },
	{ kinds: ['recreate_policy'], from: guarded('users_read'), to: guarded('users_read', 'all') },
	{ kinds: ['create_role'], from: {}, to: { app: pgRole('app') } },
	{ kinds: ['drop_role'], from: { app: pgRole('app') }, to: {} },
	{
		kinds: ['rename_role'],
		from: { app: pgRole('app') },
		to: { app: pgRole('service') },
		renames: ['app->service'],
	},
	{ kinds: ['alter_role'], from: { app: pgRole('app') }, to: { app: pgRole('app', { createDb: true }) } },
	{ kinds: ['grant_privilege'], from: granted(), to: granted(false) },
	{ kinds: ['revoke_privilege'], from: granted(false), to: granted() },
	{ kinds: ['regrant_privilege'], from: granted(false), to: granted(true) },
];

const storedStatements = async () => {
	const stored: SnapshotStatement[] = [];
	for (const { kinds, from, to, renames = [] } of cases) {
		const state = (side: Side) => typeof side === 'function' ? side() : side;
		const statements = toSnapshotStatements((await diff(state(from), state(to), renames)).statements);
		expect(statements.map((it) => it.type), `the kinds of the case for ${kinds.join(', ')}`).toStrictEqual(
			expect.arrayContaining(kinds),
		);
		stored.push(...statements);
	}
	// A snapshot holds the statements as JSON.
	return JSON.parse(JSON.stringify(stored)) as SnapshotStatement[];
};

// Every object inside `value`, with the path to it. An array is not an object here, and its items are.
const objectsIn = (value: unknown, path: string[] = []): { path: string[]; object: Record<string, unknown> }[] => {
	if (Array.isArray(value)) return value.flatMap((it, idx) => objectsIn(it, [...path, String(idx)]));
	if (value === null || typeof value !== 'object') return [];
	const object = value as Record<string, unknown>;
	return [{ path, object }, ...Object.entries(object).flatMap(([key, it]) => objectsIn(it, [...path, key]))];
};

const changedAt = (statement: unknown, path: string[], change: (object: Record<string, unknown>) => void) => {
	const copy = structuredClone(statement) as Record<string, any>;
	change(path.reduce((it, key) => it[key], copy));
	return copy;
};

describe('stored statements', () => {
	test('the cases cover every statement kind', async () => {
		const covered = new Set((await storedStatements()).map((it) => it.type));

		expect(Object.keys(snapshotStatementSchemas).filter((kind) => !covered.has(kind as never))).toStrictEqual([]);
	});

	test('a stored statement passes the validator', async () => {
		expect((await storedStatements()).filter((it) => !isSnapshotStatement(it))).toStrictEqual([]);
	});

	test('a stored statement with an unknown field at any depth is malformed', async () => {
		const accepted: string[] = [];
		for (const statement of await storedStatements()) {
			for (const { path } of objectsIn(statement)) {
				const changed = changedAt(statement, path, (object) => {
					object.unknownField = 1;
				});
				if (isSnapshotStatement(changed)) accepted.push(`${statement.type} at ${path.join('.') || 'the top'}`);
			}
		}

		expect(accepted).toStrictEqual([]);
	});

	test('a stored statement with a missing field at any depth is malformed', async () => {
		const accepted: string[] = [];
		for (const statement of await storedStatements()) {
			for (const { path, object } of objectsIn(statement)) {
				for (const field of Object.keys(object)) {
					// A changed property of an altered entity is present only when it changed.
					if (path.at(-1) === 'diff') continue;
					const changed = changedAt(statement, path, (it) => {
						delete it[field];
					});
					if (isSnapshotStatement(changed)) accepted.push(`${statement.type} without ${[...path, field].join('.')}`);
				}
			}
		}

		expect(accepted).toStrictEqual([]);
	});

	test('a stored row holds no entityType, and a stored create_table holds no indexes or foreign keys', async () => {
		const [createTable] = (await storedStatements()).filter((it) => it.type === 'create_table');

		expect(Object.keys(createTable.table).sort()).toStrictEqual([
			'checks',
			'columns',
			'enablesRls',
			'name',
			'pk',
			'schema',
			'uniques',
		]);
		expect(objectsIn(createTable).filter(({ object }) => 'entityType' in object)).toStrictEqual([]);
	});

	test.each(['move_enum', 'move_sequence'])('a stored %s with a null schema is malformed', (type) => {
		const from = { schema: 'public', name: 'status' };
		const to = { schema: 'archive', name: 'status' };

		expect(isSnapshotStatement({ type, from, to })).toBe(true);
		expect(isSnapshotStatement({ type, from: { ...from, schema: null }, to })).toBe(false);
		expect(isSnapshotStatement({ type, from, to: { ...to, schema: null } })).toBe(false);
	});

	const storedOf = async <K extends SnapshotStatement['type']>(
		kind: K,
		from: PostgresSchema,
		to: PostgresSchema,
		renames: string[] = [],
	) => {
		const { statements } = await diff(from, to, renames);
		return toSnapshotStatements(statements).filter((it): it is Extract<SnapshotStatement, { type: K }> =>
			it.type === kind
		);
	};

	test('a stored move_table names the indexes that move with the table', async () => {
		const columns = { id: integer(), email: varchar() };
		const indexes = (t: any) => [index('users_email_ix').on(t.email)];

		expect(
			await storedOf(
				'move_table',
				{ archive, users: pgTable('users', columns, indexes) },
				{ archive, users: archive.table('users', columns, indexes) },
				['public.users->archive.users'],
			),
		).toStrictEqual([{
			type: 'move_table',
			name: 'users',
			from: 'public',
			to: 'archive',
			indexNames: ['users_email_ix'],
		}]);
	});

	test('a stored alter_column says whether the column becomes serial', async () => {
		const [integerToSerial] = await storedOf(
			'alter_column',
			{ users: pgTable('users', { id: integer().notNull() }) },
			{ users: pgTable('users', { id: serial() }) },
		);
		const [integerToText] = await storedOf(
			'alter_column',
			{ users: pgTable('users', { id: integer().notNull() }) },
			{ users: pgTable('users', { id: text().notNull() }) },
		);

		expect(integerToSerial).toMatchObject({ wasSerial: false, becomesSerial: true });
		expect(integerToText).toMatchObject({ wasSerial: false, becomesSerial: false });
	});

	test('a stored alter_pk says whether its SQL drops the old key', async () => {
		const columns = { id: integer().notNull(), email: varchar().notNull(), name: varchar().notNull() };
		const keyOnName = (t: any) => [primaryKey({ name: 'users_pk', columns: [t.name] })];
		const from = {
			users: pgTable('users', columns, (t) => [primaryKey({ name: 'users_pk', columns: [t.id, t.email] })]),
		};
		const stored = {
			type: 'alter_pk',
			pk: { schema: 'public', table: 'users', name: 'users_pk', nameExplicit: true, columns: ['name'] },
			oldColumns: ['id', 'email'],
		};

		expect(await storedOf('alter_pk', from, { users: pgTable('users', columns, keyOnName) })).toStrictEqual([
			{ ...stored, shouldDrop: true },
		]);
		// The drop of the column `email` drops the old key.
		expect(
			await storedOf('alter_pk', from, {
				users: pgTable('users', { id: columns.id, name: columns.name }, keyOnName),
			}),
		).toStrictEqual([{ ...stored, shouldDrop: false }]);
	});

	test('a stored recreate_enum holds the default of each column before and after', async () => {
		const open = pgEnum('status', ['open']);
		const [recreateEnum] = await storedOf(
			'recreate_enum',
			{ status, tickets: tickets(status) },
			{ status: open, tickets: pgTable('tickets', { status: open() }) },
		);

		expect(recreateEnum.columns.map((column) => column.default)).toStrictEqual([{ from: "'open'", to: null }]);
	});
});
