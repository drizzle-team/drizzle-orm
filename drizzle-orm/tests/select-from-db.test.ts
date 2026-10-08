import { expect, test } from 'vitest';
import { GelDialect } from '~/gel-core/dialect.ts';
import { customType as gelCustomType, gelTable, integer as gelInteger, text as gelText } from '~/gel-core/index.ts';
import {
	customType as mysqlCustomType,
	int as mysqlInt,
	mysqlTable,
	mysqlView,
	serial as mysqlSerial,
	varchar,
} from '~/mysql-core/index.ts';
import { MySqlDatabase, MySqlDialect } from '~/mysql-core/index.ts';
import { drizzle as mysqlDrizzle } from '~/mysql-proxy/driver.ts';
import { MySqlRemoteSession } from '~/mysql-proxy/session.ts';
import { PgDialect } from '~/pg-core/index.ts';
import { customType, integer, pgMaterializedView, pgTable, pgView, serial, text } from '~/pg-core/index.ts';
import { drizzle as pgDrizzle } from '~/pg-proxy/driver.ts';
import { createTableRelationsHelpers, extractTablesRelationalConfig, relations } from '~/relations.ts';
import {
	customType as ssCustomType,
	serial as ssSerial,
	singlestoreTable,
	varchar as ssVarchar,
} from '~/singlestore-core/index.ts';
import { drizzle as singlestoreDrizzle } from '~/singlestore-proxy/driver.ts';
import { sql } from '~/sql/sql.ts';
import {
	customType as sqliteCustomType,
	integer as sqliteInteger,
	sqliteTable,
	sqliteView,
	text as sqliteText,
} from '~/sqlite-core/index.ts';
import { drizzle as sqliteDrizzle } from '~/sqlite-proxy/driver.ts';
import { getTableColumns, orderSelectedFields } from '~/utils.ts';

const customPoint = customType<{ data: { x: number; y: number }; driverData: string }>({
	dataType: () => 'point',
	selectFromDb: (column) => sql`ST_AsText(${column})`,
	fromDriver: (value) => {
		const [x, y] = value.slice(6, -1).split(' ').map(Number);
		return { x: x!, y: y! };
	},
});

const users = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name'),
});

const places = pgTable('places', {
	id: serial('id').primaryKey(),
	name: text('name'),
	ownerId: integer('owner_id').references(() => users.id),
	geo: customPoint('geo'),
});

const placesRelations = relations(places, ({ one }) => ({
	owner: one(users, { fields: [places.ownerId], references: [users.id] }),
}));

const usersRelations = relations(users, ({ many }) => ({
	places: many(places),
}));

const remoteCallback = async () => ({ rows: [] }) as any;
const db = pgDrizzle(remoteCallback, { schema: { users, places, placesRelations, usersRelations } });
const dialect = new PgDialect();

function toSQL(q: { getSQL(): ReturnType<typeof sql> }) {
	return dialect.sqlToQuery(q.getSQL() as any).sql;
}

test('selectFromDb wraps the custom column in a plain select', () => {
	const query = db.select().from(places);

	expect(toSQL(query)).toBe('select "id", "name", "owner_id", ST_AsText("geo") as "geo" from "places"');
});

test('selectFromDb only affects the custom column in an explicit field list', () => {
	const query = db.select({ name: places.name, geo: places.geo }).from(places);

	expect(toSQL(query)).toBe('select "name", ST_AsText("geo") as "geo" from "places"');
});

test('selectFromDb qualifies the wrapped column when joining', () => {
	const query = db.select().from(places).leftJoin(users, sql`true`);

	expect(toSQL(query)).toBe(
		'select "places"."id", "places"."name", "places"."owner_id", ST_AsText("places"."geo") as "geo", "users"."id", "users"."name" from "places" left join "users" on true',
	);
});

test('selectFromDb applies in insert/update/delete returning clauses', () => {
	expect(toSQL(db.insert(places).values({ name: 'a' }).returning())).toBe(
		'insert into "places" ("id", "name", "owner_id", "geo") values (default, $1, default, default) returning "id", "name", "owner_id", ST_AsText("geo") as "geo"',
	);
	expect(toSQL(db.update(places).set({ name: 'a' }).returning())).toBe(
		'update "places" set "name" = $1 returning "id", "name", "owner_id", ST_AsText("geo") as "geo"',
	);
	expect(toSQL(db.delete(places).returning())).toBe(
		'delete from "places" returning "id", "name", "owner_id", ST_AsText("geo") as "geo"',
	);
});

test('selectFromDb is not re-applied to subquery output columns', () => {
	const sq = db.select().from(places).as('sq');

	expect(toSQL(db.select().from(sq))).toBe(
		'select "id", "name", "owner_id", "geo" from (select "id", "name", "owner_id", ST_AsText("geo") as "geo" from "places") "sq"',
	);
});

