import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import { customType, integer, pgTable } from '~/pg-core';
import { drizzle } from '~/postgres-js';
import { sql } from '~/sql';

type Point = {
	lat: number;
	lng: number;
};

// A custom type that has to be read through `st_astext(...)`, mirroring the PostGIS
// geometry use case from https://github.com/drizzle-team/drizzle-orm/issues/1083
const pointType = customType<{ data: Point; driverData: string }>({
	dataType() {
		return 'geometry(Point,4326)';
	},
	toDriver(value: Point): string {
		return `SRID=4326;POINT(${value.lng} ${value.lat})`;
	},
	fromDriver(value: string): Point {
		const matches = value.match(/POINT\((?<lng>[\d.-]+) (?<lat>[\d.-]+)\)/);
		const { lat, lng } = matches?.groups ?? {};
		return { lat: Number.parseFloat(String(lat)), lng: Number.parseFloat(String(lng)) };
	},
	selectFromDb(identifier) {
		return sql`st_astext(${identifier})`;
	},
});

// A plain custom type (no `selectFromDb`) to make sure behaviour is unchanged when the
// option is omitted.
const plainCustom = customType<{ data: string; driverData: string }>({
	dataType() {
		return 'text';
	},
});

const location = pgTable('location', {
	id: integer('id').primaryKey(),
	coords: pointType('coords'),
	note: plainCustom('note'),
});

const other = pgTable('other', {
	id: integer('id').primaryKey(),
	locationId: integer('location_id'),
});

const db = drizzle(postgres(''));

describe('custom type selectFromDb', () => {
	it('wraps the column in custom SQL for a single-table select', () => {
		const query = db.select().from(location);

		expect(query.toSQL()).toEqual({
			sql: 'select "id", st_astext("coords"), "note" from "location"',
			params: [],
		});
	});

	it('wraps the table-qualified column in custom SQL when joins are present', () => {
		const query = db
			.select()
			.from(location)
			.leftJoin(other, sql`${other.locationId} = ${location.id}`);

		expect(query.toSQL()).toEqual({
			sql:
				'select "location"."id", st_astext("location"."coords"), "location"."note", "other"."id", "other"."location_id" from "location" left join "other" on "other"."location_id" = "location"."id"',
			params: [],
		});
	});

	it('leaves custom types without selectFromDb untouched', () => {
		const query = db.select({ note: location.note }).from(location);

		expect(query.toSQL()).toEqual({
			sql: 'select "note" from "location"',
			params: [],
		});
	});

	it('applies the transform in an insert ... returning clause', () => {
		const query = db
			.insert(location)
			.values({ id: 1, coords: { lat: 1, lng: 2 }, note: 'x' })
			.returning();

		expect(query.toSQL()).toEqual({
			sql:
				'insert into "location" ("id", "coords", "note") values ($1, $2, $3) returning "id", st_astext("coords"), "note"',
			params: [1, 'SRID=4326;POINT(2 1)', 'x'],
		});
	});
});
