// End-to-end domain tests against a real postgres (PGlite):
// every generated migration is executed, then the database is introspected and
// diffed against the target schema, which must produce no further statements.
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import {
	boolean,
	char,
	check,
	integer,
	interval,
	jsonb,
	numeric,
	pgDomain,
	pgEnum,
	pgSchema,
	pgTable,
	serial,
	text,
	timestamp,
	varchar,
} from 'drizzle-orm/pg-core';
import { describe, expect, test } from 'vitest';
import { applyPgDiffs, diffTestSchemas, diffTestSchemasPush } from './schemaDiffer';

type Schema = Parameters<typeof diffTestSchemas>[0];

const migrateAndVerify = async (
	from: Schema,
	to: Schema,
	opts: { renames?: string[]; schemas?: string[]; seed?: string[]; client?: PGlite } = {},
) => {
	const client = opts.client ?? new PGlite();
	for (const st of (await applyPgDiffs(from, undefined)).sqlStatements) {
		await client.query(st);
	}
	for (const st of opts.seed ?? []) {
		await client.query(st);
	}

	const { sqlStatements } = await diffTestSchemas(from, to, opts.renames ?? []);
	for (const st of sqlStatements) {
		await client.query(st);
	}

	// introspect what is now in the database and diff against the target: nothing should be left to do
	const { sqlStatements: drift } = await diffTestSchemasPush(
		client,
		to,
		to,
		[],
		false,
		opts.schemas ?? ['public'],
		undefined,
		undefined,
		{ runApply: false },
	);

	return { sqlStatements, drift, client };
};

describe('create', () => {
	test('several domains, used by tables, in public and a custom schema', async () => {
		const app = pgSchema('app');
		const email = app.domain('email', text().checkConstraint(sql`VALUE ~ '^[^@]+@[^@]+$'`));
		const age = pgDomain('age', integer().notNull().checkConstraint('age_range', sql`VALUE BETWEEN 0 AND 150`));
		const to = {
			app,
			email,
			age,
			users: pgTable('users', { id: serial('id').primaryKey(), email: email('email'), age: age('age') }),
		};

		const { sqlStatements, drift } = await migrateAndVerify({}, to, { schemas: ['public', 'app'] });
		expect(sqlStatements).toStrictEqual([
			'CREATE SCHEMA "app";\n',
			`CREATE DOMAIN "app"."email" AS text CONSTRAINT "email_check" CHECK (VALUE ~ '^[^@]+@[^@]+$');`,
			'CREATE DOMAIN "public"."age" AS integer NOT NULL CONSTRAINT "age_range" CHECK (VALUE BETWEEN 0 AND 150);',
			'CREATE TABLE "users" (\n\t"id" serial PRIMARY KEY NOT NULL,\n\t"email" "app"."email",\n\t"age" "age"\n);\n',
		]);
		expect(drift).toStrictEqual([]);
	});

	test('base types with modifiers survive a push round-trip', async () => {
		const to = {
			a: pgDomain('d_numeric', numeric({ precision: 10, scale: 2 })),
			b: pgDomain('d_varchar', varchar({ length: 20 })),
			c: pgDomain('d_char', char({ length: 3 })),
			d: pgDomain('d_tstz', timestamp({ precision: 3, withTimezone: true })),
			e: pgDomain('d_ts', timestamp()),
			f: pgDomain('d_interval', interval({ fields: 'day' })),
			g: pgDomain('d_jsonb', jsonb()),
			h: pgDomain('d_text_array', text().array()),
		};
		const { drift } = await migrateAndVerify({}, to);
		expect(drift).toStrictEqual([]);
	});

	test('defaults of every flavour survive a push round-trip', async () => {
		const to = {
			a: pgDomain('d_str', text().default("it's")),
			b: pgDomain('d_int', integer().default(42)),
			c: pgDomain('d_bool', boolean().default(false)),
			d: pgDomain('d_sql', timestamp().default(sql`now()`)),
			e: pgDomain('d_num', numeric().default('1.5')),
		};
		const { sqlStatements, drift } = await migrateAndVerify({}, to);
		expect(sqlStatements).toContain(`CREATE DOMAIN "public"."d_str" AS text DEFAULT 'it''s';`);
		expect(sqlStatements).toContain(`CREATE DOMAIN "public"."d_sql" AS timestamp DEFAULT now();`);
		expect(drift).toStrictEqual([]);
	});

	test('domain over an enum in another schema', async () => {
		const app = pgSchema('app');
		const mood = app.enum('mood', ['sad', 'happy']);
		const happyMood = pgDomain('happy_mood', mood().checkConstraint(sql`VALUE <> 'sad'`));
		const to = { app, mood, happyMood, t: pgTable('t', { m: happyMood('m') }) };

		const { sqlStatements, drift } = await migrateAndVerify({}, to, { schemas: ['public', 'app'] });
		expect(sqlStatements).toContain(
			`CREATE DOMAIN "public"."happy_mood" AS "app"."mood" CONSTRAINT "happy_mood_check" CHECK (VALUE <> 'sad');`,
		);
		expect(drift).toStrictEqual([]);
	});

	test('domain over another domain', async () => {
		const positive = pgDomain('positive', integer().checkConstraint(sql`VALUE > 0`));
		const small = pgDomain('small_positive', positive().checkConstraint(sql`VALUE < 100`));
		const to = { positive, small, t: pgTable('t', { v: small('v') }) };
		const { drift } = await migrateAndVerify({}, to);
		expect(drift).toStrictEqual([]);
	});

	test('multiple unnamed checks get postgres-style names', async () => {
		const to = {
			d: pgDomain('d', integer().checkConstraint(sql`VALUE > 0`).checkConstraint(sql`VALUE < 10`)),
		};
		const { sqlStatements, drift } = await migrateAndVerify({}, to);
		expect(sqlStatements).toStrictEqual([
			'CREATE DOMAIN "public"."d" AS integer CONSTRAINT "d_check" CHECK (VALUE > 0) CONSTRAINT "d_check1" CHECK (VALUE < 10);',
		]);
		expect(drift).toStrictEqual([]);
	});

	test('duplicated domain names are rejected', async () => {
		const exit = process.exit;
		process.exit = ((code?: number) => {
			throw new Error(`exit ${code}`);
		}) as any;
		try {
			await expect(diffTestSchemas({}, { a: pgDomain('d', text()), b: pgDomain('d', integer()) }, [])).rejects
				.toThrow('exit 1');
		} finally {
			process.exit = exit;
		}
	});
});