test('selectFromDb is not re-applied to CTE output columns', () => {
	const sq = db.$with('sq').as(db.select().from(places));

	expect(toSQL(db.with(sq).select().from(sq))).toBe(
		'with "sq" as (select "id", "name", "owner_id", ST_AsText("geo") as "geo" from "places") select "id", "name", "owner_id", "geo" from "sq"',
	);
});

test('selectFromDb applies in relational query selections', () => {
	const sqlText = db.query.places.findMany().toSQL().sql;

	expect(sqlText).toContain('ST_AsText("geo") as "geo"');
	expect(sqlText).toContain('"id"');
	expect(sqlText).not.toContain('ST_AsText("id")');
});

test('selectFromDb applies inside nested relational JSON payloads', () => {
	const sqlText = db.query.users.findMany({ with: { places: true } }).toSQL().sql;

	expect(sqlText).toContain('json_build_array(');
	expect(sqlText).toContain('ST_AsText("users_places"."geo")');
	expect(sqlText).not.toContain('ST_AsText("users_places"."id")');
});

test('custom types without selectFromDb are selected unchanged', () => {
	const plain = customType<{ data: string; driverData: string }>({
		dataType: () => 'point',
	});
	const t = pgTable('plain_t', { id: serial('id'), v: plain('v') });

	expect(toSQL(db.select().from(t))).toBe('select "id", "v" from "plain_t"');
});

test('fromDriver still decodes values for selectFromDb columns', () => {
	expect(places.geo.mapFromDriverValue('POINT(1 2)')).toEqual({ x: 1, y: 2 });
});

test('selectFromDb applies in mysql select field lists', () => {
	const mysqlPoint = mysqlCustomType<{ data: string; driverData: string }>({
		dataType: () => 'point',
		selectFromDb: (column) => sql`ST_AsText(${column})`,
	});
	const mysqlPlaces = mysqlTable('places', {
		id: mysqlSerial('id').primaryKey(),
		name: varchar('name', { length: 32 }),
		ownerId: mysqlInt('owner_id'),
		geo: mysqlPoint('geo'),
	});
	const mdb = mysqlDrizzle(remoteCallback);

	expect(mdb.select().from(mysqlPlaces).toSQL().sql).toBe(
		'select `id`, `name`, `owner_id`, ST_AsText(`geo`) as `geo` from `places`',
	);
});

test('selectFromDb applies in sqlite select field lists', () => {
	const sqlitePoint = sqliteCustomType<{ data: string; driverData: string }>({
		dataType: () => 'text',
		selectFromDb: (column) => sql`json_extract(${column}, \'$.x\')`,
	});
	const sqlitePlaces = sqliteTable('places', {
		id: sqliteInteger('id').primaryKey(),
		name: sqliteText('name'),
		geo: sqlitePoint('geo'),
	});
	const sdb = sqliteDrizzle(remoteCallback);

	expect(sdb.select().from(sqlitePlaces).toSQL().sql).toBe(
		`select "id", "name", json_extract("geo", '$.x') as "geo" from "places"`,
	);
});

test('selectFromDb applies in singlestore select field lists', () => {
	const ssPoint = ssCustomType<{ data: string; driverData: string }>({
		dataType: () => 'point',
		selectFromDb: (column) => sql`ST_AsText(${column})`,
	});
	const ssPlaces = singlestoreTable('places', {
		id: ssSerial('id').primaryKey(),
		name: ssVarchar('name', { length: 32 }),
		geo: ssPoint('geo'),
	});
	const ssdb = singlestoreDrizzle(remoteCallback);

	expect(ssdb.select().from(ssPlaces).toSQL().sql).toBe(
		'select `id`, `name`, ST_AsText(`geo`) as `geo` from `places`',
	);
});

test('selectFromDb applies in gel select field lists', () => {
	const gelPoint = gelCustomType<{ data: string; driverData: string }>({
		dataType: () => 'point',
		selectFromDb: (column) => sql`to_json(${column})`,
	});
	const gelPlaces = gelTable('places', {
		id: gelInteger('id'),
		name: gelText('name'),
		geo: gelPoint('geo'),
	});
	const gelDialect = new GelDialect();

	const query = gelDialect.buildSelectQuery({
		table: gelPlaces,
		fields: {},
		fieldsFlat: orderSelectedFields(getTableColumns(gelPlaces)),
		setOperators: [],
	});

	// Gel always qualifies column references with the source table
	expect(gelDialect.sqlToQuery(query).sql).toBe(
		'select "places"."id", "places"."name", to_json("places"."geo") as "geo" from "places"',
	);
});

