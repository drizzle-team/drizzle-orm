import { sql } from 'drizzle-orm';
import {
	bigint as crBigint,
	check as crCheck,
	cockroachTable,
	int4 as crInt,
	text as crText,
	varchar as crVarchar,
} from 'drizzle-orm/cockroach-core';
import {
	bigint as msBigint,
	check as msCheck,
	int as msInt,
	mssqlTable,
	text as msText,
	varchar as msVarchar,
} from 'drizzle-orm/mssql-core';
import {
	bigint as myBigint,
	check as myCheck,
	int as myInt,
	mysqlTable,
	text as myText,
	varchar as myVarchar,
} from 'drizzle-orm/mysql-core';
import {
	bigint,
	check,
	index,
	integer,
	numeric,
	pgEnum,
	pgSchema,
	pgTable,
	text,
	unique,
	uniqueIndex,
	varchar,
} from 'drizzle-orm/pg-core';
import {
	check as sqliteCheck,
	integer as sqliteInt,
	sqliteTable,
	text as sqliteText,
	unique as sqliteUnique,
} from 'drizzle-orm/sqlite-core';
import { ddlDiffWithDown as cockroachDiff } from 'src/cli/commands/generate-cockroach';
import {
	collectIrreversibleDownWarnings,
	formatIrreversibleBanner,
	type ResolverFor,
} from 'src/cli/commands/generate-down-helpers';
import { ddlDiffWithDown as mssqlDiff } from 'src/cli/commands/generate-mssql';
import { ddlDiffWithDown as mysqlDiff } from 'src/cli/commands/generate-mysql';
import { ddlDiffWithDown as postgresDiff } from 'src/cli/commands/generate-postgres';
import { ddlDiffWithDown as sqliteDiff } from 'src/cli/commands/generate-sqlite';
import { interimToDDL as cockroachInterim } from 'src/dialects/cockroach/ddl';
import {
	fromDrizzleSchema as cockroachFromDrizzle,
	fromExports as cockroachExports,
} from 'src/dialects/cockroach/drizzle';
import { interimToDDL as mssqlInterim } from 'src/dialects/mssql/ddl';
import { fromDrizzleSchema as mssqlFromDrizzle, fromExports as mssqlExports } from 'src/dialects/mssql/drizzle';
import { interimToDDL as mysqlInterim } from 'src/dialects/mysql/ddl';
import { fromDrizzleSchema as mysqlFromDrizzle, prepareFromExports as mysqlExports } from 'src/dialects/mysql/drizzle';
import { interimToDDL as postgresInterim } from 'src/dialects/postgres/ddl';
import {
	fromDrizzleSchema as postgresFromDrizzle,
	fromExports as postgresExports,
} from 'src/dialects/postgres/drizzle';
import { interimToDDL as sqliteInterim } from 'src/dialects/sqlite/ddl';
import { fromDrizzleSchema as sqliteFromDrizzle, fromExports as sqliteExports } from 'src/dialects/sqlite/drizzle';
import { mockResolver } from 'src/utils/mocks';
import { describe, expect, test } from 'vitest';

type Schema = Record<string, unknown>;
const noRenames: ResolverFor = () => mockResolver(new Set());

