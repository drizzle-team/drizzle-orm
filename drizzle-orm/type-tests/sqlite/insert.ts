import type { RunResult } from 'better-sqlite3';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { and, eq } from '~/expressions.ts';
import { sql } from '~/sql/sql.ts';
import type { SQLiteInsert } from '~/sqlite-core/query-builders/insert.ts';
import type { DrizzleTypeError } from '~/utils.ts';
import { bunDb, db } from './db.ts';
import type { NewUser } from './tables.ts';
import { users } from './tables.ts';

const newUser: NewUser = {
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
	serialNotNull: 1,
};

const insertRun = db.insert(users).values(newUser).run();
Expect<Equal<RunResult, typeof insertRun>>;

const insertRunBun = bunDb.insert(users).values(newUser).run();
Expect<Equal<void, typeof insertRunBun>>;

const insertAll = db.insert(users).values(newUser).all();
Expect<Equal<DrizzleTypeError<'.all() cannot be used without .returning()'>, typeof insertAll>>;

const insertAllBun = bunDb.insert(users).values(newUser).all();
Expect<Equal<DrizzleTypeError<'.all() cannot be used without .returning()'>, typeof insertAllBun>>;

const insertGet = db.insert(users).values(newUser).get();
Expect<Equal<DrizzleTypeError<'.get() cannot be used without .returning()'>, typeof insertGet>>;

const insertGetBun = bunDb.insert(users).values(newUser).get();
Expect<Equal<DrizzleTypeError<'.get() cannot be used without .returning()'>, typeof insertGetBun>>;

const insertValues = db.insert(users).values(newUser).values();
Expect<Equal<DrizzleTypeError<'.values() cannot be used without .returning()'>, typeof insertValues>>;

const insertValuesBun = bunDb.insert(users).values(newUser).values();
Expect<Equal<DrizzleTypeError<'.values() cannot be used without .returning()'>, typeof insertValuesBun>>;

const insertRunReturningAll = db.insert(users).values(newUser).returning().run();
Expect<Equal<RunResult, typeof insertRunReturningAll>>;

const insertRunReturningAllBun = bunDb.insert(users).values(newUser).returning().run();
Expect<Equal<void, typeof insertRunReturningAllBun>>;

const insertAllReturningAll = db.insert(users).values(newUser).returning().all();
Expect<Equal<typeof users.$inferSelect[], typeof insertAllReturningAll>>;

const insertAllReturningAllBun = bunDb.insert(users).values(newUser).returning().all();
Expect<Equal<typeof users.$inferSelect[], typeof insertAllReturningAllBun>>;

const insertGetReturningAll = db.insert(users).values(newUser).returning().get();
Expect<Equal<typeof users.$inferSelect, typeof insertGetReturningAll>>;

const insertGetReturningAllBun = bunDb.insert(users).values(newUser).returning().get();
Expect<Equal<typeof users.$inferSelect, typeof insertGetReturningAllBun>>;

const insertValuesReturningAll = db.insert(users).values(newUser).returning().values();
Expect<Equal<any[][], typeof insertValuesReturningAll>>;

const insertValuesReturningAllBun = bunDb.insert(users).values(newUser).returning().values();
Expect<Equal<any[][], typeof insertValuesReturningAllBun>>;

const insertRunReturningPartial = db.insert(users).values(newUser).returning({
	id: users.id,
	homeCity: users.homeCity,
	mySubclass: users.subClass,
}).run();
Expect<Equal<RunResult, typeof insertRunReturningPartial>>;

const insertRunReturningPartialBun = bunDb.insert(users).values(newUser).returning({
	id: users.id,
	homeCity: users.homeCity,
	mySubclass: users.subClass,
}).run();
Expect<Equal<void, typeof insertRunReturningPartialBun>>;

const insertAllReturningPartial = db.insert(users).values(newUser).returning({
	id: users.id,
	homeCity: users.homeCity,
	mySubclass: users.subClass,
}).all();
Expect<
	Equal<
		{
			id: number;
			homeCity: number;
			mySubclass: 'B' | 'D' | null;
		}[],
		typeof insertAllReturningPartial
	>
>;

const insertAllReturningPartialBun = bunDb.insert(users).values(newUser).returning({
	id: users.id,
	homeCity: users.homeCity,
	mySubclass: users.subClass,
}).all();
Expect<
	Equal<
		{
			id: number;
			homeCity: number;
			mySubclass: 'B' | 'D' | null;
		}[],
		typeof insertAllReturningPartialBun
	>
>;

const insertReturningSql = db.insert(users).values(newUser).returning({
	id: users.id,
	homeCity: users.homeCity,
	subclassLower: sql`lower(${users.subClass})`,
	classLower: sql<string>`lower(${users.class})`,
}).all();
Expect<
	Equal<{
		id: number;
		homeCity: number;
		subclassLower: unknown;
		classLower: string;
	}[], typeof insertReturningSql>
>;

const insertReturningSqlBun = bunDb.insert(users).values(newUser).returning({
	id: users.id,
	homeCity: users.homeCity,
	subclassLower: sql`lower(${users.subClass})`,
	classLower: sql<string>`lower(${users.class})`,
}).all();
Expect<
	Equal<{
		id: number;
		homeCity: number;
		subclassLower: unknown;
		classLower: string;
	}[], typeof insertReturningSqlBun>
>;

db.insert(users).values(newUser).onConflictDoNothing().run();
db.insert(users).values(newUser).onConflictDoNothing({ target: users.class }).run();
db.insert(users).values(newUser).onConflictDoNothing({
	target: [
		sql`${users.class} collate nocase asc`,
		sql`${users.age1} desc`,
		users.subClass,
	],
}).run();

db.insert(users).values(newUser).onConflictDoUpdate({
	target: users.age1,
	set: { age1: sql`${users.age1} + 1` },
})
	.run();

db.insert(users).values(newUser)
	.onConflictDoUpdate({
		target: users.age1,
		set: { age1: sql`${users.age1} + 1` },
		where: sql`${users.age1} > 10`,
	})
	.onConflictDoNothing()
	.run();

const stmt = db.select().from(users)
	.where(and(eq(users.id, sql.placeholder('id'))))
	.offset(sql.placeholder('offset'))
	.limit(sql.placeholder('limit'))
	.prepare();
stmt.run({ id: 1, limit: 10, offset: 20 });

{
	function dynamic<T extends SQLiteInsert>(qb: T) {
		return qb.returning().onConflictDoNothing().onConflictDoUpdate({ set: {}, target: users.id, where: sql`` });
	}

	const qbBase = db.insert(users).values({ age1: 0, class: 'A', enumCol: 'a', homeCity: 0, serialNotNull: 0 })
		.$dynamic();
	const qb = dynamic(qbBase);
	const result = await qb;
	Expect<Equal<typeof users.$inferSelect[], typeof result>>;
}

{
	function withReturning<T extends SQLiteInsert>(qb: T) {
		return qb.returning();
	}

	const qbBase = db.insert(users).values({ age1: 0, class: 'A', enumCol: 'a', homeCity: 0, serialNotNull: 0 })
		.$dynamic();
	const qb = withReturning(qbBase);
	const result = await qb;
	Expect<Equal<typeof users.$inferSelect[], typeof result>>;
}

{
	db
		.insert(users)
		.values({ age1: 0, class: 'A', enumCol: 'a', homeCity: 0, serialNotNull: 0 })
		.returning()
		// @ts-expect-error method was already called
		.returning();
}
