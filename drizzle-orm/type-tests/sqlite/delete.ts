import type { RunResult } from 'better-sqlite3';
import { eq } from '~/sql/expressions/index.ts';

import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { sql } from '~/sql/sql.ts';
import type { SQLiteDelete } from '~/sqlite-core/index.ts';
import type { DrizzleTypeError } from '~/utils.ts';
import { bunDb, db } from './db.ts';
import { users } from './tables.ts';

const deleteRun = db.delete(users).run();
Expect<Equal<RunResult, typeof deleteRun>>;

const deleteAll = db.delete(users).all();
Expect<Equal<DrizzleTypeError<'.all() cannot be used without .returning()'>, typeof deleteAll>>;

const deleteGet = db.delete(users).get();
Expect<Equal<DrizzleTypeError<'.get() cannot be used without .returning()'>, typeof deleteGet>>;

const deleteValues = db.delete(users).values();
Expect<Equal<DrizzleTypeError<'.values() cannot be used without .returning()'>, typeof deleteValues>>;

const deleteRunBun = bunDb.delete(users).run();
Expect<Equal<void, typeof deleteRunBun>>;

const deleteAllBun = bunDb.delete(users).all();
Expect<Equal<DrizzleTypeError<'.all() cannot be used without .returning()'>, typeof deleteAllBun>>;

const deleteGetBun = bunDb.delete(users).get();
Expect<Equal<DrizzleTypeError<'.get() cannot be used without .returning()'>, typeof deleteGetBun>>;

const deleteValuesBun = bunDb.delete(users).values();
Expect<Equal<DrizzleTypeError<'.values() cannot be used without .returning()'>, typeof deleteValuesBun>>;

const deleteRunWhere = db.delete(users).where(eq(users.id, 1)).run();
Expect<Equal<RunResult, typeof deleteRunWhere>>;

const deleteAllWhere = db.delete(users).where(eq(users.id, 1)).all();
Expect<Equal<DrizzleTypeError<'.all() cannot be used without .returning()'>, typeof deleteAllWhere>>;

const deleteGetWhere = db.delete(users).where(eq(users.id, 1)).get();
Expect<Equal<DrizzleTypeError<'.get() cannot be used without .returning()'>, typeof deleteGetWhere>>;

const deleteValuesWhere = db.delete(users).where(eq(users.id, 1)).values();
Expect<Equal<DrizzleTypeError<'.values() cannot be used without .returning()'>, typeof deleteValuesWhere>>;

const deleteRunBunWhere = bunDb.delete(users).where(eq(users.id, 1)).run();
Expect<Equal<void, typeof deleteRunBunWhere>>;

const deleteAllBunWhere = bunDb.delete(users).where(eq(users.id, 1)).all();
Expect<Equal<DrizzleTypeError<'.all() cannot be used without .returning()'>, typeof deleteAllBunWhere>>;

const deleteGetBunWhere = bunDb.delete(users).where(eq(users.id, 1)).get();
Expect<Equal<DrizzleTypeError<'.get() cannot be used without .returning()'>, typeof deleteGetBunWhere>>;

const deleteValuesBunWhere = bunDb.delete(users).where(eq(users.id, 1)).values();
Expect<Equal<DrizzleTypeError<'.values() cannot be used without .returning()'>, typeof deleteValuesBunWhere>>;

const deleteRunReturning = db.delete(users).returning().run();
Expect<Equal<RunResult, typeof deleteRunReturning>>;

const deleteAllReturning = db.delete(users).returning().all();
Expect<Equal<typeof users.$inferSelect[], typeof deleteAllReturning>>;

const deleteGetReturning = db.delete(users).returning().get();
Expect<Equal<typeof users.$inferSelect | undefined, typeof deleteGetReturning>>;

const deleteValuesReturning = db.delete(users).returning().values();
Expect<Equal<any[][], typeof deleteValuesReturning>>;

const deleteRunBunReturning = bunDb.delete(users).returning().run();
Expect<Equal<void, typeof deleteRunBunReturning>>;

const deleteAllBunReturning = bunDb.delete(users).returning().all();
Expect<Equal<typeof users.$inferSelect[], typeof deleteAllBunReturning>>;

const deleteGetBunReturning = bunDb.delete(users).returning().get();
Expect<Equal<typeof users.$inferSelect | undefined, typeof deleteGetBunReturning>>;

const deleteValuesBunReturning = bunDb.delete(users).returning().values();
Expect<Equal<any[][], typeof deleteValuesBunReturning>>;

const deleteAllReturningPartial = db.delete(users).returning({
	myId: users.id,
	myHomeCity: users.homeCity,
}).all();
Expect<Equal<{ myId: number; myHomeCity: number }[], typeof deleteAllReturningPartial>>;

const deleteGetReturningPartial = db.delete(users).returning({
	myId: users.id,
	myHomeCity: users.homeCity,
}).get();
Expect<Equal<{ myId: number; myHomeCity: number } | undefined, typeof deleteGetReturningPartial>>;

const deleteValuesReturningPartial = db.delete(users).returning({
	myId: users.id,
	myHomeCity: users.homeCity,
}).values();
Expect<Equal<any[][], typeof deleteValuesReturningPartial>>;

const deleteAllBunReturningPartial = bunDb.delete(users).returning({
	myId: users.id,
	myHomeCity: users.homeCity,
}).all();
Expect<Equal<{ myId: number; myHomeCity: number }[], typeof deleteAllBunReturningPartial>>;

const deleteGetBunReturningPartial = bunDb.delete(users).returning({
	myId: users.id,
	myHomeCity: users.homeCity,
}).get();
Expect<Equal<{ myId: number; myHomeCity: number } | undefined, typeof deleteGetBunReturningPartial>>;

const deleteValuesBunReturningPartial = bunDb.delete(users).returning({
	myId: users.id,
	myHomeCity: users.homeCity,
}).values();
Expect<Equal<any[][], typeof deleteValuesBunReturningPartial>>;

{
	function dynamic<T extends SQLiteDelete>(qb: T) {
		return qb.where(sql``).returning();
	}

	const qbBase = db.delete(users).$dynamic();
	const qb = dynamic(qbBase);
	const result = await qb;
	Expect<Equal<typeof users.$inferSelect[], typeof result>>;
}

{
	function withReturning<T extends SQLiteDelete>(qb: T) {
		return qb.returning();
	}

	const qbBase = db.delete(users).$dynamic();
	const qb = withReturning(qbBase);
	const result = await qb;
	Expect<Equal<typeof users.$inferSelect[], typeof result>>;
}

{
	db
		.delete(users)
		.where(sql``)
		// @ts-expect-error method was already called
		.where(sql``);

	db
		.delete(users)
		.returning()
		// @ts-expect-error method was already called
		.returning();
}

{
	db.delete(users).where(sql``).limit(1).orderBy(sql``);
}
