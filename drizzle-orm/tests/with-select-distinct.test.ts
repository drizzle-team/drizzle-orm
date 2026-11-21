import { describe, expect, it } from 'vitest';
import { QueryBuilder as GelQueryBuilder } from '~/gel-core/index.ts';
import { integer as gelInteger, text as gelText } from '~/gel-core/index.ts';
import { gelTable } from '~/gel-core/table.ts';
import { integer, pgTable, QueryBuilder, text } from '~/pg-core/index.ts';

const users = pgTable('users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
});

const gelUsers = gelTable('users', {
	id: gelInteger('id').primaryKey(),
	name: gelText('name').notNull(),
});

// Regression tests for https://github.com/drizzle-team/drizzle-orm/issues/4095
// The standalone QueryBuilder must forward the `with` list to selectDistinct /
// selectDistinctOn, otherwise the generated SQL silently drops the CTE.
describe('standalone QueryBuilder .with(...).selectDistinct keeps CTE (#4095)', () => {
	it('[pg] select keeps the WITH clause', () => {
		const qb = new QueryBuilder();
		const sq = qb.$with('sq').as(qb.select({ id: users.id }).from(users));
		const query = qb.with(sq).select({ id: sq.id }).from(sq).toSQL();

		expect(query.sql).toBe('with "sq" as (select "id" from "users") select "id" from "sq"');
	});

	it('[pg] selectDistinct keeps the WITH clause', () => {
		const qb = new QueryBuilder();
		const sq = qb.$with('sq').as(qb.select({ id: users.id }).from(users));
		const query = qb.with(sq).selectDistinct({ id: sq.id }).from(sq).toSQL();

		expect(query.sql).toBe('with "sq" as (select "id" from "users") select distinct "id" from "sq"');
	});

	it('[pg] selectDistinctOn keeps the WITH clause', () => {
		const qb = new QueryBuilder();
		const sq = qb.$with('sq').as(qb.select({ id: users.id }).from(users));
		const query = qb.with(sq).selectDistinctOn([sq.id], { id: sq.id }).from(sq).toSQL();

		expect(query.sql).toBe('with "sq" as (select "id" from "users") select distinct on ("sq"."id") "id" from "sq"');
	});

	it('[gel] selectDistinct keeps the WITH clause', () => {
		const qb = new GelQueryBuilder();
		const sq = qb.$with('sq').as(qb.select({ id: gelUsers.id }).from(gelUsers));
		const query = qb.with(sq).selectDistinct({ id: sq.id }).from(sq).toSQL();

		expect(query.sql).toBe('with "sq" as (select "users"."id" from "users") select distinct "sq"."id" from "sq"');
	});

	it('[gel] selectDistinctOn keeps the WITH clause', () => {
		const qb = new GelQueryBuilder();
		const sq = qb.$with('sq').as(qb.select({ id: gelUsers.id }).from(gelUsers));
		const query = qb.with(sq).selectDistinctOn([sq.id], { id: sq.id }).from(sq).toSQL();

		expect(query.sql).toBe(
			'with "sq" as (select "users"."id" from "users") select distinct on ("sq"."id") "sq"."id" from "sq"',
		);
	});
});
