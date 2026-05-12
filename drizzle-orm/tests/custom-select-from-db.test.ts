import postgres from 'postgres';
import { describe, it } from 'vitest';
import { customType as gelCustomType, gelTable, integer as gelInteger } from '~/gel-core';
import { QueryBuilder as GelQueryBuilder } from '~/gel-core/query-builders/query-builder.ts';
import { customType as mysqlCustomType, int, mysqlTable } from '~/mysql-core';
import { QueryBuilder as MySqlQueryBuilder } from '~/mysql-core/query-builders/query-builder.ts';
import { customType as pgCustomType, integer, pgTable } from '~/pg-core';
import { QueryBuilder as PgQueryBuilder } from '~/pg-core/query-builders/query-builder.ts';
import { drizzle } from '~/postgres-js';
import { relations } from '~/relations';
import { customType as singlestoreCustomType, int as singlestoreInt, singlestoreTable } from '~/singlestore-core';
import { QueryBuilder as SingleStoreQueryBuilder } from '~/singlestore-core/query-builders/query-builder.ts';
import { sql } from '~/sql/sql.ts';
import { customType as sqliteCustomType, integer as sqliteInteger, sqliteTable } from '~/sqlite-core';
import { QueryBuilder as SQLiteQueryBuilder } from '~/sqlite-core/query-builders/query-builder.ts';
import { mapResultRow } from '~/utils.ts';

type Point = {
	lat: number;
	lng: number;
};

function parsePoint(value: string): Point {
	const [, lng, lat] = /POINT\(([\d.-]+) ([\d.-]+)\)/.exec(value)!;
	return { lat: Number(lat), lng: Number(lng) };
}

const pgPoint = pgCustomType<{ data: Point; driverData: string }>({
	dataType: () => 'geometry(Point,4326)',
	fromDriver: parsePoint,
	selectFromDb: (column, decoder, columnName) => sql`st_astext(${column})`.mapWith(decoder).as(columnName),
});

const mysqlPoint = mysqlCustomType<{ data: Point; driverData: string }>({
	dataType: () => 'geometry',
	fromDriver: parsePoint,
	selectFromDb: (column, decoder, columnName) => sql`st_astext(${column})`.mapWith(decoder).as(columnName),
});

const sqlitePoint = sqliteCustomType<{ data: Point; driverData: string }>({
	dataType: () => 'text',
	fromDriver: parsePoint,
	selectFromDb: (column, decoder, columnName) => sql`astext(${column})`.mapWith(decoder).as(columnName),
});

const singlestorePoint = singlestoreCustomType<{ data: Point; driverData: string }>({
	dataType: () => 'geography',
	fromDriver: parsePoint,
	selectFromDb: (column, decoder, columnName) => sql`geography_to_text(${column})`.mapWith(decoder).as(columnName),
});

const gelPoint = gelCustomType<{ data: Point; driverData: string }>({
	dataType: () => 'str',
	fromDriver: parsePoint,
	selectFromDb: (column, decoder, columnName) => sql`to_str(${column})`.mapWith(decoder).as(columnName),
});

const pgLocations = pgTable('locations', {
	id: integer('id'),
	userId: integer('user_id'),
	coords: pgPoint('coords'),
});

const pgUsers = pgTable('users', {
	id: integer('id'),
});

const pgUsersRelations = relations(pgUsers, ({ many }) => ({
	locations: many(pgLocations),
}));

const pgLocationsRelations = relations(pgLocations, ({ one }) => ({
	user: one(pgUsers, {
		fields: [pgLocations.userId],
		references: [pgUsers.id],
	}),
}));

const mysqlLocations = mysqlTable('locations', {
	id: int('id'),
	coords: mysqlPoint('coords'),
});

const sqliteLocations = sqliteTable('locations', {
	id: sqliteInteger('id'),
	coords: sqlitePoint('coords'),
});

const singlestoreLocations = singlestoreTable('locations', {
	id: singlestoreInt('id'),
	coords: singlestorePoint('coords'),
});

const gelLocations = gelTable('locations', {
	id: gelInteger('id'),
	coords: gelPoint('coords'),
});

describe('custom type selectFromDb', () => {
	it('wraps selected custom columns for each SQL dialect', ({ expect }) => {
		expect(new PgQueryBuilder().select({ coords: pgLocations.coords }).from(pgLocations).toSQL()).toEqual({
			sql: 'select st_astext("coords") as "coords" from "locations"',
			params: [],
		});

		expect(new MySqlQueryBuilder().select({ coords: mysqlLocations.coords }).from(mysqlLocations).toSQL()).toEqual({
			sql: 'select st_astext(`coords`) as `coords` from `locations`',
			params: [],
		});

		expect(new SQLiteQueryBuilder().select({ coords: sqliteLocations.coords }).from(sqliteLocations).toSQL()).toEqual({
			sql: 'select astext("coords") as "coords" from "locations"',
			params: [],
		});

		expect(
			new SingleStoreQueryBuilder().select({ coords: singlestoreLocations.coords }).from(singlestoreLocations).toSQL(),
		).toEqual({
			sql: 'select geography_to_text(`coords`) as `coords` from `locations`',
			params: [],
		});

		expect(new GelQueryBuilder().select({ coords: gelLocations.coords }).from(gelLocations).toSQL()).toEqual({
			sql: 'select to_str("locations"."coords") as "coords" from "locations"',
			params: [],
		});
	});

	it('keeps the custom column decoder for wrapped selects', ({ expect }) => {
		expect(
			mapResultRow([{ path: ['coords'], field: pgLocations.coords }], ['POINT(30 50)'], undefined),
		).toEqual({
			coords: { lat: 50, lng: 30 },
		});
	});

	it('wraps custom columns selected through relational query columns', ({ expect }) => {
		const db = drizzle(postgres(''), {
			schema: { pgUsers, pgUsersRelations, pgLocations, pgLocationsRelations },
		});

		const query = db.query.pgUsers.findMany({
			columns: {
				id: true,
			},
			with: {
				locations: {
					columns: {
						coords: true,
					},
				},
			},
		});

		expect(query.toSQL()).toEqual({
			sql:
				'select "pgUsers"."id", "pgUsers_locations"."data" as "locations" from "users" "pgUsers" left join lateral (select coalesce(json_agg(json_build_array(st_astext("pgUsers_locations"."coords"))), \'[]\'::json) as "data" from "locations" "pgUsers_locations" where "pgUsers_locations"."user_id" = "pgUsers"."id") "pgUsers_locations" on true',
			params: [],
		});
	});
});
