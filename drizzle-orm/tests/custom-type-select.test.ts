import { describe, expect, it } from 'vitest';
import { sql, eq } from '~/sql';
import { customType as pgCustomType, pgTable, serial, text, QueryBuilder as PgQueryBuilder, alias } from '~/pg-core';
import { customType as mySqlCustomType, mysqlTable, int, varchar, QueryBuilder as MySqlQueryBuilder } from '~/mysql-core';
import { customType as sqliteCustomType, sqliteTable, integer as sqliteInt, text as sqliteText, QueryBuilder as SQLiteQueryBuilder } from '~/sqlite-core';

describe('customType selectFromDb hook', () => {
	describe('PostgreSQL', () => {
		type Point = { lat: number; lng: number };
		const customPoint = pgCustomType<{ data: Point; driverData: string }>({
			dataType() {
				return 'geometry(Point,4326)';
			},
			toDriver(value: Point): string {
				return `POINT(${value.lat} ${value.lng})`;
			},
			fromDriver(value: string): Point {
				const [lat, lng] = value.replace('POINT(', '').replace(')', '').split(' ').map(Number);
				return { lat: lat!, lng: lng! };
			},
			selectFromDb(column) {
				return sql`ST_AsGeoJSON(${column})`;
			},
		});

		const places = pgTable('places', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			geom: customPoint('geom').notNull(),
		});

		const cities = pgTable('cities', {
			id: serial('id').primaryKey(),
			city_name: text('city_name').notNull(),
		});

		const qb = new PgQueryBuilder();

		it('applies selectFromDb in single table select', () => {
			const query = qb.select().from(places).toSQL();
			expect(query.sql).toBe('select "id", "name", ST_AsGeoJSON("geom") as "geom" from "places"');
		});

		it('applies selectFromDb with table qualification in joined query', () => {
			const query = qb
				.select()
				.from(places)
				.leftJoin(cities, eq(places.id, cities.id))
				.toSQL();
			expect(query.sql).toBe(
				'select "places"."id", "places"."name", ST_AsGeoJSON("places"."geom") as "geom", "cities"."id", "cities"."city_name" from "places" left join "cities" on "places"."id" = "cities"."id"',
			);
		});

		it('works with table alias in single table and joined queries', () => {
			const p = alias(places, 'p');
			const singleQuery = qb.select().from(p).toSQL();
			expect(singleQuery.sql).toBe('select "id", "name", ST_AsGeoJSON("geom") as "geom" from "places" "p"');

			const joinedQuery = qb.select().from(p).leftJoin(cities, eq(p.id, cities.id)).toSQL();
			expect(joinedQuery.sql).toBe(
				'select "p"."id", "p"."name", ST_AsGeoJSON("p"."geom") as "geom", "cities"."id", "cities"."city_name" from "places" "p" left join "cities" on "p"."id" = "cities"."id"',
			);
		});
	});

	describe('MySQL', () => {
		type Point = { x: number; y: number };
		const customPointMySql = mySqlCustomType<{ data: Point; driverData: string }>({
			dataType() {
				return 'point';
			},
			toDriver(value: Point): string {
				return `POINT(${value.x} ${value.y})`;
			},
			fromDriver(value: string): Point {
				const [x, y] = value.replace('POINT(', '').replace(')', '').split(' ').map(Number);
				return { x: x!, y: y! };
			},
			selectFromDb(column) {
				return sql`ST_AsText(${column})`;
			},
		});

		const myPlaces = mysqlTable('my_places', {
			id: int('id').primaryKey(),
			title: varchar('title', { length: 255 }).notNull(),
			location: customPointMySql('location').notNull(),
		});

		const qbMySql = new MySqlQueryBuilder();

		it('applies selectFromDb in MySQL select', () => {
			const query = qbMySql.select().from(myPlaces).toSQL();
			expect(query.sql).toBe('select `id`, `title`, ST_AsText(`location`) as `location` from `my_places`');
		});
	});

	describe('SQLite', () => {
		type Meta = { tags: string[] };
		const customJson = sqliteCustomType<{ data: Meta; driverData: string }>({
			dataType() {
				return 'text';
			},
			toDriver(value: Meta): string {
				return JSON.stringify(value);
			},
			fromDriver(value: string): Meta {
				return JSON.parse(value);
			},
			selectFromDb(column) {
				return sql`json_extract(${column}, '$')`;
			},
		});

		const sqArticles = sqliteTable('articles', {
			id: sqliteInt('id').primaryKey(),
			title: sqliteText('title').notNull(),
			meta: customJson('meta'),
		});

		const qbSqlite = new SQLiteQueryBuilder();

		it('applies selectFromDb in SQLite single table select', () => {
			const query = qbSqlite.select().from(sqArticles).toSQL();
			expect(query.sql).toBe('select "id", "title", json_extract("meta", \'$\') as "meta" from "articles"');
		});
	});
});
