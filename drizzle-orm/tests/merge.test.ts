import { describe, expect, test } from 'vitest';
import { integer, PgDialect, pgTable, text } from '~/pg-core/index.ts';
import { PgMergeBuilder, QueryBuilder } from '~/pg-core/query-builders/index.ts';
import { eq, isNotNull, sql } from '~/sql/index.ts';

const users = pgTable('users', {
	id: integer('id').primaryKey(),
	name: text('name'),
});

const source = pgTable('source_users', {
	id: integer('id').primaryKey(),
	name: text('name'),
});

function makeBuilder() {
	const dialect = new PgDialect();
	return { dialect, builder: new PgMergeBuilder(users, {} as any, dialect) };
}

describe('MERGE SQL generation', () => {
	test('whenMatched update', () => {
		const { builder } = makeBuilder();
		const { sql: query, params } = builder
			.using(source, eq(users.id, source.id))
			.whenMatched()
			.update({ name: source.name })
			.toSQL();

		expect(query).toBe(
			'merge into "users" using "source_users" on "users"."id" = "source_users"."id" when matched then update set "name" = "source_users"."name"',
		);
		expect(params).toEqual([]);
	});

	test('whenMatched delete', () => {
		const { builder } = makeBuilder();
		const { sql: query } = builder
			.using(source, eq(users.id, source.id))
			.whenMatched()
			.delete()
			.toSQL();

		expect(query).toBe(
			'merge into "users" using "source_users" on "users"."id" = "source_users"."id" when matched then delete',
		);
	});

	test('whenMatched doNothing', () => {
		const { builder } = makeBuilder();
		const { sql: query } = builder
			.using(source, eq(users.id, source.id))
			.whenMatched()
			.doNothing()
			.toSQL();

		expect(query).toBe(
			'merge into "users" using "source_users" on "users"."id" = "source_users"."id" when matched then do nothing',
		);
	});

	test('whenNotMatched insert', () => {
		const { builder } = makeBuilder();
		const { sql: query, params } = builder
			.using(source, eq(users.id, source.id))
			.whenNotMatched()
			.insert({ id: source.id, name: source.name })
			.toSQL();

		expect(query).toBe(
			'merge into "users" using "source_users" on "users"."id" = "source_users"."id" when not matched then insert ("id", "name") values ("source_users"."id", "source_users"."name")',
		);
		expect(params).toEqual([]);
	});

	test('whenNotMatched doNothing', () => {
		const { builder } = makeBuilder();
		const { sql: query } = builder
			.using(source, eq(users.id, source.id))
			.whenNotMatched()
			.doNothing()
			.toSQL();

		expect(query).toBe(
			'merge into "users" using "source_users" on "users"."id" = "source_users"."id" when not matched then do nothing',
		);
	});

	test('full upsert: whenMatched update + whenNotMatched insert', () => {
		const { builder } = makeBuilder();
		const { sql: query } = builder
			.using(source, eq(users.id, source.id))
			.whenMatched()
			.update({ name: source.name })
			.whenNotMatched()
			.insert({ id: source.id, name: source.name })
			.toSQL();

		expect(query).toBe(
			'merge into "users" using "source_users" on "users"."id" = "source_users"."id"'
				+ ' when matched then update set "name" = "source_users"."name"'
				+ ' when not matched then insert ("id", "name") values ("source_users"."id", "source_users"."name")',
		);
	});

	test('whenMatched with predicate condition', () => {
		const { builder } = makeBuilder();
		const { sql: query, params } = builder
			.using(source, eq(users.id, source.id))
			.whenMatched(eq(source.name, 'inactive'))
			.delete()
			.toSQL();

		expect(query).toBe(
			'merge into "users" using "source_users" on "users"."id" = "source_users"."id" when matched and "source_users"."name" = $1 then delete',
		);
		expect(params).toEqual(['inactive']);
	});

	test('whenNotMatched with predicate condition', () => {
		const { builder } = makeBuilder();
		const { sql: query, params } = builder
			.using(source, eq(users.id, source.id))
			.whenNotMatched(eq(source.name, 'active'))
			.insert({ id: source.id, name: source.name })
			.toSQL();

		expect(query).toBe(
			'merge into "users" using "source_users" on "users"."id" = "source_users"."id" when not matched and "source_users"."name" = $1 then insert ("id", "name") values ("source_users"."id", "source_users"."name")',
		);
		expect(params).toEqual(['active']);
	});

	test('multiple whenMatched clauses (first match wins)', () => {
		const { builder } = makeBuilder();
		const { sql: query, params } = builder
			.using(source, eq(users.id, source.id))
			.whenMatched(eq(source.name, 'delete-me'))
			.delete()
			.whenMatched()
			.update({ name: source.name })
			.toSQL();

		expect(query).toBe(
			'merge into "users" using "source_users" on "users"."id" = "source_users"."id"'
				+ ' when matched and "source_users"."name" = $1 then delete'
				+ ' when matched then update set "name" = "source_users"."name"',
		);
		expect(params).toEqual(['delete-me']);
	});

	test('insert with literal value param', () => {
		const { builder } = makeBuilder();
		const { sql: query, params } = builder
			.using(source, eq(users.id, source.id))
			.whenNotMatched()
			.insert({ id: source.id, name: 'default_name' })
			.toSQL();

		expect(query).toBe(
			'merge into "users" using "source_users" on "users"."id" = "source_users"."id" when not matched then insert ("id", "name") values ("source_users"."id", $1)',
		);
		expect(params).toEqual(['default_name']);
	});

	test('update with literal value param', () => {
		const { builder } = makeBuilder();
		const { sql: query, params } = builder
			.using(source, eq(users.id, source.id))
			.whenMatched()
			.update({ name: 'fixed_name' })
			.toSQL();

		expect(query).toBe(
			'merge into "users" using "source_users" on "users"."id" = "source_users"."id" when matched then update set "name" = $1',
		);
		expect(params).toEqual(['fixed_name']);
	});

	test('insert with sql expression', () => {
		const { builder } = makeBuilder();
		const { sql: query } = builder
			.using(source, eq(users.id, source.id))
			.whenNotMatched()
			.insert({ id: source.id, name: sql`upper(${source.name})` })
			.toSQL();

		expect(query).toBe(
			'merge into "users" using "source_users" on "users"."id" = "source_users"."id" when not matched then insert ("id", "name") values ("source_users"."id", upper("source_users"."name"))',
		);
	});

	test('with RETURNING clause (PG 17+)', () => {
		const { builder } = makeBuilder();
		const { sql: query } = builder
			.using(source, eq(users.id, source.id))
			.whenMatched()
			.update({ name: source.name })
			.whenNotMatched()
			.insert({ id: source.id, name: source.name })
			.returning()
			.toSQL();

		expect(query).toBe(
			'merge into "users" using "source_users" on "users"."id" = "source_users"."id"'
				+ ' when matched then update set "name" = "source_users"."name"'
				+ ' when not matched then insert ("id", "name") values ("source_users"."id", "source_users"."name")'
				+ ' returning "id", "name"',
		);
	});

	test('with RETURNING specific fields (PG 17+)', () => {
		const { builder } = makeBuilder();
		const { sql: query } = builder
			.using(source, eq(users.id, source.id))
			.whenMatched()
			.update({ name: source.name })
			.returning({ id: users.id })
			.toSQL();

		expect(query).toBe(
			'merge into "users" using "source_users" on "users"."id" = "source_users"."id"'
				+ ' when matched then update set "name" = "source_users"."name"'
				+ ' returning "id"',
		);
	});

	test('using raw SQL as source', () => {
		const { builder } = makeBuilder();

		const { sql: query } = builder
			.using(
				sql`(select * from ${source} where ${source.name} is not null) as "filtered"`,
				sql`${users.id} = "filtered"."id"`,
			)
			.whenMatched()
			.update({ name: sql`"filtered"."name"` })
			.toSQL();

		expect(query).toBe(
			'merge into "users"'
				+ ' using (select * from "source_users" where "source_users"."name" is not null) as "filtered"'
				+ ' on "users"."id" = "filtered"."id"'
				+ ' when matched then update set "name" = "filtered"."name"',
		);
	});

	test('using a filtered subquery as source', () => {
		const { builder, dialect } = makeBuilder();
		const qb = new QueryBuilder(dialect);
		const filteredSource = qb
			.select({ id: source.id, name: source.name })
			.from(source)
			.where(isNotNull(source.name))
			.as('filtered_source');

		const { sql: query } = builder
			.using(filteredSource, eq(users.id, filteredSource.id))
			.whenMatched()
			.update({ name: filteredSource.name })
			.whenNotMatched()
			.insert({ id: filteredSource.id, name: filteredSource.name })
			.toSQL();

		expect(query).toBe(
			'merge into "users"'
				+ ' using (select "id", "name" from "source_users" where "source_users"."name" is not null) "filtered_source"'
				+ ' on "users"."id" = "filtered_source"."id"'
				+ ' when matched then update set "name" = "filtered_source"."name"'
				+ ' when not matched then insert ("id", "name") values ("filtered_source"."id", "filtered_source"."name")',
		);
	});
});