const dialects = {
	postgres: async (from: Schema, to: Schema) => {
		const ddl = (s: Schema) => postgresInterim(postgresFromDrizzle(postgresExports(s), () => true).schema).ddl;
		return (await (await postgresDiff(ddl(from), ddl(to), noRenames)).down()).groupedStatements;
	},
	cockroach: async (from: Schema, to: Schema) => {
		const ddl = (s: Schema) => cockroachInterim(cockroachFromDrizzle(cockroachExports(s), () => true).schema).ddl;
		return (await (await cockroachDiff(ddl(from), ddl(to), noRenames)).down()).groupedStatements;
	},
	mysql: async (from: Schema, to: Schema) => {
		const ddl = (s: Schema) => {
			const { tables, views } = mysqlExports(s);
			return mysqlInterim(mysqlFromDrizzle(tables, views)).ddl;
		};
		return (await (await mysqlDiff(ddl(from), ddl(to), noRenames)).down()).groupedStatements;
	},
	sqlite: async (from: Schema, to: Schema) => {
		const ddl = (s: Schema) => {
			const { tables, views } = sqliteExports(s);
			return sqliteInterim(sqliteFromDrizzle(tables, views)).ddl;
		};
		return (await (await sqliteDiff(ddl(from), ddl(to), noRenames)).down()).groupedStatements;
	},
	mssql: async (from: Schema, to: Schema) => {
		const ddl = (s: Schema) => mssqlInterim(mssqlFromDrizzle(mssqlExports(s), () => true).schema).ddl;
		return (await (await mssqlDiff(ddl(from), ddl(to), noRenames)).down()).groupedStatements;
	},
};

const warn = async (dialect: keyof typeof dialects, from: Schema, to: Schema) =>
	collectIrreversibleDownWarnings(await dialects[dialect](from, to));

const kinds = async (
	dialect: keyof typeof dialects,
	from: Schema,
	to: Schema,
) => [...new Set((await warn(dialect, from, to)).map(({ kind, reason }) => `${kind}: ${reason}`))];

const SET_NOT_NULL = 'may_fail: sets NOT NULL; fails if the column contains NULLs';
const UNIQUE = 'may_fail: re-adds a unique constraint; fails if existing rows contain duplicates';
const FK = 'may_fail: re-adds a foreign key; fails if existing rows reference missing keys';
const CHECK = 'may_fail: re-adds a check constraint; fails if existing rows violate it';
const PK = 'may_fail: re-adds a primary key; fails if existing rows contain duplicates or NULLs';
const NOT_NULL_COLUMN = 'may_fail: re-adds a NOT NULL column without a default; fails if the table has rows';
const RECREATED_TABLE = 'data_loss: recreates a table the migration dropped; its original rows cannot be restored';
const READDED_COLUMN = 'data_loss: re-adds a column the migration dropped; its original values cannot be restored';
const typeChange = (from: string, to: string) =>
	`may_fail: changes type ${from} to ${to}; fails if existing values do not convert`;

