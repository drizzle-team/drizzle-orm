import { eq, exists, inArray, sql } from 'drizzle-orm';
import {
	alias,
	cockroachMaterializedView,
	cockroachSchema,
	cockroachTable,
	cockroachView,
	getMaterializedViewConfig,
	getViewConfig,
	int4,
	QueryBuilder,
} from 'drizzle-orm/cockroach-core';
import type { CockroachView } from 'drizzle-orm/cockroach-core';
import { fromDrizzleSchema } from 'src/dialects/cockroach/drizzle';
import { entityKey } from 'src/dialects/utils';
import { expect, test } from 'vitest';

const table = cockroachTable('t', { id: int4() });
const schema = cockroachSchema('s');
const view1 = cockroachView('v1').as((qb) => qb.select().from(table));
const view2 = cockroachView('v2').as((qb) => qb.select().from(table));
const matView = cockroachMaterializedView('mv').as((qb) => qb.select().from(table));
const schemaView = schema.view('sv').as((qb) => qb.select().from(table));
const existingView = cockroachView('ex', { id: int4() }).existing();

const viewName = 'target';
const dependenciesOf = (target: CockroachView) => {
	const { metadata } = fromDrizzleSchema({
		schemas: [schema],
		tables: [table],
		enums: [],
		sequences: [],
		roles: [],
		policies: [],
		views: [view1, view2, schemaView, existingView, target],
		matViews: [matView],
	}, () => true);

	return metadata.viewDependencies.get(entityKey('public', viewName));
};

test('view dependencies: from view', () => {
	const target = cockroachView(viewName).as((qb) => qb.select().from(view1));

	expect(dependenciesOf(target)).toStrictEqual([entityKey('public', getViewConfig(view1).name)]);
});

test('view dependencies: subquery in where', () => {
	const target = cockroachView(viewName).as((qb) =>
		qb.select().from(table).where(inArray(table.id, qb.select({ id: view2.id }).from(view2)))
	);

	expect(dependenciesOf(target)).toStrictEqual([entityKey('public', getViewConfig(view2).name)]);
});

test('view dependencies: subquery in from', () => {
	const target = cockroachView(viewName).as((qb) => qb.select().from(qb.select().from(view1).as('sq')));

	expect(dependenciesOf(target)).toStrictEqual([entityKey('public', getViewConfig(view1).name)]);
});

test('view dependencies: cte', () => {
	const target = cockroachView(viewName).as((qb) => {
		const w = qb.$with('w').as(qb.select().from(view2));
		return qb.with(w).select().from(w);
	});

	expect(dependenciesOf(target)).toStrictEqual([entityKey('public', getViewConfig(view2).name)]);
});

test('view dependencies: views interpolated into raw sql', () => {
	const target = cockroachView(viewName, { id: int4() }).as(sql`select * from ${view1} join ${matView} on true`);

	expect(dependenciesOf(target)).toStrictEqual([
		entityKey('public', getViewConfig(view1).name),
		entityKey('public', getMaterializedViewConfig(matView).name),
	]);
});

test('view dependencies: materialized view', () => {
	const target = cockroachView(viewName).as((qb) => qb.select().from(matView));

	expect(dependenciesOf(target)).toStrictEqual([entityKey('public', getMaterializedViewConfig(matView).name)]);
});

test('view dependencies: view in another schema', () => {
	const target = cockroachView(viewName).as((qb) => qb.select().from(schemaView));

	expect(dependenciesOf(target)).toStrictEqual([entityKey(schema.schemaName, getViewConfig(schemaView).name)]);
});

test('view dependencies: set operator', () => {
	const target = cockroachView(viewName).as((qb) => qb.select().from(view1).union(qb.select().from(view2)));

	expect(dependenciesOf(target)).toStrictEqual([
		entityKey('public', getViewConfig(view1).name),
		entityKey('public', getViewConfig(view2).name),
	]);
});

test('view dependencies: exists', () => {
	const target = cockroachView(viewName).as((qb) => qb.select().from(table).where(exists(qb.select().from(view1))));

	expect(dependenciesOf(target)).toStrictEqual([entityKey('public', getViewConfig(view1).name)]);
});

test('view dependencies: subquery in select fields', () => {
	const target = cockroachView(viewName).as((qb) =>
		qb.select({ id: table.id, c: sql<number>`(${qb.select({ id: view1.id }).from(view1)})`.as('c') }).from(table)
	);

	expect(dependenciesOf(target)).toStrictEqual([entityKey('public', getViewConfig(view1).name)]);
});

test('view dependencies: joined subquery', () => {
	const target = cockroachView(viewName).as((qb) =>
		qb.select({ id: table.id }).from(table).leftJoin(qb.select().from(view1).as('sq'), sql`true`)
	);

	expect(dependenciesOf(target)).toStrictEqual([entityKey('public', getViewConfig(view1).name)]);
});

test('view dependencies: lateral join', () => {
	const target = cockroachView(viewName).as((qb) =>
		qb.select({ id: table.id }).from(table).leftJoinLateral(qb.select().from(view1).as('sq'), sql`true`)
	);

	expect(dependenciesOf(target)).toStrictEqual([entityKey('public', getViewConfig(view1).name)]);
});

test('view dependencies: query builder instead of callback', () => {
	const target = cockroachView(viewName).as(new QueryBuilder().select().from(view1));

	expect(dependenciesOf(target)).toStrictEqual([entityKey('public', getViewConfig(view1).name)]);
});

// existing views are kept as dependencies, sort skips them since they are not created
test('view dependencies: existing view in deps', () => {
	const target = cockroachView(viewName).as((qb) => qb.select().from(existingView));

	expect(dependenciesOf(target)).toStrictEqual([entityKey('public', getViewConfig(existingView).name)]);
});

// existing parent view is skipped in fromDrizzleSchema, so it has no entry
test('view dependencies: existing parent view', () => {
	const target = cockroachView(viewName, {}).existing();

	expect(dependenciesOf(target)).toBeUndefined();
});

// TODO all below are enhancement
// joined views are written as plain identifiers by cockroach dialect, the view object is not in the sql tree
test.skipIf(Date.now() < +new Date('2026-11-13'))('view dependencies: joined view is not detected', () => {
	const target = cockroachView(viewName).as((qb) =>
		qb.select({ id: table.id }).from(table).leftJoin(view1, eq(view1.id, table.id))
	);

	expect(dependenciesOf(target)).toStrictEqual([entityKey('public', getViewConfig(view1).name)]);
});
// aliased views in from are written as plain identifiers by cockroach dialect
test.skipIf(Date.now() < +new Date('2026-11-13'))('view dependencies: aliased view is not detected', () => {
	const target = cockroachView(viewName).as((qb) => qb.select().from(alias(view1, 'x')));

	expect(dependenciesOf(target)).toStrictEqual([entityKey('public', getViewConfig(view1).name)]);
});
test.skipIf(Date.now() < +new Date('2026-11-13'))(
	'view dependencies: plain text name in raw sql is not detected',
	() => {
		const target = cockroachView(viewName, { id: int4() }).as(sql`select * from "v1"`);

		expect(dependenciesOf(target)).toStrictEqual([entityKey('public', 'v1')]);
	},
);
