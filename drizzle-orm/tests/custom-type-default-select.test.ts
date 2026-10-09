import { describe, expect, it } from 'vitest';
import { entityKind } from '~/entity';
import { customType as gelCustomType } from '~/gel-core/columns/custom';
import { GelDialect } from '~/gel-core/dialect';
import { gelTable } from '~/gel-core/table';
import { int as mysqlInt, mysqlTable, text as mysqlText } from '~/mysql-core';
import { customType as mysqlCustomType } from '~/mysql-core/columns/custom';
import { drizzle as drizzleMysqlProxy } from '~/mysql-proxy';
import { alias as pgAlias, integer as pgInteger, pgTable, text as pgText } from '~/pg-core';
import { customType as pgCustomType } from '~/pg-core/columns/custom';
import { drizzle as drizzlePgProxy } from '~/pg-proxy';
import { relations } from '~/relations';
import { customType as singlestoreCustomType } from '~/singlestore-core/columns/custom';
import { SingleStoreDialect } from '~/singlestore-core/dialect';
import { singlestoreTable } from '~/singlestore-core/table';
import { eq, sql } from '~/sql';
import { alias as sqliteAlias, integer as sqliteInteger, sqliteTable, text as sqliteText } from '~/sqlite-core';
import { customType as sqliteCustomType } from '~/sqlite-core/columns/custom';
import { drizzle as drizzleSqliteProxy } from '~/sqlite-proxy';