describe('postgres rollback warnings', () => {
	const users = pgTable('users', { id: integer().primaryKey() });

	test('undoing creates is not flagged', async () => {
		const archive = pgSchema('archive');
		expect(
			await kinds(
				'postgres',
				{ users: pgTable('users', { id: integer() }) },
				{
					archive,
					users: pgTable('users', { id: integer(), name: text().notNull() }),
					posts: pgTable('posts', { id: integer() }),
				},
			),
		).toStrictEqual([]);
	});

	test('recreating a dropped table loses data but its constraints are not flagged', async () => {
		const posts = pgTable('posts', { id: integer().notNull().unique(), userId: integer().references(() => users.id) });
		expect(await kinds('postgres', { users, posts }, { users })).toStrictEqual([RECREATED_TABLE]);
	});

	test('re-adding a dropped column loses data, and may fail when NOT NULL without a default', async () => {
		expect(
			await kinds('postgres', { t: pgTable('t', { id: integer(), a: text().notNull() }) }, {
				t: pgTable('t', { id: integer() }),
			}),
		).toStrictEqual([READDED_COLUMN, NOT_NULL_COLUMN]);
		expect(
			await kinds('postgres', { t: pgTable('t', { id: integer(), a: text().notNull().default('x') }) }, {
				t: pgTable('t', { id: integer() }),
			}),
		).toStrictEqual([READDED_COLUMN]);
	});

	test('restoring a dropped NOT NULL may fail', async () => {
		const warnings = await warn('postgres', { t: pgTable('t', { a: text().notNull() }) }, {
			t: pgTable('t', { a: text() }),
		});
		expect(warnings).toStrictEqual([{
			kind: 'may_fail',
			sql: 'ALTER TABLE "t" ALTER COLUMN "a" SET NOT NULL;',
			reason: 'sets NOT NULL; fails if the column contains NULLs',
		}]);
	});

	test.each([
		['varchar(255)', 'varchar(10)', varchar({ length: 10 }), varchar({ length: 255 })],
		['bigint', 'integer', integer(), bigint({ mode: 'number' })],
		['numeric(10,2)', 'numeric(5,2)', numeric({ precision: 5, scale: 2 }), numeric({ precision: 10, scale: 2 })],
		['integer', 'text', text(), integer()],
	])('narrowing or unclassified type change %s -> %s may fail', async (downFrom, downTo, before, after) => {
		expect(await kinds('postgres', { t: pgTable('t', { a: before }) }, { t: pgTable('t', { a: after }) }))
			.toStrictEqual([typeChange(downFrom, downTo)]);
	});

	test.each([
		['varchar(10) -> varchar(255)', varchar({ length: 255 }), varchar({ length: 10 })],
		['integer -> bigint', bigint({ mode: 'number' }), integer()],
		['numeric(5,2) -> numeric(10,2)', numeric({ precision: 10, scale: 2 }), numeric({ precision: 5, scale: 2 })],
		['varchar(10) -> text', text(), varchar({ length: 10 })],
	])('widening type change %s is not flagged', async (_, before, after) => {
		expect(await kinds('postgres', { t: pgTable('t', { a: before }) }, { t: pgTable('t', { a: after }) }))
			.toStrictEqual([]);
	});

	test.each([
		['unique constraint', UNIQUE, pgTable('t', { id: integer(), a: text() }, (t) => [unique('uq').on(t.a)])],
		['unique index', UNIQUE, pgTable('t', { id: integer(), a: text() }, (t) => [uniqueIndex('uq').on(t.a)])],
		['foreign key', FK, pgTable('t', { id: integer(), a: integer().references(() => users.id) })],
		['check', CHECK, pgTable('t', { id: integer(), a: text() }, (t) => [check('c', sql`${t.a} <> ''`)])],
		['primary key', PK, pgTable('t', { id: integer().primaryKey(), a: text() })],
	])('re-adding a dropped %s may fail', async (_, expected, before) => {
		const after = pgTable('t', { id: integer(), a: text() });
		const reasons = await kinds('postgres', { users, t: before }, { users, t: after });
		expect(reasons).toContain(expected);
	});

	test('re-adding a plain index is not flagged', async () => {
		expect(
			await kinds('postgres', { t: pgTable('t', { a: text() }, (t) => [index('i').on(t.a)]) }, {
				t: pgTable('t', { a: text() }),
			}),
		).toStrictEqual([]);
	});

	test('reversing an added enum value may fail', async () => {
		const before = pgEnum('status', ['a', 'b']);
		const after = pgEnum('status', ['a', 'b', 'c']);
		const reasons = await kinds(
			'postgres',
			{ before, users: pgTable('users', { status: before() }) },
			{ after, users: pgTable('users', { status: after() }) },
		);
		expect(reasons).toStrictEqual([`may_fail: removes enum value(s) 'c'; fails if any row still uses them`]);
	});
});

