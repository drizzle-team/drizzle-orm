import { boolean, doublePrecision, integer, pgComposite, pgSchema, pgTable, text } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import type { TestDatabase } from './mocks';
import { diff, prepareTestDatabase, push } from './mocks';

// @vitest-environment-options {"max-concurrency":1}
let _: TestDatabase;
let db: TestDatabase['db'];

beforeAll(async () => {
	_ = await prepareTestDatabase();
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

test('composite #1: create simple composite type', async () => {
	const to = {
		point: pgComposite('coord', {
			x: doublePrecision().notNull(),
			y: doublePrecision().notNull(),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const expected = [
		`CREATE TYPE "coord" AS ("x" double precision, "y" double precision);`,
	];
	expect(st).toStrictEqual(expected);
	expect(pst).toStrictEqual(expected);
});

test('composite #2: composite with mixed scalar fields', async () => {
	const to = {
		labeledPoint: pgComposite('labeled_point', {
			label: text().notNull(),
			x: doublePrecision().notNull(),
			y: doublePrecision().notNull(),
			visible: boolean(),
			score: integer(),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const expected = [
		`CREATE TYPE "labeled_point" AS ("label" text, "x" double precision, "y" double precision, "visible" boolean, "score" integer);`,
	];
	expect(st).toStrictEqual(expected);
	expect(pst).toStrictEqual(expected);
});

test('composite #3: schema-bound composite', async () => {
	const geom = pgSchema('geom');
	const to = {
		geom,
		point: geom.composite('coord', {
			x: doublePrecision().notNull(),
			y: doublePrecision().notNull(),
		}),
	};

	const { sqlStatements: st } = await diff({ geom }, to, []);
	await push({ db, to: { geom } });
	const { sqlStatements: pst } = await push({ db, to });

	const expected = [
		`CREATE TYPE "geom"."coord" AS ("x" double precision, "y" double precision);`,
	];
	expect(st).toStrictEqual(expected);
	expect(pst).toStrictEqual(expected);
});

test('composite #4: drop composite', async () => {
	const from = {
		point: pgComposite('coord', {
			x: doublePrecision().notNull(),
			y: doublePrecision().notNull(),
		}),
	};

	const { sqlStatements: st } = await diff(from, {}, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: {} });

	const expected = [`DROP TYPE "coord" CASCADE;`];
	expect(st).toStrictEqual(expected);
	expect(pst).toStrictEqual(expected);
});

test('composite #5: rename composite', async () => {
	const from = {
		point: pgComposite('coord', {
			x: doublePrecision().notNull(),
			y: doublePrecision().notNull(),
		}),
	};
	const to = {
		coordinate: pgComposite('coordinate', {
			x: doublePrecision().notNull(),
			y: doublePrecision().notNull(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, ['public.coord->public.coordinate']);

	expect(st).toStrictEqual([`ALTER TYPE "coord" RENAME TO "coordinate";`]);
});

test('composite #6: move composite to another schema', async () => {
	const geom = pgSchema('geom');
	const from = {
		geom,
		point: pgComposite('coord', {
			x: doublePrecision().notNull(),
			y: doublePrecision().notNull(),
		}),
	};
	const to = {
		geom,
		point: geom.composite('coord', {
			x: doublePrecision().notNull(),
			y: doublePrecision().notNull(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, ['public.coord->geom.coord']);

	expect(st).toStrictEqual([`ALTER TYPE "coord" SET SCHEMA "geom";`]);
});

test('composite #7: column with composite type', async () => {
	const point = pgComposite('coord', {
		x: doublePrecision().notNull(),
		y: doublePrecision().notNull(),
	});
	const to = {
		point,
		places: pgTable('places', {
			id: integer().primaryKey(),
			loc: point().notNull(),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	expect(st).toContain(`CREATE TYPE "coord" AS ("x" double precision, "y" double precision);`);
	expect(st.some((s) => s.includes('CREATE TABLE "places"'))).toBe(true);
	expect(st.some((s) => /"loc"\s+"?coord"?\s+NOT NULL/.test(s))).toBe(true);
	expect(pst).toStrictEqual(st);
});

test('composite #8: recreate when fields change', async () => {
	const from = {
		point: pgComposite('coord', {
			x: doublePrecision().notNull(),
			y: doublePrecision().notNull(),
		}),
	};
	const to = {
		point: pgComposite('coord', {
			x: doublePrecision().notNull(),
			y: doublePrecision().notNull(),
			z: doublePrecision().notNull(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	expect(st.some((s) => s.includes('DROP TYPE "coord"'))).toBe(true);
	expect(
		st.some((s) => s.includes('CREATE TYPE "coord"') && s.includes('"z" double precision')),
	).toBe(true);
});
