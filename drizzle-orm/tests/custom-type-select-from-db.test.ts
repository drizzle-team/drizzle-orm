import Database from 'better-sqlite3';
import mysql from 'mysql2';
import postgres from 'postgres';
import { describe, expect, test } from 'vitest';
import { drizzle as drizzleSqlite } from '~/better-sqlite3';
import { alias as mysqlAlias, customType as mysqlCustomType, int, mysqlTable, text as mysqlText } from '~/mysql-core';
import { drizzle as drizzleMysql } from '~/mysql2';
import { alias as pgAlias, customType as pgCustomType, integer, pgTable, text as pgText } from '~/pg-core';
import { drizzle as drizzlePg } from '~/postgres-js';
import { relations } from '~/relations';
import { eq, sql } from '~/sql';
import {
	alias as sqliteAlias,
	customType as sqliteCustomType,
	integer as sqliteInteger,
	sqliteTable,
	text as sqliteText,
} from '~/sqlite-core';

/**
 * PostGIS-like point custom type (#1083 / #554).
 * Stored as geometry; always selected via ST_AsText so fromDriver gets WKT.
 */
type Point = { lat: number; lng: number };

function parsePointWkt(value: string): Point {
	const match = value.match(/POINT\((?<lng>[-\d.]+)\s+(?<lat>[-\d.]+)\)/i);
	if (!match?.groups) {
		throw new Error(`Unexpected geometry WKT: ${value}`);
	}
	return {
		lat: Number(match.groups.lat),
		lng: Number(match.groups.lng),
	};
}

const pgPoint = pgCustomType<{ data: Point; driverData: string }>({
	dataType() {
		return 'geometry(Point,4326)';
	},
	toDriver(value) {
		return `SRID=4326;POINT(${value.lng} ${value.lat})`;
	},
	fromDriver(value) {
		return parsePointWkt(value);
	},
	selectFromDb(columnRef) {
		return sql`st_astext(${columnRef})`;
	},
});

const pgPlain = pgCustomType<{ data: string }>({
	dataType() {
		return 'text';
	},
});

const location = pgTable('location', {
	id: integer('id').primaryKey(),
	name: pgText('name'),
	coords: pgPoint('coords'),
	notes: pgPlain('notes'),
});