describe('sqlite rollback warnings', () => {
	const users = sqliteTable('users', { id: sqliteInt().primaryKey() });
	const plain = sqliteTable('t', { id: sqliteInt(), a: sqliteText() });

	test('undoing creates is not flagged', async () => {
		expect(
			await kinds('sqlite', { users }, { users, t: plain }),
		).toStrictEqual([]);
	});

	test.each([
		['NOT NULL', SET_NOT_NULL, sqliteTable('t', { id: sqliteInt(), a: sqliteText().notNull() })],
		['unique', UNIQUE, sqliteTable('t', { id: sqliteInt(), a: sqliteText() }, (t) => [sqliteUnique('uq').on(t.a)])],
		['foreign key', FK, sqliteTable('t', { id: sqliteInt().references(() => users.id), a: sqliteText() })],
		[
			'check',
			CHECK,
			sqliteTable('t', { id: sqliteInt(), a: sqliteText() }, (t) => [sqliteCheck('c', sql`${t.a} <> ''`)]),
		],
		['primary key', PK, sqliteTable('t', { id: sqliteInt().primaryKey(), a: sqliteText() })],
		['type', typeChange('text', 'integer'), sqliteTable('t', { id: sqliteInt(), a: sqliteInt() })],
	])('table rebuild restoring a dropped %s may fail', async (_, expected, before) => {
		const warnings = await warn('sqlite', { users, t: before }, { users, t: plain });
		expect(warnings.map(({ kind, reason }) => `${kind}: ${reason}`)).toContain(expected);
		expect(warnings.some(({ sql }) => sql.startsWith('CREATE TABLE `__new_t`'))).toBe(true);
	});
});

describe('mysql rollback warnings', () => {
	const users = mysqlTable('users', { id: myInt().primaryKey() });
	const plain = mysqlTable('t', { id: myInt(), a: myVarchar({ length: 10 }) });

	test.each([
		['NOT NULL', SET_NOT_NULL, mysqlTable('t', { id: myInt(), a: myVarchar({ length: 10 }).notNull() })],
		['unique index', UNIQUE, mysqlTable('t', { id: myInt(), a: myVarchar({ length: 10 }).unique() })],
		['foreign key', FK, mysqlTable('t', { id: myInt().references(() => users.id), a: myVarchar({ length: 10 }) })],
		[
			'check',
			CHECK,
			mysqlTable('t', { id: myInt(), a: myVarchar({ length: 10 }) }, (t) => [myCheck('c', sql`${t.id} > 0`)]),
		],
		['primary key', PK, mysqlTable('t', { id: myInt().primaryKey(), a: myVarchar({ length: 10 }) })],
		[
			'narrower type',
			typeChange('varchar(10)', 'varchar(5)'),
			mysqlTable('t', { id: myInt(), a: myVarchar({ length: 5 }) }),
		],
	])('restoring a dropped %s may fail', async (_, expected, before) => {
		expect(await kinds('mysql', { users, t: plain }, { users, t: before })).toStrictEqual([]);
		expect(await kinds('mysql', { users, t: before }, { users, t: plain })).toContain(expected);
	});

	test('bigint back to int may fail', async () => {
		expect(
			await kinds('mysql', { t: mysqlTable('t', { a: myInt() }) }, {
				t: mysqlTable('t', { a: myBigint({ mode: 'number' }) }),
			}),
		).toStrictEqual([typeChange('bigint', 'int')]);
	});

	test('re-adding a dropped NOT NULL text column may fail', async () => {
		expect(
			await kinds('mysql', { t: mysqlTable('t', { id: myInt(), a: myText().notNull() }) }, {
				t: mysqlTable('t', { id: myInt() }),
			}),
		).toStrictEqual([READDED_COLUMN, NOT_NULL_COLUMN]);
	});
});

describe('cockroach rollback warnings', () => {
	const users = cockroachTable('users', { id: crInt().primaryKey() });
	const plain = cockroachTable('t', { id: crInt(), a: crText() });

	test.each([
		['NOT NULL', SET_NOT_NULL, cockroachTable('t', { id: crInt(), a: crText().notNull() })],
		['unique index', UNIQUE, cockroachTable('t', { id: crInt(), a: crText().unique() })],
		['foreign key', FK, cockroachTable('t', { id: crInt().references(() => users.id), a: crText() })],
		['check', CHECK, cockroachTable('t', { id: crInt(), a: crText() }, (t) => [crCheck('c', sql`${t.id} > 0`)])],
		['primary key', PK, cockroachTable('t', { id: crInt().primaryKey(), a: crText() })],
		[
			'narrower type',
			typeChange('string', 'varchar(10)'),
			cockroachTable('t', { id: crInt(), a: crVarchar({ length: 10 }) }),
		],
	])('restoring a dropped %s may fail', async (_, expected, before) => {
		expect(await kinds('cockroach', { users, t: before }, { users, t: plain })).toContain(expected);
	});

	test('int8 back to int4 may fail', async () => {
		expect(
			await kinds('cockroach', { t: cockroachTable('t', { a: crInt() }) }, {
				t: cockroachTable('t', { a: crBigint({ mode: 'number' }) }),
			}),
		).toStrictEqual([typeChange('int8', 'int4')]);
	});
});

