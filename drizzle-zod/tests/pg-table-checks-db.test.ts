// Differential test for table-level CHECKs: every row is inserted into postgres (PGlite) and parsed by the
// generated zod insert schema, and both must agree. Each constraint is tested as written and as postgres
// prints it back (pg_get_constraintdef, which is what `drizzle-kit pull` produces).
//
// Checks across columns are object-level refinements, added only when zod keeps refinements that declare their
// keys through .pick()/.omit() (stock zod throws there). Without that, zod must still never be stricter.
import { PGlite } from '@electric-sql/pglite';
import { type Column, getTableColumns, sql } from 'drizzle-orm';
import {
	check,
	date,
	doublePrecision,
	integer,
	numeric,
	type PgColumnBuilder,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { z } from 'zod/v4';
import { createInsertSchema, createUpdateSchema } from '../src';

type Case = {
	columns: Record<string, { sql: string; builder: () => PgColumnBuilder<any, any> }>;
	check: string;
	rows: Record<string, unknown>[];
};

const keyed = (() => {
	try {
		const probe = z.object({ a: z.any(), b: z.any() }).refine(() => false, { keys: ['a'] } as any);
		return probe.omit({ b: true }).safeParse({ a: 1 }).success === false
			&& probe.omit({ a: true }).safeParse({ b: 1 }).success;
	} catch {
		return false;
	}
})();

const kind = pgEnum('conversation_kind', ['team', 'workflow']);

const cases: Case[] = [
	{
		columns: {
			starts_at: { sql: 'timestamp', builder: () => timestamp() },
			ends_at: { sql: 'timestamp', builder: () => timestamp() },
		},
		check: 'ends_at > starts_at',
		rows: [
			{ starts_at: new Date('2026-01-01T10:00:00Z'), ends_at: new Date('2026-01-01T11:00:00Z') },
			{ starts_at: new Date('2026-01-01T10:00:00Z'), ends_at: new Date('2026-01-01T10:00:00Z') },
			{ starts_at: new Date('2026-01-01T10:00:00.001Z'), ends_at: new Date('2026-01-01T10:00:00Z') },
			{ starts_at: null, ends_at: new Date('2026-01-01T10:00:00Z') },
			{ starts_at: null, ends_at: null },
		],
	},
	{
		columns: {
			starts_at: { sql: 'timestamp', builder: () => timestamp({ mode: 'string' }) },
			ends_at: { sql: 'timestamp', builder: () => timestamp({ mode: 'string' }) },
		},
		check: 'ends_at >= starts_at',
		rows: [
			{ starts_at: '2026-01-01 10:00:00', ends_at: '2026-01-01T10:00:00' },
			{ starts_at: '2026-01-01 10:00:00.000001', ends_at: '2026-01-01 10:00:00' },
			{ starts_at: '2026-01-01', ends_at: '2026-01-01 00:00:00' },
			// a plain timestamp ignores the offset
			{ starts_at: '2026-01-01 10:00:00+05', ends_at: '2026-01-01 09:00:00Z' },
			{ starts_at: '2025-12-31 23:59:59.999999', ends_at: '2026-01-01' },
		],
	},
	{
		columns: {
			starts_at: { sql: 'timestamp(0)', builder: () => timestamp({ mode: 'string', precision: 0 }) },
			ends_at: { sql: 'timestamp(0)', builder: () => timestamp({ mode: 'string', precision: 0 }) },
		},
		check: 'ends_at > starts_at',
		rows: [
			// both round to 10:00:01
			{ starts_at: '2026-01-01 10:00:00.6', ends_at: '2026-01-01 10:00:01' },
			{ starts_at: '2026-01-01 10:00:00.4', ends_at: '2026-01-01 10:00:01' },
			{ starts_at: '1999-12-31 23:59:59.5', ends_at: '2000-01-01 00:00:00' },
		],
	},
	{
		columns: {
			starts_at: { sql: 'timestamptz', builder: () => timestamp({ mode: 'string', withTimezone: true }) },
			ends_at: { sql: 'timestamptz', builder: () => timestamp({ mode: 'string', withTimezone: true }) },
		},
		check: 'ends_at > starts_at',
		rows: [
			{ starts_at: '2026-01-01 10:00:00+00', ends_at: '2026-01-01 11:00:00+02' },
			{ starts_at: '2026-01-01 10:00:00+00', ends_at: '2026-01-01 11:00:00+00:30' },
			{ starts_at: '2026-01-01T10:00:00Z', ends_at: '2026-01-01T10:00:00.5-00:01' },
		],
	},
	{
		columns: {
			issued_on: { sql: 'date', builder: () => date({ mode: 'string' }) },
			due_on: { sql: 'date', builder: () => date({ mode: 'string' }) },
		},
		check: "due_on >= issued_on AND due_on < '2100-01-01'::date",
		rows: [
			{ issued_on: '2026-01-01', due_on: '2026-01-01' },
			{ issued_on: '2026-01-02', due_on: '2026-01-01' },
			{ issued_on: '2026-01-01', due_on: '2100-01-01' },
			{ issued_on: null, due_on: '2100-01-01' },
		],
	},
	{
		columns: {
			min_price: { sql: 'numeric(10,2)', builder: () => numeric({ precision: 10, scale: 2 }) },
			max_price: { sql: 'numeric(10,2)', builder: () => numeric({ precision: 10, scale: 2 }) },
		},
		check: 'max_price >= min_price',
		rows: [
			{ min_price: '1.00', max_price: '1' },
			{ min_price: '1.005', max_price: '1.004' }, // 1.01 vs 1.00 after rounding
			{ min_price: '1.004', max_price: '1.001' }, // both 1.00
			{ min_price: '-0.005', max_price: '-0.01' },
		],
	},
	{
		columns: {
			quantity: { sql: 'integer', builder: () => integer() },
			capacity: { sql: 'integer', builder: () => integer() },
			lo: { sql: 'double precision', builder: () => doublePrecision() },
			hi: { sql: 'double precision', builder: () => doublePrecision() },
		},
		check: 'quantity <= capacity AND lo < hi AND quantity > 0',
		rows: [
			{ quantity: 1, capacity: 1, lo: 0.1, hi: 0.30000000000000004 },
			{ quantity: 2, capacity: 1, lo: 0.1, hi: 0.2 },
			{ quantity: 0, capacity: 1, lo: 0.1, hi: 0.2 },
			{ quantity: 1, capacity: 5, lo: 0.3, hi: 0.1 + 0.2 },
		],
	},
	{
		columns: {
			kind: { sql: 'conversation_kind', builder: () => kind() },
			workflow_id: { sql: 'integer', builder: () => integer() },
		},
		check: "(kind = 'workflow'::conversation_kind) = (workflow_id IS NOT NULL)",
		rows: [
			{ kind: 'workflow', workflow_id: 1 },
			{ kind: 'workflow', workflow_id: null },
			{ kind: 'team', workflow_id: null },
			{ kind: 'team', workflow_id: 2 },
			{ kind: null, workflow_id: 2 },
		],
	},
	{
		columns: {
			email: { sql: 'text', builder: () => text() },
			phone: { sql: 'text', builder: () => text() },
		},
		check: 'email IS NOT NULL OR phone IS NOT NULL',
		rows: [{ email: 'a@b.c', phone: null }, { email: null, phone: '555' }, { email: null, phone: null }],
	},
	{
		columns: {
			status: { sql: 'text', builder: () => text() },
			reason: { sql: 'text', builder: () => text() },
		},
		check: "status IN ('open', 'closed') AND (status <> 'closed' OR length(trim(reason)) > 0)",
		rows: [
			{ status: 'open', reason: null },
			{ status: 'closed', reason: 'done' },
			{ status: 'closed', reason: '   ' },
			{ status: 'closed', reason: null },
			{ status: 'other', reason: 'x' },
			{ status: null, reason: null },
		],
	},
	{
		// one column, but it must see NULL: an object-level rule
		columns: { note: { sql: 'text', builder: () => text() }, other: { sql: 'text', builder: () => text() } },
		check: "note IS NOT NULL AND note <> ''",
		rows: [{ note: null, other: 'x' }, { note: '', other: 'x' }, { note: 'a', other: null }],
	},
];

let db: PGlite;
beforeAll(async () => {
	db = new PGlite();
	await db.exec(`CREATE TYPE conversation_kind AS ENUM ('team', 'workflow');`);
});
afterAll(async () => {
	await db.close();
});

async function postgresAccepts(table: string, columns: Record<string, Column>, row: Record<string, unknown>) {
	const names = Object.keys(row);
	const params = names.map((n) => {
		const v = row[n];
		return v === null ? null : columns[n]!.mapToDriverValue(v);
	});
	try {
		await db.query(
			`INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')})`,
			params,
		);
		return true;
	} catch (e: any) {
		if (e?.code === '23514') return false; // check_violation
		throw e;
	}
}

describe('table CHECK constraints in zod agree with postgres', () => {
	for (const [i, c] of cases.entries()) {
		test(c.check, async () => {
			const table = `tc${i}`;
			const cols = Object.entries(c.columns).map(([n, d]) => `${n} ${d.sql}`).join(', ');
			await db.exec(`CREATE TABLE ${table} (${cols}, CONSTRAINT ${table}_check CHECK (${c.check}));`);
			const printed = (await db.query<{ def: string }>(
				`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = $1`,
				[`${table}_check`],
			)).rows[0]!.def;

			for (const source of [c.check, printed]) {
				const builders = Object.fromEntries(Object.entries(c.columns).map(([n, d]) => [n, d.builder()]));
				const t = pgTable(table, builders as any, () => [check(`${table}_check`, sql.raw(source))]);
				const schema = createInsertSchema(t) as unknown as z.ZodType;
				const columns = getTableColumns(t) as Record<string, Column>;
				for (const row of c.rows) {
					const pg = await postgresAccepts(table, columns, row);
					const zod = schema.safeParse(row).success;
					const label = `${source} with ${JSON.stringify(row)}`;
					if (keyed) expect(zod, label).toBe(pg);
					else if (pg) expect(zod, label).toBe(true);
				}
			}
		});
	}
});

describe.runIf(keyed)('object-level rules', () => {
	const events = pgTable('events', {
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		title: text().notNull(),
		startsAt: timestamp('starts_at').notNull(),
		endsAt: timestamp('ends_at').notNull(),
	}, (t) => [check('events_ends_after_starts', sql`${t.endsAt} > ${t.startsAt}`)]);
	const row = { title: 'x', startsAt: new Date('2026-01-01T10:00:00Z'), endsAt: new Date('2026-01-01T09:00:00Z') };
	const issues = (s: z.ZodType, v: unknown) => s.safeParse(v).error?.issues.map((i) => [i.path.join('.'), i.message]);

	test('report on the first column the check reads, with a readable default message', () => {
		expect(issues(createInsertSchema(events), row)).toEqual([['endsAt', 'Must be after starts at']]);
	});

	test('run alongside other fields failing, but not when the columns it reads are invalid', () => {
		expect(issues(createInsertSchema(events), { ...row, title: 1 })).toEqual([
			['title', 'Invalid input: expected string, received number'],
			['endsAt', 'Must be after starts at'],
		]);
		expect(issues(createInsertSchema(events), { ...row, startsAt: 'nope' })?.map(([p]) => p)).toEqual(['startsAt']);
	});

	test('survive pick/omit/partial/extend, and drop out once a column they read is removed', () => {
		const s = createInsertSchema(events);
		expect(s.omit({ title: true }).safeParse(row).success).toBe(false);
		expect(s.pick({ startsAt: true, endsAt: true }).safeParse(row).success).toBe(false);
		expect(s.omit({ startsAt: true }).safeParse(row).success).toBe(true);
		expect(s.partial().safeParse({ endsAt: row.endsAt }).success).toBe(true);
		expect(s.extend({ title: z.string().min(1) }).safeParse(row).success).toBe(false);
	});

	test('update schemas skip the rule while a column it reads is omitted', () => {
		const s = createUpdateSchema(events);
		expect(s.safeParse({ endsAt: row.endsAt }).success).toBe(true);
		expect(s.safeParse({ startsAt: row.startsAt, endsAt: row.endsAt }).success).toBe(false);
	});

	test('default messages for lists, ranges and checks without a plain reading', () => {
		const t = pgTable('tickets', {
			status: text().notNull(),
			a: integer().notNull(),
			b: integer().notNull(),
		}, (t) => [
			check('tickets_status_check', sql`${t.status} = ANY (ARRAY['open'::text, 'closed'::text])`),
			check('tickets_either_check', sql`${t.a} = 1 OR ${t.b} = 2`),
		]);
		const s = createInsertSchema(t);
		expect(issues(s, { status: 'x', a: 0, b: 0 })).toEqual([
			['status', 'Must be one of "open", "closed"'],
			['a', 'Must satisfy tickets_either_check'],
		]);
	});
});

const issues = (s: z.ZodType, v: unknown) => s.safeParse(v).error?.issues.map((i) => [i.path.join('.'), i.message]);

describe('table checks with any zod', () => {
	test('single-column table checks become field rules', () => {
		const messages = pgTable('messages', { body: text().notNull() }, (t) => [
			check(
				'messages_body_check',
				sql`((length(TRIM(BOTH FROM ${t.body})) >= 1) AND (length(TRIM(BOTH FROM ${t.body})) <= 4000))`,
			),
		]);
		const s = createInsertSchema(messages);
		expect(issues(s, { body: '  ' })).toEqual([
			['body', 'Must be at least 1 character, not counting leading or trailing spaces'],
		]);
		expect(s.shape.body.safeParse('x'.repeat(4001)).success).toBe(false);
	});

	test('a table with a check across columns still supports pick/omit/partial', () => {
		const events = pgTable('events', {
			startsAt: timestamp('starts_at').notNull(),
			endsAt: timestamp('ends_at').notNull(),
		}, (t) => [check('events_ends_after_starts', sql`${t.endsAt} > ${t.startsAt}`)]);
		const s = createInsertSchema(events);
		expect(() => s.omit({ startsAt: true }).pick({ endsAt: true }).partial()).not.toThrow();
	});
});
