import type { RunResult } from 'better-sqlite3';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { eq } from '~/sql/expressions/index.ts';
import { sql } from '~/sql/sql.ts';
import type { SQLiteUpdate } from '~/sqlite-core/query-builders/update.ts';
import type { DrizzleTypeError } from '~/utils.ts';
import { bunDb, db } from './db.ts';
import { cities, users } from './tables.ts';

const updateRun = db.update(users)
	.set({
		name: 'John',
		age1: 30,
	})
	.where(eq(users.id, 1))
	.run();
Expect<Equal<RunResult, typeof updateRun>>;

const updateRunBun = bunDb.update(users)
	.set({
		name: 'John',
		age1: 30,
	})
	.where(eq(users.id, 1))
	.run();
Expect<Equal<void, typeof updateRunBun>>;

const updateAll = db.update(users)
	.set({
		name: 'John',
		age1: 30,
	})
	.all();
Expect<Equal<DrizzleTypeError<'.all() cannot be used without .returning()'>, typeof updateAll>>;

const updateAllBun = bunDb.update(users)
	.set({
		name: 'John',
		age1: 30,
	})
	.all();
Expect<Equal<DrizzleTypeError<'.all() cannot be used without .returning()'>, typeof updateAllBun>>;

const updateGet = db.update(users)
	.set({
		name: 'John',
		age1: 30,
	}).get();
Expect<Equal<DrizzleTypeError<'.get() cannot be used without .returning()'>, typeof updateGet>>;

const updateGetBun = bunDb.update(users)
	.set({
		name: 'John',
		age1: 30,
	}).get();
Expect<Equal<DrizzleTypeError<'.get() cannot be used without .returning()'>, typeof updateGetBun>>;

const updateAllReturningAll = db.update(users)
	.set({
		name: 'John',
		age1: 30,
	})
	.where(eq(users.id, 1))
	.returning()
	.all();
Expect<Equal<typeof users.$inferSelect[], typeof updateAllReturningAll>>;

const updateAllReturningAllBun = bunDb.update(users)
	.set({
		name: 'John',
		age1: 30,
	})
	.where(eq(users.id, 1))
	.returning()
	.all();
Expect<Equal<typeof users.$inferSelect[], typeof updateAllReturningAllBun>>;

const updateGetReturningAll = db.update(users)
	.set({
		name: 'John',
		age1: 30,
	})
	.where(eq(users.id, 1))
	.returning()
	.get();
Expect<Equal<typeof users.$inferSelect, typeof updateGetReturningAll>>;

const updateGetReturningAllBun = bunDb.update(users)
	.set({
		name: 'John',
		age1: 30,
	})
	.where(eq(users.id, 1))
	.returning()
	.get();
Expect<Equal<typeof users.$inferSelect, typeof updateGetReturningAllBun>>;

{
	function dynamic<T extends SQLiteUpdate>(qb: T) {
		return qb.where(sql``).returning();
	}

	const qbBase = db.update(users).set({}).$dynamic();
	const qb = dynamic(qbBase);
	const result = await qb;
	Expect<Equal<typeof users.$inferSelect[], typeof result>>;
}

{
	function withReturning<T extends SQLiteUpdate>(qb: T) {
		return qb.returning();
	}

	const qbBase = db.update(users).set({}).$dynamic();
	const qb = withReturning(qbBase);
	const result = await qb;
	Expect<Equal<typeof users.$inferSelect[], typeof result>>;
}

{
	db
		.update(users)
		.set({})
		.returning()
		// @ts-expect-error method was already called
		.returning();

	db
		.update(users)
		.set({})
		.where(sql``)
		// @ts-expect-error method was already called
		.where(sql``);
}

{
	db
		.update(users)
		.set({})
		.from(sql``)
		.leftJoin(sql``, (table, from) => {
			Expect<Equal<typeof users['_']['columns'], typeof table>>;
			Expect<Equal<never, typeof from>>;
			return sql``;
		});

	db
		.update(users)
		.set({})
		.from(cities)
		.leftJoin(sql``, (table, from) => {
			Expect<Equal<typeof users['_']['columns'], typeof table>>;
			Expect<Equal<typeof cities['_']['columns'], typeof from>>;
			return sql``;
		});

	const citiesSq = db.$with('cities_sq').as(db.select({ id: cities.id }).from(cities));

	db
		.with(citiesSq)
		.update(users)
		.set({})
		.from(citiesSq)
		.leftJoin(sql``, (table, from) => {
			Expect<Equal<typeof users['_']['columns'], typeof table>>;
			Expect<Equal<typeof citiesSq['_']['selectedFields'], typeof from>>;
			return sql``;
		});

	db
		.with(citiesSq)
		.update(users)
		.set({
			homeCity: citiesSq.id,
		})
		.from(citiesSq);
}

{
	const result = await db.update(users).set({}).from(cities).returning();
	Expect<
		Equal<typeof users.$inferSelect[], typeof result>
	>;
}

{
	const result = await db.update(users).set({}).from(cities).returning({
		id: users.id,
	});
	Expect<
		Equal<{
			id: number;
		}[], typeof result>
	>;
	db.update(users).set({}).where(sql``).limit(1).orderBy(sql``);
}
