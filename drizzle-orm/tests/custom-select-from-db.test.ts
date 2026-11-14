import { connect } from '@tidbcloud/serverless';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import { eq, sql } from '~/index.ts';
import { customType as gelCustomType, gelTable, integer as gelInteger } from '~/gel-core/index.ts';
import { QueryBuilder as GelQueryBuilder } from '~/gel-core/query-builders/query-builder.ts';
import { customType as mysqlCustomType, int as mysqlInt, mysqlTable } from '~/mysql-core/index.ts';
import { customType as pgCustomType, integer as pgInteger, pgTable } from '~/pg-core/index.ts';
import { drizzle as drizzlePg } from '~/postgres-js/index.ts';
import { customType as singlestoreCustomType, int as singlestoreInt, singlestoreTable } from '~/singlestore-core/index.ts';
import { drizzle as drizzleSinglestore } from '~/singlestore-proxy/index.ts';
import { customType as sqliteCustomType, integer as sqliteInteger, sqliteTable } from '~/sqlite-core/index.ts';
import { drizzle as drizzleSqlite } from '~/sqlite-proxy/index.ts';
import { drizzle as drizzleMysql } from '~/tidb-serverless/index.ts';

describe('Custom type selectFromDb SQL wrapper', () => {
	it('PostgreSQL wraps custom column in single-table select', () => {
		const customPoint = pgCustomType<{ data: { x: number; y: number }; driverData: string }>({
			dataType() {
				return 'geometry';
			},
			selectFromDb(column) {
				return sql`ST_AsGeoJSON(${column})`;
			},
			fromDriver(value: string) {
				const parsed = JSON.parse(value);
				return { x: parsed.coordinates[0], y: parsed.coordinates[1] };
			},
		});

		const items = pgTable('items', {
			id: pgInteger('id').primaryKey(),
			geom: customPoint('geom'),
		});

		const db = drizzlePg(postgres(''));
		const query = db.select().from(items);

		expect(query.toSQL().sql).toBe('select "id", ST_AsGeoJSON("geom") as "geom" from "items"');
	});

	it('PostgreSQL wraps custom column in joined query', () => {
		const customPoint = pgCustomType<{ data: string }>({
			dataType() {
				return 'geometry';
			},
			selectFromDb(column) {
				return sql`ST_AsGeoJSON(${column})`;
			},
		});

		const items = pgTable('items', {
			id: pgInteger('id').primaryKey(),
			geom: customPoint('geom'),
		});

		const regions = pgTable('regions', {
			id: pgInteger('id').primaryKey(),
			itemId: pgInteger('item_id'),
		});

		const db = drizzlePg(postgres(''));
		const query = db
			.select({
				id: items.id,
				geom: items.geom,
			})
			.from(items)
			.leftJoin(regions, eq(items.id, regions.itemId));

		expect(query.toSQL().sql).toBe(
			'select "items"."id", ST_AsGeoJSON("items"."geom") as "geom" from "items" left join "regions" on "items"."id" = "regions"."item_id"',
		);
	});

	it('PostgreSQL wraps custom column in returning clause', () => {
		const customPoint = pgCustomType<{ data: string }>({
			dataType() {
				return 'geometry';
			},
			selectFromDb(column) {
				return sql`ST_AsGeoJSON(${column})`;
			},
		});

		const items = pgTable('items', {
			id: pgInteger('id').primaryKey(),
			geom: customPoint('geom'),
		});

		const db = drizzlePg(postgres(''));
		const query = db.insert(items).values({ id: 1 }).returning();

		expect(query.toSQL().sql).toBe('insert into "items" ("id", "geom") values ($1, default) returning "id", ST_AsGeoJSON("geom") as "geom"');
	});

	it('MySQL wraps custom column in single-table and joined select', () => {
		const customPoint = mysqlCustomType<{ data: string }>({
			dataType() {
				return 'geometry';
			},
			selectFromDb(column) {
				return sql`ST_AsText(${column})`;
			},
		});

		const items = mysqlTable('items', {
			id: mysqlInt('id').primaryKey(),
			geom: customPoint('geom'),
		});

		const regions = mysqlTable('regions', {
			id: mysqlInt('id').primaryKey(),
			itemId: mysqlInt('item_id'),
		});

		const db = drizzleMysql(connect({}));

		const singleQuery = db.select().from(items);
		expect(singleQuery.toSQL().sql).toBe('select `id`, ST_AsText(`geom`) as `geom` from `items`');

		const joinQuery = db
			.select({ id: items.id, geom: items.geom })
			.from(items)
			.leftJoin(regions, eq(items.id, regions.itemId));
		expect(joinQuery.toSQL().sql).toBe(
			'select `items`.`id`, ST_AsText(`items`.`geom`) as `geom` from `items` left join `regions` on `items`.`id` = `regions`.`item_id`',
		);
	});

	it('SQLite wraps custom column in single-table and joined select', () => {
		const customPoint = sqliteCustomType<{ data: string }>({
			dataType() {
				return 'text';
			},
			selectFromDb(column) {
				return sql`json_extract(${column}, '$.geom')`;
			},
		});

		const items = sqliteTable('items', {
			id: sqliteInteger('id').primaryKey(),
			geom: customPoint('geom'),
		});

		const regions = sqliteTable('regions', {
			id: sqliteInteger('id').primaryKey(),
			itemId: sqliteInteger('item_id'),
		});

		const db = drizzleSqlite(async () => ({ rows: [] }));

		const singleQuery = db.select().from(items);
		expect(singleQuery.toSQL().sql).toBe('select "id", json_extract("geom", \'$.geom\') as "geom" from "items"');

		const joinQuery = db
			.select({ id: items.id, geom: items.geom })
			.from(items)
			.leftJoin(regions, eq(items.id, regions.itemId));
		expect(joinQuery.toSQL().sql).toBe(
			'select "items"."id", json_extract("items"."geom", \'$.geom\') as "geom" from "items" left join "regions" on "items"."id" = "regions"."item_id"',
		);
	});

	it('SingleStore wraps custom column in single-table and joined select', () => {
		const customPoint = singlestoreCustomType<{ data: string }>({
			dataType() {
				return 'geometry';
			},
			selectFromDb(column) {
				return sql`ST_AsText(${column})`;
			},
		});

		const items = singlestoreTable('items', {
			id: singlestoreInt('id').primaryKey(),
			geom: customPoint('geom'),
		});

		const regions = singlestoreTable('regions', {
			id: singlestoreInt('id').primaryKey(),
			itemId: singlestoreInt('item_id'),
		});

		const db = drizzleSinglestore(async () => ({ rows: [] }));

		const singleQuery = db.select().from(items);
		expect(singleQuery.toSQL().sql).toBe('select `id`, ST_AsText(`geom`) as `geom` from `items`');

		const joinQuery = db
			.select({ id: items.id, geom: items.geom })
			.from(items)
			.leftJoin(regions, eq(items.id, regions.itemId));
		expect(joinQuery.toSQL().sql).toBe(
			'select `items`.`id`, ST_AsText(`items`.`geom`) as `geom` from `items` left join `regions` on `items`.`id` = `regions`.`item_id`',
		);
	});

	it('Gel wraps custom column in select', () => {
		const customPoint = gelCustomType<{ data: string }>({
			dataType() {
				return 'std::str';
			},
			selectFromDb(column) {
				return sql`str_trim(${column})`;
			},
		});

		const items = gelTable('items', {
			id: gelInteger('id').primaryKey(),
			geom: customPoint('geom'),
		});

		const qb = new GelQueryBuilder();
		const query = qb.select().from(items);
		expect(query.toSQL().sql).toBe('select "items"."id", str_trim("items"."geom") as "geom" from "items"');
	});

	it('Decodes mapped value from driver correctly', () => {
		const customJson = pgCustomType<{ data: { name: string }; driverData: string }>({
			dataType() {
				return 'text';
			},
			selectFromDb(column) {
				return sql`lower(${column})`;
			},
			fromDriver(value: string) {
				return JSON.parse(value);
			},
		});

		const items = pgTable('items', {
			id: pgInteger('id').primaryKey(),
			payload: customJson('payload'),
		});

		const mapped = items.payload.mapFromDriverValue('{"name":"drizzle"}');
		expect(mapped).toEqual({ name: 'drizzle' });
	});
});
