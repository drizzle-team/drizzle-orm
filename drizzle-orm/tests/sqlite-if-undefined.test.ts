import { describe, test } from 'vitest';
import { asc, desc, eq, sql } from '~/index.ts';
import { integer, QueryBuilder, sqliteTable, text } from '~/sqlite-core/index.ts';

const users = sqliteTable('users', {
	id: integer('id').primaryKey(),
	name: text('name'),
});
const pets = sqliteTable('pets', {
	id: integer('id').primaryKey(),
	ownerId: integer('owner_id'),
});

function qb() {
	return new QueryBuilder();
}

describe('sqlite `.if(false)` holes', () => {
	test('leftJoin omits JOIN when ON is undefined', ({ expect }) => {
		const omitted = qb().select().from(users).toSQL();
		const skipped = qb().select().from(users).leftJoin(pets, eq(users.id, pets.ownerId).if(false)).toSQL();
		expect(skipped.sql).toBe(omitted.sql);
		expect(skipped.sql.includes('join')).toBe(false);
	});

	test('orderBy drops undefined and does not emit a leading comma', ({ expect }) => {
		const q = qb().select().from(users).orderBy(asc(users.id).if(false), desc(users.name)).toSQL();
		expect(q.sql).toBe(
			qb().select().from(users).orderBy(desc(users.name)).toSQL().sql,
		);
		expect(q.sql.includes('order by ,')).toBe(false);
	});

	test('groupBy drops undefined and does not emit a leading comma', ({ expect }) => {
		const q = qb().select().from(users).groupBy(sql`${users.id}`.if(false), users.name).toSQL();
		expect(q.sql).toBe(qb().select().from(users).groupBy(users.name).toSQL().sql);
		expect(q.sql.includes('group by ,')).toBe(false);
	});
});
