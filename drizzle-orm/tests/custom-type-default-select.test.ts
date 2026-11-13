import { Client } from '@planetscale/database';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import { GelDialect } from '~/gel-core';
import { customType as gelCustomType, gelTable, integer as gelInteger } from '~/gel-core';
import { alias as mysqlAlias, customType as mysqlCustomType, int as mysqlInt, mysqlTable, serial as mysqlSerial, text as mysqlText } from '~/mysql-core';
import { alias as pgAlias, customType as pgCustomType, integer as pgInteger, pgTable, serial as pgSerial, text as pgText } from '~/pg-core';
import { drizzle as planetscale } from '~/planetscale-serverless';
import { drizzle as pgDrizzle } from '~/postgres-js';
import { relations } from '~/relations';
import { eq, sql } from '~/sql';
import { alias as sqliteAlias, customType as sqliteCustomType, integer as sqliteInteger, sqliteTable, text as sqliteText } from '~/sqlite-core';
import { drizzle as sqliteProxy } from '~/sqlite-proxy';

describe('customType selectFromDb', () => {
	describe('PostgreSQL', () => {
		type Point = { x: number; y: number };

		const customPoint = pgCustomType<{ data: Point; driverData: string }>({
			dataType() {
				return 'geometry(Point, 4326)';
			},
			toDriver(value: Point) {
				return `POINT(${value.x} ${value.y})`;
			},
			fromDriver(value: string) {
				const match = value.match(/POINT\(([\d.-]+)\s+([\d.-]+)\)/);
				return match ? { x: parseFloat(match[1]!), y: parseFloat(match[2]!) } : { x: 0, y: 0 };
			},
			selectFromDb(column, decoder) {
				return sql<Point>`st_astext(${sql.identifier(column)})`.mapWith(decoder).as(column);
			},
		});

		const customLower = pgCustomType<{ data: string }>({
			dataType() {
				return 'text';
			},
			selectFromDb(column, decoder) {
				// returning un-aliased SQL chunk
				return sql<string>`lower(${sql.identifier(column)})`.mapWith(decoder);
			},
		});

		const cities = pgTable('cities', {
			id: pgSerial('id').primaryKey(),
			name: pgText('name').notNull(),
		});

		const locations = pgTable('locations', {
			id: pgSerial('id').primaryKey(),
			coords: customPoint('coords').notNull(),
			code: customLower('code'),
			cityId: pgInteger('city_id').references(() => cities.id),
		});

		const citiesRelations = relations(cities, ({ many }) => ({
			locations: many(locations),
		}));

		const locationsRelations = relations(locations, ({ one }) => ({
			city: one(cities, {
				fields: [locations.cityId],
				references: [cities.id],
			}),
		}));

		const schema = { cities, locations, citiesRelations, locationsRelations };
		const db = pgDrizzle(postgres(''), { schema });

		it('single table select * uses selectFromDb', () => {
			const query = db.select().from(locations);
			expect(query.toSQL()).toEqual({
				sql: 'select "id", st_astext("coords") as "coords", lower("code") as "code", "city_id" from "locations"',
				params: [],
			});
		});

		it('single table partial select uses selectFromDb', () => {
			const query = db.select({ coords: locations.coords, id: locations.id }).from(locations);
			expect(query.toSQL()).toEqual({
				sql: 'select st_astext("coords") as "coords", "id" from "locations"',
				params: [],
			});
		});

		it('single table partial select with alias', () => {
			const query = db.select({ myPoint: locations.coords }).from(locations);
			expect(query.toSQL()).toEqual({
				sql: 'select st_astext("coords") as "coords" from "locations"',
				params: [],
			});
		});

		it('joins qualify column inside selectFromDb', () => {
			const query = db
				.select()
				.from(locations)
				.leftJoin(cities, eq(locations.cityId, cities.id));

			expect(query.toSQL()).toEqual({
				sql: 'select "locations"."id", st_astext("locations"."coords") as "coords", lower("locations"."code") as "code", "locations"."city_id", "cities"."id", "cities"."name" from "locations" left join "cities" on "locations"."city_id" = "cities"."id"',
				params: [],
			});
		});

		it('aliased table in single table query uses unprefixed column in selectFromDb', () => {
			const loc = pgAlias(locations, 'loc');
			const query = db.select().from(loc);

			expect(query.toSQL()).toEqual({
				sql: 'select "id", st_astext("coords") as "coords", lower("code") as "code", "city_id" from "locations" "loc"',
				params: [],
			});
		});

		it('aliased table in join uses table alias in selectFromDb', () => {
			const loc = pgAlias(locations, 'loc');
			const query = db.select().from(loc).leftJoin(cities, eq(loc.cityId, cities.id));

			expect(query.toSQL()).toEqual({
				sql: 'select "loc"."id", st_astext("loc"."coords") as "coords", lower("loc"."code") as "code", "loc"."city_id", "cities"."id", "cities"."name" from "locations" "loc" left join "cities" on "loc"."city_id" = "cities"."id"',
				params: [],
			});
		});

		it('insert returning uses selectFromDb', () => {
			const query = db
				.insert(locations)
				.values({ coords: { x: 10, y: 20 }, code: 'ABC' })
				.returning();

			expect(query.toSQL()).toEqual({
				sql: 'insert into "locations" ("id", "coords", "code", "city_id") values (default, $1, $2, default) returning "id", st_astext("coords") as "coords", lower("code") as "code", "city_id"',
				params: ['POINT(10 20)', 'ABC'],
			});
		});

		it('update returning uses selectFromDb', () => {
			const query = db
				.update(locations)
				.set({ coords: { x: 30, y: 40 } })
				.where(eq(locations.id, 1))
				.returning();

			expect(query.toSQL()).toEqual({
				sql: 'update "locations" set "coords" = $1 where "locations"."id" = $2 returning "id", st_astext("coords") as "coords", lower("code") as "code", "city_id"',
				params: ['POINT(30 40)', 1],
			});
		});

		it('relational query findMany on table with customType uses selectFromDb', () => {
			const query = db.query.locations.findMany();

			expect(query.toSQL()).toEqual({
				sql: 'select "id", st_astext("coords") as "coords", lower("code") as "code", "city_id" from "locations" "locations"',
				params: [],
			});
		});

		it('relational query nested relation uses selectFromDb in json_build_array', () => {
			const query = db.query.cities.findMany({
				with: {
					locations: true,
				},
			});

			expect(query.toSQL().sql).toBe(
				'select "cities"."id", "cities"."name", "cities_locations"."data" as "locations" from "cities" "cities" left join lateral (select coalesce(json_agg(json_build_array("cities_locations"."id", st_astext("cities_locations"."coords"), lower("cities_locations"."code"), "cities_locations"."city_id")), \'[]\'::json) as "data" from "locations" "cities_locations" where "cities_locations"."city_id" = "cities"."id") "cities_locations" on true',
			);
		});

		it('decoder mapFromDriverValue and mapToDriverValue work properly', () => {
			expect(locations.coords.mapToDriverValue({ x: 1.5, y: 2.5 })).toBe('POINT(1.5 2.5)');
			expect(locations.coords.mapFromDriverValue('POINT(1.5 2.5)')).toEqual({ x: 1.5, y: 2.5 });
		});
	});

	describe('MySQL', () => {
		const customLower = mysqlCustomType<{ data: string }>({
			dataType() {
				return 'varchar(255)';
			},
			selectFromDb(column, decoder) {
				return sql<string>`lower(${sql.identifier(column)})`.mapWith(decoder).as(column);
			},
		});

		const categories = mysqlTable('categories', {
			id: mysqlSerial('id').primaryKey(),
			name: mysqlText('name').notNull(),
		});

		const items = mysqlTable('items', {
			id: mysqlSerial('id').primaryKey(),
			code: customLower('code').notNull(),
			categoryId: mysqlInt('category_id').references(() => categories.id),
		});

		const categoriesRelations = relations(categories, ({ many }) => ({
			items: many(items),
		}));

		const itemsRelations = relations(items, ({ one }) => ({
			category: one(categories, {
				fields: [items.categoryId],
				references: [categories.id],
			}),
		}));

		const schema = { categories, items, categoriesRelations, itemsRelations };
		const db = planetscale(new Client({}), { schema });

		it('single table select * uses selectFromDb', () => {
			const query = db.select().from(items);
			expect(query.toSQL()).toEqual({
				sql: 'select `id`, lower(`code`) as `code`, `category_id` from `items`',
				params: [],
			});
		});

		it('joins qualify column inside selectFromDb', () => {
			const query = db
				.select()
				.from(items)
				.leftJoin(categories, eq(items.categoryId, categories.id));

			expect(query.toSQL()).toEqual({
				sql: 'select `items`.`id`, lower(`items`.`code`) as `code`, `items`.`category_id`, `categories`.`id`, `categories`.`name` from `items` left join `categories` on `items`.`category_id` = `categories`.`id`',
				params: [],
			});
		});

		it('aliased table in single table uses unprefixed column in selectFromDb', () => {
			const itm = mysqlAlias(items, 'itm');
			const query = db.select().from(itm);

			expect(query.toSQL()).toEqual({
				sql: 'select `id`, lower(`code`) as `code`, `category_id` from `items` `itm`',
				params: [],
			});
		});

		it('aliased table in join uses table alias in selectFromDb', () => {
			const itm = mysqlAlias(items, 'itm');
			const query = db.select().from(itm).leftJoin(categories, eq(itm.categoryId, categories.id));

			expect(query.toSQL()).toEqual({
				sql: 'select `itm`.`id`, lower(`itm`.`code`) as `code`, `itm`.`category_id`, `categories`.`id`, `categories`.`name` from `items` `itm` left join `categories` on `itm`.`category_id` = `categories`.`id`',
				params: [],
			});
		});

		it('relational query nested relation uses selectFromDb in json_array', () => {
			const query = db.query.categories.findMany({
				with: {
					items: true,
				},
			});

			expect(query.toSQL().sql).toBe(
				'select `id`, `name`, coalesce((select json_arrayagg(json_array(`id`, lower(`categories_items`.`code`), `category_id`)) from `items` `categories_items` where `categories_items`.`category_id` = `categories`.`id`), json_array()) as `items` from `categories` `categories`',
			);
		});
	});

	describe('SQLite', () => {
		const customLower = sqliteCustomType<{ data: string }>({
			dataType() {
				return 'text';
			},
			selectFromDb(column, decoder) {
				return sql<string>`lower(${sql.identifier(column)})`.mapWith(decoder).as(column);
			},
		});

		const categories = sqliteTable('categories', {
			id: sqliteInteger('id').primaryKey({ autoIncrement: true }),
			name: sqliteText('name').notNull(),
		});

		const items = sqliteTable('items', {
			id: sqliteInteger('id').primaryKey({ autoIncrement: true }),
			code: customLower('code').notNull(),
			categoryId: sqliteInteger('category_id').references(() => categories.id),
		});

		const categoriesRelations = relations(categories, ({ many }) => ({
			items: many(items),
		}));

		const itemsRelations = relations(items, ({ one }) => ({
			category: one(categories, {
				fields: [items.categoryId],
				references: [categories.id],
			}),
		}));

		const schema = { categories, items, categoriesRelations, itemsRelations };
		const db = sqliteProxy(async () => ({ rows: [] }), { schema });

		it('single table select * uses selectFromDb', () => {
			const query = db.select().from(items);
			expect(query.toSQL()).toEqual({
				sql: 'select "id", lower("code") as "code", "category_id" from "items"',
				params: [],
			});
		});

		it('joins qualify column inside selectFromDb', () => {
			const query = db
				.select()
				.from(items)
				.leftJoin(categories, eq(items.categoryId, categories.id));

			expect(query.toSQL()).toEqual({
				sql: 'select "items"."id", lower("items"."code") as "code", "items"."category_id", "categories"."id", "categories"."name" from "items" left join "categories" on "items"."category_id" = "categories"."id"',
				params: [],
			});
		});

		it('aliased table in single table query uses unprefixed column in selectFromDb', () => {
			const itm = sqliteAlias(items, 'itm');
			const query = db.select().from(itm);

			expect(query.toSQL()).toEqual({
				sql: 'select "id", lower("code") as "code", "category_id" from "items" "itm"',
				params: [],
			});
		});

		it('aliased table in join uses table alias in selectFromDb', () => {
			const itm = sqliteAlias(items, 'itm');
			const query = db.select().from(itm).leftJoin(categories, eq(itm.categoryId, categories.id));

			expect(query.toSQL()).toEqual({
				sql: 'select "itm"."id", lower("itm"."code") as "code", "itm"."category_id", "categories"."id", "categories"."name" from "items" "itm" left join "categories" on "itm"."category_id" = "categories"."id"',
				params: [],
			});
		});

		it('relational query nested relation uses selectFromDb in json_array', () => {
			const query = db.query.categories.findMany({
				with: {
					items: true,
				},
			});

			expect(query.toSQL().sql).toBe(
				'select "id", "name", (select coalesce(json_group_array(json_array("id", lower("categories_items"."code"), "category_id")), json_array()) as "data" from "items" "categories_items" where "categories_items"."category_id" = "categories"."id") as "items" from "categories" "categories"',
			);
		});
	});

	describe('Gel', () => {
		const customLower = gelCustomType<{ data: string }>({
			dataType() {
				return 'std::str';
			},
			selectFromDb(column, decoder) {
				return sql<string>`str_lower(${sql.identifier(column)})`.mapWith(decoder).as(column);
			},
		});

		const items = gelTable('items', {
			id: gelInteger('id').primaryKey(),
			code: customLower('code').notNull(),
		});

		const dialect = new GelDialect();

		it('GelDialect buildSelectQuery with GelCustomColumn', () => {
			const sqlQuery = dialect.buildSelectQuery({
				table: items,
				fields: { id: items.id, code: items.code },
				isSingleTable: true,
				setOperators: [],
			});

			const { sql: sqlStr } = dialect.sqlToQuery(sqlQuery);
			expect(sqlStr).toBe('select "items"."id", str_lower("items"."code") as "code" from "items"');
		});
	});
});
