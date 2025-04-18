import type { QueryResult } from 'pg';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import type { PgDelete } from '~/pg-core/index.ts';
import { eq } from '~/sql/expressions/index.ts';
import { sql } from '~/sql/sql.ts';
import { db } from './db.ts';
import { users } from './tables.ts';

const deleteAll = await db.delete(users);
Expect<Equal<QueryResult<never>, typeof deleteAll>>;

const deleteAllStmt = db.delete(users).prepare('deleteAllStmt');
const deleteAllPrepared = await deleteAllStmt.execute();
Expect<Equal<QueryResult<never>, typeof deleteAllPrepared>>;

const deleteWhere = await db.delete(users).where(eq(users.id, 1));
Expect<Equal<QueryResult<never>, typeof deleteWhere>>;

const deleteWhereStmt = db.delete(users).where(eq(users.id, 1)).prepare('deleteWhereStmt');
const deleteWherePrepared = await deleteWhereStmt.execute();
Expect<Equal<QueryResult<never>, typeof deleteWherePrepared>>;

const deleteReturningAll = await db.delete(users).returning();
Expect<Equal<typeof users.$inferSelect[], typeof deleteReturningAll>>;

const deleteReturningAllStmt = db.delete(users).returning().prepare('deleteReturningAllStmt');
const deleteReturningAllPrepared = await deleteReturningAllStmt.execute();
Expect<Equal<typeof users.$inferSelect[], typeof deleteReturningAllPrepared>>;

const deleteReturningPartial = await db.delete(users).returning({
	myId: users.id,
	myHomeCity: users.homeCity,
});
Expect<Equal<{ myId: number; myHomeCity: number }[], typeof deleteReturningPartial>>;

const deleteReturningPartialStmt = db.delete(users).returning({
	myId: users.id,
	myHomeCity: users.homeCity,
}).prepare('deleteReturningPartialStmt');
const deleteReturningPartialPrepared = await deleteReturningPartialStmt.execute();
Expect<Equal<{ myId: number; myHomeCity: number }[], typeof deleteReturningPartialPrepared>>;

{
	function dynamic<T extends PgDelete>(qb: T) {
		return qb.where(sql``).returning();
	}

	const qbBase = db.delete(users).$dynamic();
	const qb = dynamic(qbBase);
	const result = await qb;
	Expect<Equal<typeof users.$inferSelect[], typeof result>>;
}

{
	function withReturning<T extends PgDelete>(qb: T) {
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
