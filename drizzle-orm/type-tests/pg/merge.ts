import type { QueryResult } from 'pg';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { eq, sql } from '~/index.ts';
import { db } from './db.ts';
import { cities, users } from './tables.ts';

// MERGE with whenMatched update + whenNotMatched insert (no RETURNING)
{
	const result = await db.merge(users)
		.using(cities, eq(users.id, cities.id))
		.whenMatched()
		.update({ text: cities.name })
		.whenNotMatched()
		.insert({ id: 1, text: 'new user' });

	Expect<Equal<QueryResult<never>, typeof result>>;
}

// MERGE with whenMatched delete
{
	const result = await db.merge(users)
		.using(cities, eq(users.id, cities.id))
		.whenMatched()
		.delete();

	Expect<Equal<QueryResult<never>, typeof result>>;
}

// MERGE with whenMatched doNothing
{
	const result = await db.merge(users)
		.using(cities, eq(users.id, cities.id))
		.whenMatched()
		.doNothing()
		.whenNotMatched()
		.doNothing();

	Expect<Equal<QueryResult<never>, typeof result>>;
}

// MERGE with conditional whenMatched
{
	const result = await db.merge(users)
		.using(cities, eq(users.id, cities.id))
		.whenMatched(eq(cities.id, 1))
		.update({ text: cities.name })
		.whenMatched()
		.delete()
		.whenNotMatched()
		.insert({ id: 1, text: 'new user' });

	Expect<Equal<QueryResult<never>, typeof result>>;
}

// MERGE with RETURNING all columns (PG 17+)
{
	const result = await db.merge(users)
		.using(cities, eq(users.id, cities.id))
		.whenMatched()
		.update({ text: cities.name })
		.whenNotMatched()
		.insert({ id: 1, text: 'new user' })
		.returning();

	Expect<Equal<(typeof users.$inferSelect)[], typeof result>>;
}

// MERGE with RETURNING specific fields (PG 17+)
{
	const result = await db.merge(users)
		.using(cities, eq(users.id, cities.id))
		.whenMatched()
		.update({ text: cities.name })
		.returning({ id: users.id, name: users.text });

	Expect<Equal<{ id: number; name: string | null }[], typeof result>>;
}

// MERGE with SQL expression in insert
{
	const result = await db.merge(users)
		.using(cities, eq(users.id, cities.id))
		.whenNotMatched()
		.insert({ id: sql<number>`${cities.id}`, text: cities.name });

	Expect<Equal<QueryResult<never>, typeof result>>;
}

// MERGE toSQL
{
	const { sql: query } = db.merge(users)
		.using(cities, eq(users.id, cities.id))
		.whenMatched()
		.update({ text: cities.name })
		.whenNotMatched()
		.insert({ id: 1, text: 'new user' })
		.toSQL();

	Expect<Equal<string, typeof query>>;
}
