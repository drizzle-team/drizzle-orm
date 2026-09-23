import { describe, expect, it } from 'vitest';
import { customType as gelCustomType, gelTable, integer as gelInteger } from '~/gel-core/index.ts';
import { QueryBuilder as GelQueryBuilder } from '~/gel-core/query-builders/query-builder.ts';
import { customType as mysqlCustomType, int as mysqlInt, mysqlTable } from '~/mysql-core/index.ts';
import { QueryBuilder as MySqlQueryBuilder } from '~/mysql-core/query-builders/query-builder.ts';
import { customType as pgCustomType, integer as pgInteger, pgTable } from '~/pg-core/index.ts';
import { QueryBuilder as PgQueryBuilder } from '~/pg-core/query-builders/query-builder.ts';
import {
	customType as singleStoreCustomType,
	int as singleStoreInt,
	singlestoreTable,
} from '~/singlestore-core/index.ts';
import { QueryBuilder as SingleStoreQueryBuilder } from '~/singlestore-core/query-builders/query-builder.ts';
import { eq, sql } from '~/sql';
import { customType as sqliteCustomType, integer as sqliteInteger, sqliteTable } from '~/sqlite-core/index.ts';
import { QueryBuilder as SQLiteQueryBuilder } from '~/sqlite-core/query-builders/query-builder.ts';

const pgValue = pgCustomType<{ data: string; driverData: string }>({
	dataType() {
		return 'text';
	},
	selectFromDb(column) {
		return sql`lower(${column})`;
	},
});
const pgLocations = pgTable('pg_locations', {
	id: pgInteger('id').primaryKey(),
	value: pgValue('value'),
});
const pgRelated = pgTable('pg_related', { id: pgInteger('id').primaryKey() });

const mysqlValue = mysqlCustomType<{ data: string; driverData: string }>({
	dataType() {
		return 'text';
	},
	selectFromDb(column) {
		return sql`lower(${column})`;
	},
});
const mysqlLocations = mysqlTable('mysql_locations', {
	id: mysqlInt('id').primaryKey(),
	value: mysqlValue('value'),
});
const mysqlRelated = mysqlTable('mysql_related', { id: mysqlInt('id').primaryKey() });

const sqliteValue = sqliteCustomType<{ data: string; driverData: string }>({
	dataType() {
		return 'text';
	},
	selectFromDb(column) {
		return sql`lower(${column})`;
	},
});
const sqliteLocations = sqliteTable('sqlite_locations', {
	id: sqliteInteger('id').primaryKey(),
	value: sqliteValue('value'),
});
const sqliteRelated = sqliteTable('sqlite_related', { id: sqliteInteger('id').primaryKey() });

const gelValue = gelCustomType<{ data: string; driverData: string }>({
	dataType() {
		return 'string';
	},
	selectFromDb(column) {
		return sql`lower(${column})`;
	},
});
const gelLocations = gelTable('gel_locations', {
	id: gelInteger('id').primaryKey(),
	value: gelValue('value'),
});
const gelRelated = gelTable('gel_related', { id: gelInteger('id').primaryKey() });

const singleStoreValue = singleStoreCustomType<{ data: string; driverData: string }>({
	dataType() {
		return 'text';
	},
	selectFromDb(column) {
		return sql`lower(${column})`;
	},
});
const singleStoreLocations = singlestoreTable('single_store_locations', {
	id: singleStoreInt('id').primaryKey(),
	value: singleStoreValue('value'),
});
const singleStoreRelated = singlestoreTable('single_store_related', {
	id: singleStoreInt('id').primaryKey(),
});

function expectSelection(
	query: { sql: string },
	wrappedColumn: string,
	ordinaryColumn: string,
	qualifiedOrdinaryColumn: string,
) {
	expect(query.sql).toContain(`lower(${wrappedColumn})`);
	expect(query.sql).toContain(ordinaryColumn);
	expect(query.sql).not.toContain(`lower(${qualifiedOrdinaryColumn})`);
}

describe('custom type selectFromDb query-builder regressions', () => {
	it('wraps custom columns in PostgreSQL single-table and join selections', () => {
		const qb = new PgQueryBuilder();
		const single = qb.select({ id: pgLocations.id, value: pgLocations.value }).from(pgLocations).toSQL();
		const joined = qb
			.select({ id: pgLocations.id, value: pgLocations.value })
			.from(pgLocations)
			.leftJoin(pgRelated, eq(pgLocations.id, pgRelated.id))
			.toSQL();

		expectSelection(single, '"pg_locations"."value"', '"id"', '"pg_locations"."id"');
		expectSelection(joined, '"pg_locations"."value"', '"pg_locations"."id"', '"pg_locations"."id"');
	});

	it('wraps custom columns in MySQL single-table and join selections', () => {
		const qb = new MySqlQueryBuilder();
		const single = qb.select({ id: mysqlLocations.id, value: mysqlLocations.value }).from(mysqlLocations).toSQL();
		const joined = qb
			.select({ id: mysqlLocations.id, value: mysqlLocations.value })
			.from(mysqlLocations)
			.leftJoin(mysqlRelated, eq(mysqlLocations.id, mysqlRelated.id))
			.toSQL();

		expectSelection(single, '`mysql_locations`.`value`', '`id`', '`mysql_locations`.`id`');
		expectSelection(joined, '`mysql_locations`.`value`', '`mysql_locations`.`id`', '`mysql_locations`.`id`');
	});

	it('wraps custom columns in SQLite single-table and join selections', () => {
		const qb = new SQLiteQueryBuilder();
		const single = qb.select({ id: sqliteLocations.id, value: sqliteLocations.value }).from(sqliteLocations).toSQL();
		const joined = qb
			.select({ id: sqliteLocations.id, value: sqliteLocations.value })
			.from(sqliteLocations)
			.leftJoin(sqliteRelated, eq(sqliteLocations.id, sqliteRelated.id))
			.toSQL();

		expectSelection(single, '"sqlite_locations"."value"', '"id"', '"sqlite_locations"."id"');
		expectSelection(joined, '"sqlite_locations"."value"', '"sqlite_locations"."id"', '"sqlite_locations"."id"');
	});

	it('wraps custom columns in Gel single-table and join selections', () => {
		const qb = new GelQueryBuilder();
		const single = qb.select({ id: gelLocations.id, value: gelLocations.value }).from(gelLocations).toSQL();
		const joined = qb
			.select({ id: gelLocations.id, value: gelLocations.value })
			.from(gelLocations)
			.leftJoin(gelRelated, eq(gelLocations.id, gelRelated.id))
			.toSQL();

		expectSelection(single, '"gel_locations"."value"', '"gel_locations"."id"', '"gel_locations"."id"');
		expectSelection(joined, '"gel_locations"."value"', '"gel_locations"."id"', '"gel_locations"."id"');
	});

	it('wraps custom columns in SingleStore single-table and join selections', () => {
		const qb = new SingleStoreQueryBuilder();
		const single = qb
			.select({ id: singleStoreLocations.id, value: singleStoreLocations.value })
			.from(singleStoreLocations)
			.toSQL();
		const joined = qb
			.select({ id: singleStoreLocations.id, value: singleStoreLocations.value })
			.from(singleStoreLocations)
			.leftJoin(singleStoreRelated, eq(singleStoreLocations.id, singleStoreRelated.id))
			.toSQL();

		expectSelection(single, '`single_store_locations`.`value`', '`id`', '`single_store_locations`.`id`');
		expectSelection(
			joined,
			'`single_store_locations`.`value`',
			'`single_store_locations`.`id`',
			'`single_store_locations`.`id`',
		);
	});
});