describe('mssql rollback warnings', () => {
	const users = mssqlTable('users', { id: msInt().primaryKey() });
	const plain = mssqlTable('t', { id: msInt(), a: msVarchar({ length: 10 }) });

	test.each([
		['NOT NULL', SET_NOT_NULL, mssqlTable('t', { id: msInt(), a: msVarchar({ length: 10 }).notNull() })],
		['unique constraint', UNIQUE, mssqlTable('t', { id: msInt(), a: msVarchar({ length: 10 }).unique() })],
		['foreign key', FK, mssqlTable('t', { id: msInt().references(() => users.id), a: msVarchar({ length: 10 }) })],
		[
			'check',
			CHECK,
			mssqlTable('t', { id: msInt(), a: msVarchar({ length: 10 }) }, (t) => [msCheck('c', sql`${t.id} > 0`)]),
		],
		['primary key', PK, mssqlTable('t', { id: msInt().primaryKey(), a: msVarchar({ length: 10 }) })],
		[
			'narrower type',
			typeChange('varchar(10)', 'varchar(5)'),
			mssqlTable('t', { id: msInt(), a: msVarchar({ length: 5 }) }),
		],
	])('restoring a dropped %s may fail', async (_, expected, before) => {
		expect(await kinds('mssql', { users, t: before }, { users, t: plain })).toContain(expected);
	});

	test('bigint back to int may fail', async () => {
		expect(
			await kinds('mssql', { t: mssqlTable('t', { a: msInt() }) }, {
				t: mssqlTable('t', { a: msBigint({ mode: 'number' }) }),
			}),
		).toStrictEqual([typeChange('bigint', 'int')]);
	});

	test('re-adding a dropped NOT NULL text column may fail', async () => {
		expect(
			await kinds('mssql', { t: mssqlTable('t', { id: msInt(), a: msText().notNull() }) }, {
				t: mssqlTable('t', { id: msInt() }),
			}),
		).toStrictEqual([READDED_COLUMN, NOT_NULL_COLUMN]);
	});
});

describe('formatIrreversibleBanner', () => {
	test('returns an empty string when there are no warnings', () => {
		expect(formatIrreversibleBanner([])).toBe('');
	});

	test('lists data loss and may-fail operations in separate comment sections', () => {
		const banner = formatIrreversibleBanner([
			{ sql: 'CREATE TABLE "a" ("id" integer)', reason: 'lost', kind: 'data_loss' },
			{ sql: 'ALTER TABLE "b" ADD COLUMN "c" text NOT NULL', reason: 'fails', kind: 'may_fail' },
		]);

		expect(banner.split('\n')).toStrictEqual([
			'-- ⚠ REVIEW: best-effort checks flagged operations in this rollback.',
			'-- These operations cannot bring back data the migration dropped:',
			'--   • CREATE TABLE "a" ("id" integer) — lost',
			'-- These operations may fail on a populated table:',
			'--   • ALTER TABLE "b" ADD COLUMN "c" text NOT NULL — fails',
		]);
	});

	test('collapses multi-line SQL to a single line', async () => {
		const warnings = await warn('postgres', { t: pgTable('t', { id: integer(), name: text() }) }, {});
		expect(warnings[0]!.sql).toBe('CREATE TABLE "t" ( "id" integer, "name" text );');
	});
});