describe('alter', () => {
	const seedRow = (table: string, values: string) => [`INSERT INTO "${table}" VALUES (${values});`];

	test('rename a domain in use keeps the column and its data', async () => {
		const from = { d: pgDomain('old_name', text()), t: pgTable('t', { v: pgDomain('old_name', text())('v') }) };
		const newD = pgDomain('new_name', text());
		const to = { d: newD, t: pgTable('t', { v: newD('v') }) };

		const { sqlStatements, drift, client } = await migrateAndVerify(from, to, {
			renames: ['public.old_name->public.new_name'],
			seed: seedRow('t', `'kept'`),
		});
		expect(sqlStatements).toStrictEqual(['ALTER DOMAIN "public"."old_name" RENAME TO "new_name";']);
		expect(drift).toStrictEqual([]);
		expect((await client.query('SELECT v FROM t')).rows).toStrictEqual([{ v: 'kept' }]);
	});

	test('move a domain to another schema', async () => {
		const app = pgSchema('app');
		const from = { app, d: pgDomain('d', text()) };
		const to = { app, d: app.domain('d', text()) };
		const { sqlStatements, drift } = await migrateAndVerify(from, to, {
			renames: ['public.d->app.d'],
			schemas: ['public', 'app'],
		});
		expect(sqlStatements).toStrictEqual(['ALTER DOMAIN "public"."d" SET SCHEMA "app";']);
		expect(drift).toStrictEqual([]);
	});

	test('changing a check expression drops and re-adds it', async () => {
		const from = { d: pgDomain('d', integer().checkConstraint('pos', sql`VALUE > 0`)) };
		const to = { d: pgDomain('d', integer().checkConstraint('pos', sql`VALUE > 10`)) };
		const { sqlStatements, drift } = await migrateAndVerify(from, to);
		expect(sqlStatements).toStrictEqual([
			'ALTER DOMAIN "public"."d" DROP CONSTRAINT "pos";',
			'ALTER DOMAIN "public"."d" ADD CONSTRAINT "pos" CHECK (VALUE > 10);',
		]);
		expect(drift).toStrictEqual([]);
	});

	test('add and drop unnamed checks', async () => {
		const a = { d: pgDomain('d', integer().checkConstraint(sql`VALUE > 0`)) };
		const b = { d: pgDomain('d', integer().checkConstraint(sql`VALUE > 0`).checkConstraint(sql`VALUE < 5`)) };
		const added = await migrateAndVerify(a, b);
		expect(added.sqlStatements).toStrictEqual([
			'ALTER DOMAIN "public"."d" ADD CONSTRAINT "d_check1" CHECK (VALUE < 5);',
		]);
		expect(added.drift).toStrictEqual([]);

		const dropped = await migrateAndVerify(a, { d: pgDomain('d', integer()) });
		expect(dropped.sqlStatements).toStrictEqual(['ALTER DOMAIN "public"."d" DROP CONSTRAINT "d_check";']);
		expect(dropped.drift).toStrictEqual([]);
	});

	test('set, change and drop defaults', async () => {
		const none = { d: pgDomain('d', text()) };
		const hi = { d: pgDomain('d', text().default('hi')) };
		const bye = { d: pgDomain('d', text().default('bye')) };

		expect((await migrateAndVerify(none, hi)).sqlStatements).toStrictEqual([
			`ALTER DOMAIN "public"."d" SET DEFAULT 'hi';`,
		]);
		const changed = await migrateAndVerify(hi, bye);
		expect(changed.sqlStatements).toStrictEqual([`ALTER DOMAIN "public"."d" SET DEFAULT 'bye';`]);
		expect(changed.drift).toStrictEqual([]);
		const dropped = await migrateAndVerify(bye, none);
		expect(dropped.sqlStatements).toStrictEqual([`ALTER DOMAIN "public"."d" DROP DEFAULT;`]);
		expect(dropped.drift).toStrictEqual([]);
	});

	test('set and drop not null', async () => {
		const a = { d: pgDomain('d', text()) };
		const b = { d: pgDomain('d', text().notNull()) };
		const set = await migrateAndVerify(a, b);
		expect(set.sqlStatements).toStrictEqual(['ALTER DOMAIN "public"."d" SET NOT NULL;']);
		expect(set.drift).toStrictEqual([]);
		const dropped = await migrateAndVerify(b, a);
		expect(dropped.sqlStatements).toStrictEqual(['ALTER DOMAIN "public"."d" DROP NOT NULL;']);
		expect(dropped.drift).toStrictEqual([]);
	});

	test('changing the base type is refused instead of silently ignored', async () => {
		await expect(diffTestSchemas({ d: pgDomain('d', text()) }, { d: pgDomain('d', integer()) }, [])).rejects
			.toThrow(/cannot alter a domain's base type/);
	});

	test('add a domain column to an existing table, in a custom schema', async () => {
		const app = pgSchema('app');
		const email = app.domain('email', text());
		const from = { app, email, t: pgTable('t', { id: integer('id') }) };
		const to = { app, email, t: pgTable('t', { id: integer('id'), e: email('e') }) };
		const { sqlStatements, drift } = await migrateAndVerify(from, to, { schemas: ['public', 'app'] });
		expect(sqlStatements).toStrictEqual(['ALTER TABLE "t" ADD COLUMN "e" "app"."email";']);
		expect(drift).toStrictEqual([]);
	});

	test('array of a domain living in a custom schema', async () => {
		const app = pgSchema('app');
		const email = app.domain('email', text());
		const mood = app.enum('mood', ['a', 'b']);
		const to = { app, email, mood, t: pgTable('t', { e: email('e').array(), m: mood('m').array() }) };
		const { sqlStatements, drift } = await migrateAndVerify({}, to, { schemas: ['public', 'app'] });
		expect(sqlStatements).toContain('CREATE TABLE "t" (\n\t"e" "app"."email"[],\n\t"m" "app"."mood"[]\n);\n');
		expect(drift).toStrictEqual([]);
	});

	test('change a column from its base type to a domain', async () => {
		const app = pgSchema('app');
		const email = app.domain('email', text());
		const from = { app, email, t: pgTable('t', { e: text('e') }) };
		const to = { app, email, t: pgTable('t', { e: email('e') }) };
		const { drift } = await migrateAndVerify(from, to, { schemas: ['public', 'app'] });
		expect(drift).toStrictEqual([]);
	});
});

describe('drop', () => {
	test('drop a domain together with the column that uses it', async () => {
		const d = pgDomain('d', text());
		const from = { d, t: pgTable('t', { id: integer('id'), v: d('v') }) };
		const to = { t: pgTable('t', { id: integer('id') }) };
		const { sqlStatements, drift } = await migrateAndVerify(from, to);
		expect(sqlStatements).toStrictEqual(['ALTER TABLE "t" DROP COLUMN "v";', 'DROP DOMAIN "public"."d";']);
		expect(drift).toStrictEqual([]);
	});

	test('drop a domain together with its schema', async () => {
		const app = pgSchema('app');
		const { sqlStatements } = await migrateAndVerify({ app, d: app.domain('d', text()) }, {}, {
			schemas: ['public', 'app'],
		});
		expect(sqlStatements).toStrictEqual(['DROP DOMAIN "app"."d";', 'DROP SCHEMA "app";\n']);
	});

	test('drop a domain together with the enum it is based on', async () => {
		const mood = pgEnum('mood', ['a', 'b']);
		const { sqlStatements } = await migrateAndVerify({ mood, d: pgDomain('d', mood()) }, {});
		expect(sqlStatements).toStrictEqual(['DROP DOMAIN "public"."d";', 'DROP TYPE "public"."mood";']);
	});
});

describe('column-level checks', () => {
	test('checks declared on table columns become table constraints', async () => {
		const to = {
			t: pgTable('t', {
				price: integer('price').checkConstraint(sql`price > 0`),
				qty: integer('qty').checkConstraint('qty_max', sql`qty <= 100`),
			}),
		};
		const { sqlStatements, drift } = await migrateAndVerify({}, to);
		expect(sqlStatements).toStrictEqual([
			'CREATE TABLE "t" (\n\t"price" integer,\n\t"qty" integer,\n'
			+ '\tCONSTRAINT "t_price_check" CHECK (price > 0),\n\tCONSTRAINT "qty_max" CHECK (qty <= 100)\n);\n',
		]);
		expect(drift).toStrictEqual([]);
	});

	test('a check added to an existing column', async () => {
		const from = { t: pgTable('t', { price: integer('price') }) };
		const to = { t: pgTable('t', { price: integer('price').checkConstraint(sql`price > 0`) }) };
		const { sqlStatements, drift } = await migrateAndVerify(from, to);
		expect(sqlStatements).toStrictEqual(['ALTER TABLE "t" ADD CONSTRAINT "t_price_check" CHECK (price > 0);']);
		expect(drift).toStrictEqual([]);
	});

	test('checks on a domain column itself are table checks, separate from the domain checks', async () => {
		const d = pgDomain('d', integer().checkConstraint(sql`VALUE > 0`));
		const to = { d, t: pgTable('t', { v: d('v').checkConstraint(sql`v < 10`) }) };
		const { sqlStatements, drift } = await migrateAndVerify({}, to);
		expect(sqlStatements).toStrictEqual([
			'CREATE DOMAIN "public"."d" AS integer CONSTRAINT "d_check" CHECK (VALUE > 0);',
			'CREATE TABLE "t" (\n\t"v" "d",\n\tCONSTRAINT "t_v_check" CHECK (v < 10)\n);\n',
		]);
		expect(drift).toStrictEqual([]);
	});

	test('several unnamed table checks', async () => {
		const to = {
			t: pgTable('t', { a: integer('a'), b: integer('b') }, (t) => [
				check(sql`${t.a} > 0`),
				check(sql`${t.b} > ${sql.raw('0')}`),
			]),
		};
		const { sqlStatements, drift } = await migrateAndVerify({}, to);
		expect(sqlStatements).toStrictEqual([
			'CREATE TABLE "t" (\n\t"a" integer,\n\t"b" integer,\n'
			+ '\tCONSTRAINT "t_check" CHECK ("t"."a" > 0),\n\tCONSTRAINT "t_check1" CHECK ("t"."b" > 0)\n);\n',
		]);
		expect(drift).toStrictEqual([]);
	});
});