describe('custom-type default selectFromDb hook (#554, #1083)', () => {
	describe('PostgreSQL', () => {
		// 1. Compact syntax: (column) => sql`ST_AsText(${column})`
		const customPointCompact = pgCustomType<{ data: string; driverData: string }>({
			dataType() {
				return 'geometry(Point,4326)';
			},
			selectFromDb: (col) => sql`ST_AsText(${col})`,
		});

		// 2. Explicit syntax: (column, decoder) => sql`st_astext(${sql.identifier(column)})`.mapWith(decoder).as(column)
		const customPointExplicit = pgCustomType<{ data: string; driverData: string }>({
			dataType() {
				return 'geometry(Point,4326)';
			},
			selectFromDb: (col, decoder) => sql`st_astext(${sql.identifier(col)})`.mapWith(decoder).as(col),
		});

		const itemsCompact = pgTable('items_compact', {
			id: pgInteger('id').primaryKey(),
			name: pgText('name').notNull(),
			geom: customPointCompact('geom').notNull(),
		});

		const itemsExplicit = pgTable('items_explicit', {
			id: pgInteger('id').primaryKey(),
			geom: customPointExplicit('geom').notNull(),
		});

		const locations = pgTable('locations', {
			id: pgInteger('id').primaryKey(),
			itemId: pgInteger('item_id').notNull().references(() => itemsCompact.id),
			loc: customPointCompact('loc').notNull(),
		});

		const itemsRelations = relations(itemsCompact, ({ many }) => ({
			locations: many(locations),
		}));

		const locationsRelations = relations(locations, ({ one }) => ({
			item: one(itemsCompact, {
				fields: [locations.itemId],
				references: [itemsCompact.id],
			}),
		}));

		const schema = { itemsCompact, itemsExplicit, locations, itemsRelations, locationsRelations };
		const db = drizzlePgProxy(async () => ({ rows: [] }), { schema });

		it('select * with compact selectFromDb syntax', () => {
			const query = db.select().from(itemsCompact);
			expect(query.toSQL().sql).toBe(
				'select "id", "name", ST_AsText("geom") as "geom" from "items_compact"',
			);
		});

		it('select * with explicit selectFromDb syntax', () => {
			const query = db.select().from(itemsExplicit);
			expect(query.toSQL().sql).toBe(
				'select "id", st_astext("geom") as "geom" from "items_explicit"',
			);
		});

		it('partial select with custom column', () => {
			const query = db.select({ geom: itemsCompact.geom }).from(itemsCompact);
			expect(query.toSQL().sql).toBe(
				'select ST_AsText("geom") as "geom" from "items_compact"',
			);
		});

		it('join with table-qualified custom column', () => {
			const query = db
				.select({
					itemId: itemsCompact.id,
					itemGeom: itemsCompact.geom,
					locGeom: locations.loc,
				})
				.from(itemsCompact)
				.leftJoin(locations, eq(itemsCompact.id, locations.itemId));

			expect(query.toSQL().sql).toBe(
				'select "items_compact"."id", ST_AsText("items_compact"."geom") as "geom", ST_AsText("locations"."loc") as "loc" from "items_compact" left join "locations" on "items_compact"."id" = "locations"."item_id"',
			);
		});

		it('select from aliased table', () => {
			const aliased = pgAlias(itemsCompact, 't_alias');
			const query = db.select({ geom: aliased.geom }).from(aliased);
			expect(query.toSQL().sql).toBe(
				'select ST_AsText("geom") as "geom" from "items_compact" "t_alias"',
			);
		});

		it('insert returning with selectFromDb', () => {
			const query = db.insert(itemsCompact).values({ id: 1, name: 'park', geom: 'POINT(1 2)' }).returning();
			expect(query.toSQL().sql).toBe(
				'insert into "items_compact" ("id", "name", "geom") values ($1, $2, $3) returning "id", "name", ST_AsText("geom") as "geom"',
			);
		});

		it('update returning with selectFromDb', () => {
			const query = db.update(itemsCompact).set({ geom: 'POINT(2 3)' }).returning();
			expect(query.toSQL().sql).toBe(
				'update "items_compact" set "geom" = $1 returning "id", "name", ST_AsText("geom") as "geom"',
			);
		});

		it('relational query findMany', () => {
			const query = (db.query.itemsCompact.findMany as any)();
			expect(query.toSQL().sql).toBe(
				'select "id", "name", ST_AsText("geom") as "geom" from "items_compact" "itemsCompact"',
			);
		});

		it('relational query nested relation (json_build_array)', () => {
			const query = (db.query.itemsCompact.findMany as any)({
				with: {
					locations: true,
				},
			});
			const sqlStr = query.toSQL().sql;
			expect(sqlStr).toContain('ST_AsText("itemsCompact_locations"."loc")');
			expect(sqlStr).toContain('ST_AsText("itemsCompact"."geom") as "geom"');
		});
	});

	describe('MySQL', () => {
		const customPoint = mysqlCustomType<{ data: string; driverData: string }>({
			dataType() {
				return 'geometry';
			},
			selectFromDb: (col) => sql`ST_AsText(${col})`,
		});

		const places = mysqlTable('places', {
			id: mysqlInt('id').primaryKey(),
			title: mysqlText('title').notNull(),
			coord: customPoint('coord').notNull(),
		});

		const visits = mysqlTable('visits', {
			id: mysqlInt('id').primaryKey(),
			placeId: mysqlInt('place_id').notNull().references(() => places.id),
			visitCoord: customPoint('visit_coord').notNull(),
		});

		const placesRelations = relations(places, ({ many }) => ({
			visits: many(visits),
		}));

		const visitsRelations = relations(visits, ({ one }) => ({
			place: one(places, {
				fields: [visits.placeId],
				references: [places.id],
			}),
		}));

		const schema = { places, visits, placesRelations, visitsRelations };
		const db = drizzleMysqlProxy(async () => ({ rows: [] }), { schema, mode: 'default' });

		it('select * with selectFromDb', () => {
			const query = db.select().from(places);
			expect(query.toSQL().sql).toBe(
				'select `id`, `title`, ST_AsText(`coord`) as `coord` from `places`',
			);
		});

		it('partial select with custom column', () => {
			const query = db.select({ coord: places.coord }).from(places);
			expect(query.toSQL().sql).toBe(
				'select ST_AsText(`coord`) as `coord` from `places`',
			);
		});

		it('relational query nested relation (json_array)', () => {
			const query = (db.query.places.findMany as any)({
				with: {
					visits: true,
				},
			});
			const sqlStr = query.toSQL().sql;
			expect(sqlStr).toContain('ST_AsText(`places_visits`.`visit_coord`)');
			expect(sqlStr).toContain('ST_AsText(`places`.`coord`) as `coord`');
		});
	});

	describe('SQLite', () => {
		const customHex = sqliteCustomType<{ data: string; driverData: string }>({
			dataType() {
				return 'blob';
			},
			selectFromDb: (col) => sql`hex(${col})`,
		});

		const files = sqliteTable('files', {
			id: sqliteInteger('id').primaryKey(),
			hash: customHex('hash').notNull(),
		});

		const chunks = sqliteTable('chunks', {
			id: sqliteInteger('id').primaryKey(),
			fileId: sqliteInteger('file_id').notNull().references(() => files.id),
			chunkHash: customHex('chunk_hash').notNull(),
		});

		const filesRelations = relations(files, ({ many }) => ({
			chunks: many(chunks),
		}));

		const chunksRelations = relations(chunks, ({ one }) => ({
			file: one(files, {
				fields: [chunks.fileId],
				references: [files.id],
			}),
		}));

		const schema = { files, chunks, filesRelations, chunksRelations };
		const db = drizzleSqliteProxy(async () => ({ rows: [] }), { schema });

		it('select * with selectFromDb', () => {
			const query = db.select().from(files);
			expect(query.toSQL().sql).toBe(
				'select "id", hex("hash") as "hash" from "files"',
			);
		});

		it('partial select with custom column', () => {
			const query = db.select({ hash: files.hash }).from(files);
			expect(query.toSQL().sql).toBe(
				'select hex("hash") as "hash" from "files"',
			);
		});

		it('insert returning with selectFromDb', () => {
			const query = db.insert(files).values({ id: 1, hash: 'abcd' }).returning();
			expect(query.toSQL().sql).toBe(
				'insert into "files" ("id", "hash") values (?, ?) returning "id", hex("hash") as "hash"',
			);
		});

		it('relational query nested relation (json_array)', () => {
			const query = (db.query.files.findMany as any)({
				with: {
					chunks: true,
				},
			});
			const sqlStr = query.toSQL().sql;
			expect(sqlStr).toContain('hex("chunk_hash")');
			expect(sqlStr).toContain('hex("hash") as "hash"');
		});
	});

	describe('SingleStore and Gel Dialects', () => {
		it('SingleStore builds select with selectFromDb', () => {
			const customBlob = singlestoreCustomType<{ data: string; driverData: string }>({
				dataType() {
					return 'blob';
				},
				selectFromDb: (col) => sql`hex(${col})`,
			});

			const sstoreTable = singlestoreTable('sstore_tbl', {
				data: customBlob('data'),
			});

			const dialect = new SingleStoreDialect();
			const query = dialect.buildSelectQuery({
				table: sstoreTable,
				fields: { data: sstoreTable.data },
				isPartialSelect: false,
				setOperators: [],
			});
			expect(dialect.sqlToQuery(query).sql).toBe(
				'select hex(`data`) as `data` from `sstore_tbl`',
			);
		});

		it('Gel builds select with selectFromDb', () => {
			const customGelType = gelCustomType<{ data: string; driverData: string }>({
				dataType() {
					return 'str';
				},
				selectFromDb: (col) => sql`str_trim(${col})`,
			});

			const gelTbl = gelTable('gel_tbl', {
				data: customGelType('data'),
			});

			const dialect = new GelDialect();
			const query = dialect.buildSelectQuery({
				table: gelTbl,
				fields: { data: gelTbl.data },
				isPartialSelect: false,
				setOperators: [],
			});
			expect(dialect.sqlToQuery(query).sql).toBe(
				'select str_trim("gel_tbl"."data") as "data" from "gel_tbl"',
			);
		});
	});
});