const visit = pgTable('visit', {
	id: integer('id').primaryKey(),
	locationId: integer('location_id').notNull(),
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

const pgSchema = { location, visit, locationRelations, visitRelations };
const pgDb = drizzlePg(postgres(''), { schema: pgSchema });

describe('pg customType.selectFromDb (PostGIS-like point)', () => {
	test('full select wraps geometry and leaves plain custom untouched', () => {
		const { sql: query } = pgDb.select().from(location).toSQL();
		expect(query).toBe(
			'select "id", "name", st_astext("coords") as "coords", "notes" from "location"',
		);
	});

	test('partial select wraps only the geometry column', () => {
		const { sql: query } = pgDb.select({ coords: location.coords }).from(location).toSQL();
		expect(query).toBe('select st_astext("coords") as "coords" from "location"');
	});

	test('join keeps table-qualified refs inside the wrap', () => {
		const { sql: query } = pgDb
			.select()
			.from(visit)
			.innerJoin(location, eq(visit.locationId, location.id))
			.toSQL();
		expect(query).toContain('st_astext("location"."coords") as "coords"');
		expect(query).toContain('"location"."notes"');
	});

	test('table alias is preserved inside the wrap', () => {
		const l = pgAlias(location, 'l');
		const { sql: query } = pgDb
			.select({ coords: l.coords })
			.from(visit)
			.innerJoin(l, eq(visit.locationId, l.id))
			.toSQL();
		expect(query).toBe(
			'select st_astext("l"."coords") as "coords" from "visit" inner join "location" "l" on "visit"."location_id" = "l"."id"',
		);
	});

	test('insert/update/delete returning() apply the wrap', () => {
		expect(
			pgDb.insert(location).values({ id: 1, name: 'home', coords: { lat: 1, lng: 2 } }).returning().toSQL()
				.sql,
		).toContain('st_astext("coords") as "coords"');

		expect(
			pgDb.update(location).set({ name: 'work' }).returning({ coords: location.coords }).toSQL().sql,
		).toBe('update "location" set "name" = $1 returning st_astext("coords") as "coords"');

		expect(pgDb.delete(location).returning({ coords: location.coords }).toSQL().sql).toBe(
			'delete from "location" returning st_astext("coords") as "coords"',
		);
	});

	test('toDriver still serializes insert params (EWKT)', () => {
		const { params } = pgDb
			.insert(location)
			.values({ id: 1, name: 'home', coords: { lat: 59.9, lng: 10.7 } })
			.toSQL();
		expect(params).toContain('SRID=4326;POINT(10.7 59.9)');
	});

	test('fromDriver still parses WKT after selection wrap', () => {
		expect(location.coords.mapFromDriverValue('POINT(10.7 59.9)')).toEqual({ lat: 59.9, lng: 10.7 });
	});

	test('relational findMany applies the wrap', () => {
		const { sql: query } = pgDb.query.location.findMany().toSQL();
		expect(query).toContain('st_astext("coords") as "coords"');
	});

	test('relational findMany with nested relation still wraps the related geometry', () => {
		const { sql: query } = pgDb.query.visit.findMany({
			with: { location: true },
		}).toSQL();
		expect(query).toContain('st_astext(');
		expect(query).toContain('coords');
	});

	test('casing: snake_case applies to both reference and alias', () => {
		const camel = pgTable('camel', {
			id: integer().primaryKey(),
			homeCoords: pgPoint(),
		});
		const camelDb = drizzlePg(postgres(''), { casing: 'snake_case' });
		const { sql: query } = camelDb.select({ homeCoords: camel.homeCoords }).from(camel).toSQL();
		expect(query).toBe('select st_astext("home_coords") as "home_coords" from "camel"');
	});
});

const mysqlLower = mysqlCustomType<{ data: string; driverData: string }>({
	dataType() {
		return 'varchar(255)';
	},
	selectFromDb(columnRef) {
		return sql`lower(${columnRef})`;
	},
});

const mysqlUsers = mysqlTable('users', {
	id: int('id').primaryKey(),
	name: mysqlLower('name'),
	bio: mysqlText('bio'),
});

const mysqlDb = drizzleMysql(mysql.createPool({}));

describe('mysql customType.selectFromDb', () => {
	test('select wraps with lower() and aliases back', () => {
		const { sql: query } = mysqlDb.select().from(mysqlUsers).toSQL();
		expect(query).toBe('select `id`, lower(`name`) as `name`, `bio` from `users`');
	});

	test('join keeps qualified refs', () => {
		const posts = mysqlTable('posts', {
			id: int('id').primaryKey(),
			userId: int('user_id'),
		});
		const { sql: query } = mysqlDb
			.select({ name: mysqlUsers.name })
			.from(posts)
			.innerJoin(mysqlUsers, eq(posts.userId, mysqlUsers.id))
			.toSQL();
		expect(query).toBe(
			'select lower(`users`.`name`) as `name` from `posts` inner join `users` on `posts`.`user_id` = `users`.`id`',
		);
	});

	test('table alias is preserved inside joins', () => {
		const posts = mysqlTable('posts_alias', {
			id: int('id').primaryKey(),
			userId: int('user_id'),
		});
		const u = mysqlAlias(mysqlUsers, 'u');
		const { sql: query } = mysqlDb
			.select({ name: u.name })
			.from(posts)
			.innerJoin(u, eq(posts.userId, u.id))
			.toSQL();
		expect(query).toBe(
			'select lower(`u`.`name`) as `name` from `posts_alias` inner join `users` `u` on `posts_alias`.`user_id` = `u`.`id`',
		);
	});

	test('single-table alias stays unqualified (isSingleTable)', () => {
		const u = mysqlAlias(mysqlUsers, 'u');
		const { sql: query } = mysqlDb.select({ name: u.name }).from(u).toSQL();
		expect(query).toBe('select lower(`name`) as `name` from `users` `u`');
	});
});

const sqliteLower = sqliteCustomType<{ data: string; driverData: string }>({
	dataType() {
		return 'text';
	},
	selectFromDb(columnRef) {
		return sql`lower(${columnRef})`;
	},
});

const sqliteUsers = sqliteTable('users', {
	id: sqliteInteger('id').primaryKey(),
	name: sqliteLower('name'),
	bio: sqliteText('bio'),
});

const sqliteDb = drizzleSqlite(new Database(':memory:'));

describe('sqlite customType.selectFromDb', () => {
	test('select wraps with lower() and aliases back', () => {
		const { sql: query } = sqliteDb.select().from(sqliteUsers).toSQL();
		expect(query).toBe('select "id", lower("name") as "name", "bio" from "users"');
	});

	test('join keeps qualified refs', () => {
		const posts = sqliteTable('posts', {
			id: sqliteInteger('id').primaryKey(),
			userId: sqliteInteger('user_id'),
		});
		const { sql: query } = sqliteDb
			.select({ name: sqliteUsers.name })
			.from(posts)
			.innerJoin(sqliteUsers, eq(posts.userId, sqliteUsers.id))
			.toSQL();
		expect(query).toBe(
			'select lower("users"."name") as "name" from "posts" inner join "users" on "posts"."user_id" = "users"."id"',
		);
	});

	test('table alias is preserved inside joins', () => {
		const posts = sqliteTable('posts_alias', {
			id: sqliteInteger('id').primaryKey(),
			userId: sqliteInteger('user_id'),
		});
		const u = sqliteAlias(sqliteUsers, 'u');
		const { sql: query } = sqliteDb
			.select({ name: u.name })
			.from(posts)
			.innerJoin(u, eq(posts.userId, u.id))
			.toSQL();
		expect(query).toBe(
			'select lower("u"."name") as "name" from "posts_alias" inner join "users" "u" on "posts_alias"."user_id" = "u"."id"',
		);
	});

	test('single-table alias stays unqualified (isSingleTable)', () => {
		const u = sqliteAlias(sqliteUsers, 'u');
		const { sql: query } = sqliteDb.select({ name: u.name }).from(u).toSQL();
		expect(query).toBe('select lower("name") as "name" from "users" "u"');
	});

	test('returning() on insert applies the wrap', () => {
		const { sql: query } = sqliteDb
			.insert(sqliteUsers)
			.values({ id: 1, name: 'Ada' })
			.returning({ name: sqliteUsers.name })
			.toSQL();
		expect(query).toBe(
			'insert into "users" ("id", "name", "bio") values (?, ?, null) returning lower("name") as "name"',
		);
	});
});
