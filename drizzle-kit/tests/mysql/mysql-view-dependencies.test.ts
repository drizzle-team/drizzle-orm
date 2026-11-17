import { eq, exists, inArray, sql } from 'drizzle-orm';
import { alias, getViewConfig, int, mysqlTable, mysqlView, QueryBuilder } from 'drizzle-orm/mysql-core';
import type { MySqlView } from 'drizzle-orm/mysql-core';
import { fromDrizzleSchema } from 'src/dialects/mysql/drizzle';
import { entityKey } from 'src/dialects/utils';
import { expect, test } from 'vitest';

const table = mysqlTable('t', { id: int() });
const view1 = mysqlView('v1').as((qb) => qb.select().from(table));
const view2 = mysqlView('v2').as((qb) => qb.select().from(table));
const existingView = mysqlView('ex', { id: int() }).existing();

const viewName = 'target';
const dependenciesOf = (target: MySqlView) => {
	const { metadata } = fromDrizzleSchema([table], [view1, view2, existingView, target]);

	return metadata.viewDependencies.get(entityKey(null, viewName));
};

test('view dependencies: from view', () => {
	const target = mysqlView(viewName).as((qb) => qb.select().from(view1));

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(view1).name)]);
});

test('view dependencies: subquery in where', () => {
	const target = mysqlView(viewName).as((qb) =>
		qb.select().from(table).where(inArray(table.id, qb.select({ id: view2.id }).from(view2)))
	);

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(view2).name)]);
});

test('view dependencies: subquery in from', () => {
	const target = mysqlView(viewName).as((qb) => qb.select().from(qb.select().from(view1).as('sq')));

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(view1).name)]);
});

test('view dependencies: cte', () => {
	const target = mysqlView(viewName).as((qb) => {
		const w = qb.$with('w').as(qb.select().from(view2));
		return qb.with(w).select().from(w);
	});

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(view2).name)]);
});

test('view dependencies: view interpolated into raw sql', () => {
	const target = mysqlView(viewName, { id: int() }).as(sql`select * from ${view1}`);

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(view1).name)]);
});

test('view dependencies: set operator', () => {
	const target = mysqlView(viewName).as((qb) => qb.select().from(view1).union(qb.select().from(view2)));

	expect(dependenciesOf(target)).toStrictEqual([
		entityKey(null, getViewConfig(view1).name),
		entityKey(null, getViewConfig(view2).name),
	]);
});

test('view dependencies: exists', () => {
	const target = mysqlView(viewName).as((qb) => qb.select().from(table).where(exists(qb.select().from(view1))));

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(view1).name)]);
});

test('view dependencies: subquery in select fields', () => {
	const target = mysqlView(viewName).as((qb) =>
		qb.select({ id: table.id, c: sql<number>`(${qb.select({ id: view1.id }).from(view1)})`.as('c') }).from(table)
	);

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(view1).name)]);
});

test('view dependencies: joined subquery', () => {
	const target = mysqlView(viewName).as((qb) =>
		qb.select({ id: table.id }).from(table).leftJoin(qb.select().from(view1).as('sq'), sql`true`)
	);

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(view1).name)]);
});

test('view dependencies: lateral join', () => {
	const target = mysqlView(viewName).as((qb) =>
		qb.select({ id: table.id }).from(table).leftJoinLateral(qb.select().from(view1).as('sq'), sql`true`)
	);

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(view1).name)]);
});

test('view dependencies: query builder instead of callback', () => {
	const target = mysqlView(viewName).as(new QueryBuilder().select().from(view1));

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(view1).name)]);
});

// existing views are kept as dependencies, sort skips them since they are not created
test('view dependencies: existing view in deps', () => {
	const target = mysqlView(viewName).as((qb) => qb.select().from(existingView));

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(existingView).name)]);
});

// existing parent view is skipped in fromDrizzleSchema, so it has no entry
test('view dependencies: existing parent view', () => {
	const target = mysqlView(viewName, {}).existing();

	expect(dependenciesOf(target)).toBeUndefined();
});

// TODO all below are enhancement
// joined views are written as plain identifiers by mysql dialect, the view object is not in the sql tree
test.skipIf(Date.now() < +new Date('2026-11-13'))('view dependencies: joined view is not detected', () => {
	const target = mysqlView(viewName).as((qb) =>
		qb.select({ id: table.id }).from(table).leftJoin(view1, eq(view1.id, table.id))
	);

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(view1).name)]);
});
// aliased views in from are written as plain identifiers by mysql dialect
test.skipIf(Date.now() < +new Date('2026-11-13'))('view dependencies: aliased view is not detected', () => {
	const target = mysqlView(viewName).as((qb) => qb.select().from(alias(view1, 'x')));

	expect(dependenciesOf(target)).toStrictEqual([entityKey(null, getViewConfig(view1).name)]);
});
test.skipIf(Date.now() < +new Date('2026-11-13'))(
	'view dependencies: plain text name in raw sql is not detected',
	() => {
		const target = mysqlView(viewName, { id: int() }).as(sql`select * from \`v1\``);

		expect(dependenciesOf(target)).toStrictEqual([entityKey(null, 'v1')]);
	},
);
