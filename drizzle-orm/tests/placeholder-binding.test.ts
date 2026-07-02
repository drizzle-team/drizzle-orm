import { expect, test } from 'vitest';
import { awsDataApiPgCodecs, AwsPgDialect } from '~/aws-data-api/pg';
import { is } from '~/entity';
import { pgEnum, pgTable, text, uuid } from '~/pg-core';
import { eq } from '~/sql/expressions/conditions';
import { Param, Placeholder, sql } from '~/sql/sql';

const status = pgEnum('status', ['idle', 'running', 'done']);

const tasks = pgTable('tasks', {
	id: uuid('id').primaryKey(),
	status: status('status').notNull(),
	label: text('label').notNull(),
});

const findParam = (condition: { queryChunks: unknown[] }): Param | undefined =>
	condition.queryChunks.find((c): c is Param => is(c, Param));

test('eq(col, sql.placeholder()) wraps Placeholder in Param with column encoder (uuid)', () => {
	const condition = eq(tasks.id, sql.placeholder('id'));
	const param = findParam(condition);
	expect(param).toBeDefined();
	expect(is(param!.value, Placeholder)).toBe(true);
	expect(param!.encoder).toBe(tasks.id);
});

test('eq(col, sql.placeholder()) wraps Placeholder for enum column', () => {
	const condition = eq(tasks.status, sql.placeholder('status'));
	const param = findParam(condition);
	expect(param).toBeDefined();
	expect(is(param!.value, Placeholder)).toBe(true);
	expect(param!.encoder).toBe(tasks.status);
});

test('eq(col, eager-value) still wraps value in Param (regression check)', () => {
	const condition = eq(tasks.id, '00000000-0000-0000-0000-000000000000');
	const param = findParam(condition);
	expect(param).toBeDefined();
	expect(is(param!.value, Placeholder)).toBe(false);
	expect(param!.encoder).toBe(tasks.id);
});

// AWS Data API end-to-end: with the bindIfParam fix in place, the codec system
// now sees a Param-with-Column-encoder for placeholder values and emits the
// correct ::cast SQL. Without the fix, the placeholder would be a bare chunk
// and the codec lookup would not run.
test('AwsPgDialect: enum placeholder triggers ::cast via codec', () => {
	const dialect = new AwsPgDialect({ codecs: awsDataApiPgCodecs });
	const query = dialect.sqlToQuery(eq(tasks.status, sql.placeholder('s')));
	// Codec for enum: castParam = (name, column) => `${name}::${column.getSQLType()}`
	expect(query.sql).toMatch(/:1::status/);
});

test('AwsPgDialect: uuid placeholder reaches the SQL builder as a Param', () => {
	// Without the bindIfParam fix, this would emit a bare placeholder with no
	// way for any codec or hook to act on it. With the fix, it's a Param whose
	// encoder is the column — codecs (or any future hook) can apply cast logic.
	const dialect = new AwsPgDialect({ codecs: awsDataApiPgCodecs });
	const query = dialect.sqlToQuery(eq(tasks.id, sql.placeholder('id')));
	expect(query.sql).toContain(':1');
	// Sanity: the eager equivalent emits the same shape (proving consistency)
	const eager = dialect.sqlToQuery(eq(tasks.id, '00000000-0000-0000-0000-000000000000'));
	expect(eager.sql).toContain(':1');
});
