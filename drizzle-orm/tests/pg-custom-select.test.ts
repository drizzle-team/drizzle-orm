import postgres from 'postgres';
import { expect, test } from 'vitest';
import { alias, customType, integer, pgTable, text } from '~/pg-core';
import { drizzle } from '~/postgres-js';
import { relations } from '~/relations';
import { eq, sql } from '~/sql';

type Point = { x: number; y: number };

const geometry = customType<{ data: Point; driverData: string }>({
	dataType() {
		return 'geometry(Point)';
	},
	toDriver(value) {
		return `point(${value.x} ${value.y})`;
	},
	fromDriver(value) {
		const [x, y] = value.slice('point('.length, -1).split(' ');
		return { x: Number(x), y: Number(y) };
	},
	selectFromDb(identifier) {
		return sql`st_astext(${identifier})`;
	},
});

const plainCustom = customType<{ data: string }>({
	dataType() {
		return 'text';
	},
});

const location = pgTable('location', {
	id: integer('id').primaryKey(),
	name: text('name'),
	coords: geometry('coords'),
	label: plainCustom('label'),
});

const visit = pgTable('visit', {
	id: integer('id').primaryKey(),
	locationId: integer('location_id'),
});

const locationRelations = relations(location, ({ many }) => ({
	visits: many(visit),
}));

const visitRelations = relations(visit, ({ one }) => ({
	location: one(location, {
		fields: [visit.locationId],
		references: [location.id],
	}),
}));

const schema = { location, visit, locationRelations, visitRelations };

const db = drizzle(postgres(''), { schema });

test('select() wraps the custom column and aliases it back to the column name', () => {
	const query = db.select().from(location).toSQL();

	expect(query.sql).toBe(
		'select "id", "name", st_astext("coords") as "coords", "label" from "location"',
	);
});

test('partial select() wraps the custom column', () => {
	const query = db.select({ coords: location.coords }).from(location).toSQL();

	expect(query.sql).toBe('select st_astext("coords") as "coords" from "location"');
});

test('join keeps the column reference qualified', () => {
	const query = db
		.select()
		.from(visit)
		.innerJoin(location, eq(visit.locationId, location.id))
		.toSQL();

	expect(query.sql).toBe(
		'select "visit"."id", "visit"."location_id", "location"."id", "location"."name", st_astext("location"."coords") as "coords", "location"."label" from "visit" inner join "location" on "visit"."location_id" = "location"."id"',
	);
});

test('aliased table keeps the alias in the wrapped reference', () => {
	const l = alias(location, 'l');
	const query = db
		.select({ coords: l.coords })
		.from(visit)
		.innerJoin(l, eq(visit.locationId, l.id))
		.toSQL();

	expect(query.sql).toBe(
		'select st_astext("l"."coords") as "coords" from "visit" inner join "location" "l" on "visit"."location_id" = "l"."id"',
	);
});

test('custom type without selectFromDb is not wrapped', () => {
	const query = db.select({ label: location.label }).from(location).toSQL();

	expect(query.sql).toBe('select "label" from "location"');
});

test('insert().returning() applies the wrap', () => {
	const query = db
		.insert(location)
		.values({ id: 1, name: 'home', coords: { x: 1, y: 2 } })
		.returning()
		.toSQL();

	expect(query.sql).toBe(
		'insert into "location" ("id", "name", "coords", "label") values ($1, $2, $3, default) returning "id", "name", st_astext("coords") as "coords", "label"',
	);
	expect(query.params).toStrictEqual([1, 'home', 'point(1 2)']);
});

test('update().returning() applies the wrap', () => {
	const query = db
		.update(location)
		.set({ name: 'work' })
		.where(eq(location.id, 1))
		.returning({ coords: location.coords })
		.toSQL();

	expect(query.sql).toBe(
		'update "location" set "name" = $1 where "location"."id" = $2 returning st_astext("coords") as "coords"',
	);
});

test('delete().returning() applies the wrap', () => {
	const query = db.delete(location).returning({ coords: location.coords }).toSQL();

	expect(query.sql).toBe('delete from "location" returning st_astext("coords") as "coords"');
});

test('relational query with columns: true applies the wrap', () => {
	const query = db.query.location.findMany().toSQL();

	// findMany with no joins is a single-table select, so the identifier is not table-qualified
	expect(query.sql).toContain('st_astext("coords") as "coords"');
});

test('casing is applied to both the reference and the alias', () => {
	const camel = pgTable('camel', {
		id: integer().primaryKey(),
		homeCoords: geometry(),
	});
	const camelDb = drizzle(postgres(''), { casing: 'snake_case' });

	const query = camelDb.select({ homeCoords: camel.homeCoords }).from(camel).toSQL();

	expect(query.sql).toBe('select st_astext("home_coords") as "home_coords" from "camel"');
});

test('the column decoder still runs on the wrapped value', () => {
	expect(location.coords.mapFromDriverValue('point(3 4)')).toStrictEqual({ x: 3, y: 4 });
});
