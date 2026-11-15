import { PGlite } from '@electric-sql/pglite';
import { describe, expect, test } from 'vitest';
import { sql } from '~/index.ts';
import { bigint, jsonb, pgDomain, pgSchema, pgTable, serial, text, timestamp } from '~/pg-core/index.ts';
import * as pg from '~/pg-core/index.ts';
import { drizzle } from '~/pglite/index.ts';

describe('pg domains at runtime', () => {
	const app = pgSchema('app');
	const ts = pgDomain('ts_d', timestamp({ withTimezone: true }));
	const doc = app.domain('doc_d', jsonb().$type<{ n: number }>());
	const big = pgDomain('big_d', bigint({ mode: 'bigint' }));
	const email = app.domain('email_d', text().notNull().checkConstraint(sql`VALUE LIKE '%@%'`));
	const t = pgTable('t', {
		id: serial('id').primaryKey(),
		at: ts('at'),
		doc: doc('doc'),
		big: big('big'),
		email: email('email'),
	});

	test('domain columns expose their domain and schema', () => {
		expect(t.email.getSQLType()).toBe('email_d');
		expect(t.email.schema).toBe('app');
		expect(t.at.schema).toBeUndefined();
		expect(t.email.domainNotNull).toBe(true);
		expect(t.email.domainType).toBe('text');
		expect(email('x').getSQLType()).toBe('email_d');
	});

	test('values are mapped like the wrapped base type', async () => {
		const client = new PGlite();
		await client.exec(`
			CREATE SCHEMA app;
			CREATE DOMAIN ts_d AS timestamp with time zone;
			CREATE DOMAIN app.doc_d AS jsonb;
			CREATE DOMAIN big_d AS bigint;
			CREATE DOMAIN app.email_d AS text NOT NULL CHECK (VALUE LIKE '%@%');
			CREATE TABLE t (id serial PRIMARY KEY, at ts_d, doc app.doc_d, big big_d, email app.email_d);
		`);
		const db = drizzle(client);
		const at = new Date('2024-05-06T07:08:09.000Z');

		await db.insert(t).values({ at, doc: { n: 1 }, big: 9007199254740993n, email: 'a@b' });
		const [row] = await db.select().from(t);

		expect(row!.at).toBeInstanceOf(Date);
		expect(row!.at!.toISOString()).toBe(at.toISOString());
		expect(row!.doc).toStrictEqual({ n: 1 });
		expect(row!.big).toBe(9007199254740993n);
		expect(row!.email).toBe('a@b');

		await expect(db.insert(t).values({ email: 'nope' })).rejects.toThrow();
	});
});

// pgDomain() reads the wrapped builder's getSQLType() before the column exists, so every
// builder must report exactly what its built column will
test('builder getSQLType() matches the built column for every pg column type', () => {
	const builders: Record<string, any> = {
		bigint: pg.bigint({ mode: 'number' }),
		bigserial: pg.bigserial({ mode: 'number' }),
		boolean: pg.boolean(),
		char: pg.char({ length: 3 }),
		char0: pg.char(),
		cidr: pg.cidr(),
		date: pg.date(),
		dateStr: pg.date({ mode: 'string' }),
		dp: pg.doublePrecision(),
		inet: pg.inet(),
		int: pg.integer(),
		interval: pg.interval({ fields: 'day', precision: 3 }),
		json: pg.json(),
		jsonb: pg.jsonb(),
		line: pg.line(),
		lineAbc: pg.line({ mode: 'abc' }),
		mac: pg.macaddr(),
		mac8: pg.macaddr8(),
		num: pg.numeric(),
		num1: pg.numeric({ precision: 10 }),
		num2: pg.numeric({ precision: 10, scale: 2 }),
		numNumber: pg.numeric({ mode: 'number', precision: 10, scale: 2 }),
		numBigint: pg.numeric({ mode: 'bigint', precision: 20 }),
		point: pg.point(),
		pointXY: pg.point({ mode: 'xy' }),
		real: pg.real(),
		serial: pg.serial(),
		smallint: pg.smallint(),
		smallserial: pg.smallserial(),
		text: pg.text(),
		time: pg.time({ precision: 3, withTimezone: true }),
		time0: pg.time(),
		ts: pg.timestamp({ precision: 3, withTimezone: true }),
		ts0: pg.timestamp(),
		tsStr: pg.timestamp({ mode: 'string', precision: 3 }),
		uuid: pg.uuid(),
		varchar: pg.varchar({ length: 20 }),
		varchar0: pg.varchar(),
		vector: pg.vector({ dimensions: 3 }),
		halfvec: pg.halfvec({ dimensions: 3 }),
		bit: pg.bit({ dimensions: 3 }),
		sparsevec: pg.sparsevec({ dimensions: 3 }),
		geometry: pg.geometry({ type: 'point', srid: 4326 }),
		geometryXY: pg.geometry({ mode: 'xy' }),
		arr: pg.integer().array(),
		arr3: pg.integer().array(3),
		enum: pg.pgEnum('mood', ['a'])(),
		custom: pg.customType<{ data: string }>({ dataType: () => 'citext' })(),
		domain: pgDomain('d', pg.text())(),
	};
	const table = pg.pgTable('t', builders) as any;
	const mismatches = Object.keys(builders)
		.filter((k) => builders[k].getSQLType() !== table[k].getSQLType())
		.map((k) => `${k}: builder=${builders[k].getSQLType()} column=${table[k].getSQLType()}`);
	expect(mismatches).toStrictEqual([]);
});
