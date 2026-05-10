import { expect, test } from 'vitest';
import { CodecsCollection } from '~/codecs';
import { Column } from '~/column';
import { is } from '~/entity';
import { nodePgCodecs } from '~/node-postgres/codecs';
import { date, pgTable, serial, timestamp } from '~/pg-core';
import { resolvePgTypeAlias } from '~/pg-core/codecs';
import { PgDialect } from '~/pg-core/dialect';
import { max, min } from '~/sql/functions/aggregate';
import { SQL } from '~/sql/sql';
import { orderSelectedFields } from '~/utils';

const table = pgTable('t', {
	id: serial().primaryKey().notNull(),
	ts: timestamp({ mode: 'date', withTimezone: true }),
	tsNoTz: timestamp({ mode: 'date', withTimezone: false }),
	tsString: timestamp({ mode: 'string' }),
	d: date({ mode: 'date' }),
	dString: date({ mode: 'string' }),
});

// Simulate the codec collection used by a real NodePgDatabase
const pgCodecs = new CodecsCollection(resolvePgTypeAlias, nodePgCodecs);

test('max(timestamptz) decoder is the column', () => {
	const expr = max(table.ts);
	expect(is(expr, SQL)).toBe(true);
	expect(expr.decoder).toBeInstanceOf(Column);
});

test('max(timestamp mode:date withTimezone) orderSelectedFields attaches normalize codec', () => {
	const fields = { maxTs: max(table.ts) };
	const ordered = orderSelectedFields(fields, undefined, pgCodecs);
	expect(ordered).toHaveLength(1);
	const entry = ordered[0]!;
	expect(entry.codec).toBeDefined();
	const result = (entry.codec as (v: any) => any)('2026-04-01 00:00:00+00');
	expect(result).toBeInstanceOf(Date);
});

test('min(timestamp mode:date withTimezone) orderSelectedFields attaches normalize codec', () => {
	const fields = { minTs: min(table.ts) };
	const ordered = orderSelectedFields(fields, undefined, pgCodecs);
	expect(ordered).toHaveLength(1);
	const entry = ordered[0]!;
	expect(entry.codec).toBeDefined();
	const result = (entry.codec as (v: any) => any)('2026-04-01 00:00:00+00');
	expect(result).toBeInstanceOf(Date);
});

test('max(timestamp mode:date no timezone) orderSelectedFields attaches normalize codec', () => {
	const fields = { maxTs: max(table.tsNoTz) };
	const ordered = orderSelectedFields(fields, undefined, pgCodecs);
	expect(ordered).toHaveLength(1);
	const entry = ordered[0]!;
	expect(entry.codec).toBeDefined();
	const result = (entry.codec as (v: any) => any)('2026-04-01 00:00:00');
	expect(result).toBeInstanceOf(Date);
});

test('max(timestamp mode:string) orderSelectedFields has no normalize codec', () => {
	const fields = { maxTs: max(table.tsString) };
	const ordered = orderSelectedFields(fields, undefined, pgCodecs);
	expect(ordered).toHaveLength(1);
	expect(ordered[0]!.codec).toBeUndefined();
});

test('max(date mode:date) orderSelectedFields attaches normalize codec', () => {
	const fields = { maxD: max(table.d) };
	const ordered = orderSelectedFields(fields, undefined, pgCodecs);
	expect(ordered).toHaveLength(1);
	const entry = ordered[0]!;
	expect(entry.codec).toBeDefined();
	const result = (entry.codec as (v: any) => any)('2026-04-01');
	expect(result).toBeInstanceOf(Date);
});

test('max(date mode:string) orderSelectedFields has no normalize codec', () => {
	const fields = { maxD: max(table.dString) };
	const ordered = orderSelectedFields(fields, undefined, pgCodecs);
	expect(ordered).toHaveLength(1);
	expect(ordered[0]!.codec).toBeUndefined();
});

test('PgDialect with nodePgCodecs: rows mapper decodes max(timestamptz) to Date', () => {
	const dialect = new PgDialect({ codecs: nodePgCodecs });
	const fields = { maxTs: max(table.ts) };
	const fieldsList = orderSelectedFields(fields, undefined, dialect.codecs);
	const mapper = dialect.mapperGenerators.rows(fieldsList, undefined);
	const [row] = mapper([['2026-04-01 00:00:00+00']] as any);
	expect(row?.maxTs).toBeInstanceOf(Date);
});

test('PgDialect with nodePgCodecs: rows mapper decodes max(timestamp no tz) to Date', () => {
	const dialect = new PgDialect({ codecs: nodePgCodecs });
	const fields = { maxTs: max(table.tsNoTz) };
	const fieldsList = orderSelectedFields(fields, undefined, dialect.codecs);
	const mapper = dialect.mapperGenerators.rows(fieldsList, undefined);
	const [row] = mapper([['2026-04-01 00:00:00']] as any);
	expect(row?.maxTs).toBeInstanceOf(Date);
});

test('PgDialect with nodePgCodecs: rows mapper decodes max(date mode:date) to Date', () => {
	const dialect = new PgDialect({ codecs: nodePgCodecs });
	const fields = { maxD: max(table.d) };
	const fieldsList = orderSelectedFields(fields, undefined, dialect.codecs);
	const mapper = dialect.mapperGenerators.rows(fieldsList, undefined);
	const [row] = mapper([['2026-04-01']] as any);
	expect(row?.maxD).toBeInstanceOf(Date);
});

test('PgDialect with nodePgCodecs: rows mapper returns string for max(timestamp mode:string)', () => {
	const dialect = new PgDialect({ codecs: nodePgCodecs });
	const fields = { maxTs: max(table.tsString) };
	const fieldsList = orderSelectedFields(fields, undefined, dialect.codecs);
	const mapper = dialect.mapperGenerators.rows(fieldsList, undefined);
	const [row] = mapper([['2026-04-01 00:00:00+00']] as any);
	expect(typeof row?.maxTs).toBe('string');
});

test('PgDialect with nodePgCodecs: rows mapper returns string for max(date mode:string)', () => {
	const dialect = new PgDialect({ codecs: nodePgCodecs });
	const fields = { maxD: max(table.dString) };
	const fieldsList = orderSelectedFields(fields, undefined, dialect.codecs);
	const mapper = dialect.mapperGenerators.rows(fieldsList, undefined);
	const [row] = mapper([['2026-04-01']] as any);
	expect(typeof row?.maxD).toBe('string');
});

test('SQL.Aliased: max(timestamptz).as() orderSelectedFields attaches normalize codec', () => {
	const fields = { maxTs: max(table.ts).as('maxTs') };
	const ordered = orderSelectedFields(fields, undefined, pgCodecs);
	expect(ordered).toHaveLength(1);
	const entry = ordered[0]!;
	expect(entry.codec).toBeDefined();
	const result = (entry.codec as (v: any) => any)('2026-04-01 00:00:00+00');
	expect(result).toBeInstanceOf(Date);
});

test('SQL.Aliased: PgDialect with nodePgCodecs rows mapper decodes max(timestamptz).as() to Date', () => {
	const dialect = new PgDialect({ codecs: nodePgCodecs });
	const fields = { maxTs: max(table.ts).as('maxTs') };
	const fieldsList = orderSelectedFields(fields, undefined, dialect.codecs);
	const mapper = dialect.mapperGenerators.rows(fieldsList, undefined);
	const [row] = mapper([['2026-04-01 00:00:00+00']] as any);
	expect(row?.maxTs).toBeInstanceOf(Date);
});