test('selectFromDb is not re-applied to columns of a query-built view', () => {
	// The view's own query already applies selectFromDb, so its output column holds the transformed value
	const placesView = pgView('places_view').as((qb) => qb.select().from(places));

	expect(toSQL(db.select().from(placesView))).toBe('select "id", "name", "owner_id", "geo" from "places_view"');
	expect(toSQL(db.select({ geo: placesView.geo }).from(placesView))).toBe('select "geo" from "places_view"');
	expect(toSQL(db.select().from(places).leftJoin(placesView, sql`true`))).toBe(
		'select "places"."id", "places"."name", "places"."owner_id", ST_AsText("places"."geo") as "geo", "places_view"."id", "places_view"."name", "places_view"."owner_id", "places_view"."geo" from "places" left join "places_view" on true',
	);

	const materialized = pgMaterializedView('places_mv').as((qb) => qb.select().from(places));
	expect(toSQL(db.select().from(materialized))).toBe('select "id", "name", "owner_id", "geo" from "places_mv"');
});

test('selectFromDb still applies to columns of a view declared with raw SQL', () => {
	// A view defined with explicit columns and raw SQL returns the raw database value
	const rawView = pgView('places_raw', { id: integer('id'), geo: customPoint('geo') }).as(
		sql`select "id", "geo" from "places"`,
	);

	expect(toSQL(db.select().from(rawView))).toBe('select "id", ST_AsText("geo") as "geo" from "places_raw"');
	expect(toSQL(db.select({ geo: rawView.geo }).from(rawView))).toBe(
		'select ST_AsText("geo") as "geo" from "places_raw"',
	);
});

test('selectFromDb is not re-applied to query-built views in mysql and sqlite', () => {
	const mysqlPoint = mysqlCustomType<{ data: string; driverData: string }>({
		dataType: () => 'point',
		selectFromDb: (column) => sql`ST_AsText(${column})`,
	});
	const mysqlPlaces = mysqlTable('places', { id: mysqlSerial('id').primaryKey(), geo: mysqlPoint('geo') });
	const mysqlPlacesView = mysqlView('places_view').as((qb) => qb.select().from(mysqlPlaces));
	expect(mysqlDrizzle(remoteCallback).select().from(mysqlPlacesView).toSQL().sql).toBe(
		'select `id`, `geo` from `places_view`',
	);

	const sqlitePoint = sqliteCustomType<{ data: string; driverData: string }>({
		dataType: () => 'blob',
		selectFromDb: (column) => sql`AsText(${column})`,
	});
	const sqlitePlaces = sqliteTable('places', { id: sqliteInteger('id').primaryKey(), geo: sqlitePoint('geo') });
	const sqlitePlacesView = sqliteView('places_view').as((qb) => qb.select().from(sqlitePlaces));
	expect(sqliteDrizzle(remoteCallback).select().from(sqlitePlacesView).toSQL().sql).toBe(
		'select "id", "geo" from "places_view"',
	);
});

test('selectFromDb applies inside nested relational JSON payloads in mysql planetscale mode', () => {
	const mysqlPoint = mysqlCustomType<{ data: string; driverData: string }>({
		dataType: () => 'point',
		selectFromDb: (column) => sql`ST_AsText(${column})`,
	});
	const mUsers = mysqlTable('users', { id: mysqlSerial('id').primaryKey(), name: varchar('name', { length: 32 }) });
	const mPlaces = mysqlTable('places', {
		id: mysqlSerial('id').primaryKey(),
		ownerId: mysqlInt('owner_id'),
		geo: mysqlPoint('geo'),
	});
	const fullSchema = {
		mUsers,
		mPlaces,
		mUsersRelations: relations(mUsers, ({ many }) => ({ places: many(mPlaces) })),
		mPlacesRelations: relations(mPlaces, ({ one }) => ({
			owner: one(mUsers, { fields: [mPlaces.ownerId], references: [mUsers.id] }),
		})),
	};
	// PlanetScale mode builds relational queries without lateral joins (as the planetscale-serverless driver does)
	const tablesConfig = extractTablesRelationalConfig(fullSchema, createTableRelationsHelpers);
	const schema = { fullSchema, schema: tablesConfig.tables, tableNamesMap: tablesConfig.tableNamesMap };
	const mysqlDialect = new MySqlDialect();
	const session = new MySqlRemoteSession(remoteCallback, mysqlDialect, schema, {});
	const pdb = new MySqlDatabase(mysqlDialect, session, schema as any, 'planetscale') as MySqlDatabase<
		any,
		any,
		typeof fullSchema
	>;

	const sqlText = pdb.query.mUsers.findMany({ with: { places: true } }).toSQL().sql;

	expect(sqlText).not.toContain('lateral');
	expect(sqlText).toContain('json_array(`id`, `owner_id`, ST_AsText(`geo`))');
});
