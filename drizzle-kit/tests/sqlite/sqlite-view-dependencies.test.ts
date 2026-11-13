import { eq, exists, inArray, sql } from 'drizzle-orm';
import { alias, getViewConfig, integer, QueryBuilder, sqliteTable, sqliteView } from 'drizzle-orm/sqlite-core';
import type { SQLiteView } from 'drizzle-orm/sqlite-core';
import { fromDrizzleSchema } from 'src/dialects/sqlite/drizzle';
import { entityKey } from 'src/dialects/utils';
import { expect, test } from 'vitest';

const table = sqliteTable('t', { id: integer() });
const view1 = sqliteView('v1').as((qb) => qb.select().from(table));
const view2 = sqliteView('v2').as((qb) => qb.select().from(table));
const existingView = sqliteView('ex', { id: integer() }).existing();

const viewName = 'target';
const dependenciesOf = (target: SQLiteView) => {
	const { metadata } = fromDrizzleSchema([table], [view1, view2, existingView, target]);

	return metadata.viewDependencies.get(entityKey(null, viewName));
};

test('view dependencies: from view', () => {
	const target = sqliteView(viewName).as((qb) => qb.select().from(view1));

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(view1).name)]);
});

test('view dependencies: subquery in where', () => {
	const target = sqliteView(viewName).as((qb) =>
		qb.select().from(table).where(inArray(table.id, qb.select({ id: view2.id }).from(view2)))
	);

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(view2).name)]);
});

test('view dependencies: subquery in from', () => {
	const target = sqliteView(viewName).as((qb) => qb.select().from(qb.select().from(view1).as('sq')));

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(view1).name)]);
});

test('view dependencies: cte', () => {
	const target = sqliteView(viewName).as((qb) => {
		const w = qb.$with('w').as(qb.select().from(view2));
		return qb.with(w).select().from(w);
	});

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(view2).name)]);
});

test('view dependencies: view interpolated into raw sql', () => {
	const target = sqliteView(viewName, { id: integer() }).as(sql`select * from ${view1}`);

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(view1).name)]);
});

test('view dependencies: set operator', () => {
	const target = sqliteView(viewName).as((qb) => qb.select().from(view1).union(qb.select().from(view2)));

	expect(dependenciesOf(target)).toStrictEqual([
		entityKey(null, getViewConfig(view1).name),
		entityKey(null, getViewConfig(view2).name),
	]);
});

test('view dependencies: exists', () => {
	const target = sqliteView(viewName).as((qb) => qb.select().from(table).where(exists(qb.select().from(view1))));

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(view1).name)]);
});

test('view dependencies: subquery in select fields', () => {
	const target = sqliteView(viewName).as((qb) =>
		qb.select({ id: table.id, c: sql<number>`(${qb.select({ id: view1.id }).from(view1)})`.as('c') }).from(table)
	);

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(view1).name)]);
});

test('view dependencies: joined subquery', () => {
	const target = sqliteView(viewName).as((qb) =>
		qb.select({ id: table.id }).from(table).leftJoin(qb.select().from(view1).as('sq'), sql`true`)
	);

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(view1).name)]);
});

test('view dependencies: query builder instead of callback', () => {
	const target = sqliteView(viewName).as(new QueryBuilder().select().from(view1));

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(view1).name)]);
});

// existing views are kept as dependencies, sort skips them since they are not created
test('view dependencies: existing view in deps', () => {
	const target = sqliteView(viewName).as((qb) => qb.select().from(existingView));

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(existingView).name)]);
});

// existing parent view has no query, so it has no entry
test('view dependencies: existing parent view', () => {
	const target = sqliteView(viewName, {}).existing();

	expect(dependenciesOf(target)).toBeUndefined();
});

// unlike other dialects, sqlite keeps the joined view object in the sql tree
test('view dependencies: joined view', () => {
	const target = sqliteView(viewName).as((qb) =>
		qb.select({ id: table.id }).from(table).leftJoin(view1, eq(view1.id, table.id))
	);

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(view1).name)]);
});

test('view dependencies: cross joined view', () => {
	const target = sqliteView(viewName).as((qb) => qb.select({ id: table.id }).from(table).crossJoin(view1));

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(view1).name)]);
});

// TODO all below are enhancement
// aliased views in from are written as plain identifiers by sqlite dialect
test.skipIf(Date.now() < +new Date('2026-11-13'))('view dependencies: aliased view is not detected', () => {
	const target = sqliteView(viewName).as((qb) => qb.select().from(alias(view1, 'x')));

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(view1).name)]);
});
test.skipIf(Date.now() < +new Date('2026-11-13'))(
	'view dependencies: plain text name in raw sql is not detected',
	() => {
		const target = sqliteView(viewName, { id: integer() }).as(sql`select * from "v1"`);

		expect(dependenciesOf(target)).toStrictEqual([entityKey(null, 'v1')]);
	},
);
