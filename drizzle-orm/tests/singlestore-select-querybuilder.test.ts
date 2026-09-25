import { describe, test } from 'vitest';
import { sql } from '~/index.ts';
import { QueryBuilder } from '~/singlestore-core/index.ts';

describe.concurrent('singlestore-core QueryBuilder', () => {
	// https://github.com/drizzle-team/drizzle-orm/issues/4741
	test('select().from(sql`...`) with no explicit fields defaults to `select *`, not an empty field list', ({ expect }) => {
		const qb = new QueryBuilder();
		const query = qb.select().from(sql`events`);

		expect(query.toSQL().sql).toBe('select * from events');
	});
});
