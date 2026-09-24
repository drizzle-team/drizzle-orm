import { describe, it } from 'vitest';
import { integer, jsonb, pgTable, text } from '~/pg-core';
import { PgDialect } from '~/pg-core/dialect';
import { sql } from '~/sql';
import { Param, Placeholder } from '~/sql/sql';

const dialect = new PgDialect();

const users = pgTable('users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	meta: jsonb('meta'),
});

describe('sql query building', () => {
	it('keeps param order for a large list', ({ expect }) => {
		const ids = Array.from({ length: 10_000 }, (_, index) => index);
		const query = dialect.sqlToQuery(sql`select ${users.id} from ${users} where ${users.id} in ${ids}`);

		expect(query.sql.startsWith('select "users"."id" from "users" where "users"."id" in (')).toBe(true);
		expect(query.sql.endsWith(')')).toBe(true);
		expect(query.params).toEqual(ids);
		expect(query.sql.match(/\$/g)?.length).toBe(ids.length);
		expect(query.typings).toEqual(ids.map(() => 'none'));
	});

	it('builds nested sql, inlined values, and placeholders', ({ expect }) => {
		const name = sql.placeholder('name');
		const query = dialect.sqlToQuery(
			sql`select ${users.name} from ${users} where ${users.name} = ${name} and ${users.meta} = ${
				new Param({ active: true }, users.meta)
			} and ${sql`lower(${users.name})`} = ${sql`lower(${'Ada'})`.inlineParams()}`,
		);

		expect(query.sql).toBe(
			'select "users"."name" from "users" where "users"."name" = $1 and "users"."meta" = $2 and lower("users"."name") = lower(\'Ada\')',
		);
		expect(query.params[0]).toBeInstanceOf(Placeholder);
		expect(query.params[1]).toBe('{"active":true}');
		expect(query.params).toHaveLength(2);
		expect(query.typings).toEqual(['none', 'json']);
	});
});
