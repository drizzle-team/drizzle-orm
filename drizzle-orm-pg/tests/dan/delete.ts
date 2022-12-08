import { eq } from 'drizzle-orm/expressions';
import { QueryResult } from 'pg';
import { Equal, Expect } from 'tests/utils';
import { InferModel } from '~/index';
import { db } from './db';
import { users } from './tables';

const deleteAll = await db.delete(users);
Expect<Equal<QueryResult<never>, typeof deleteAll>>;

const deleteAllStmt = db.delete(users).prepare();
const deleteAllPrepared = await deleteAllStmt.execute();
Expect<Equal<QueryResult<never>, typeof deleteAllPrepared>>;

const deleteWhere = await db.delete(users).where(eq(users.id, 1));
Expect<Equal<QueryResult<never>, typeof deleteWhere>>;

const deleteWhereStmt = db.delete(users).where(eq(users.id, 1)).prepare();
const deleteWherePrepared = await deleteWhereStmt.execute();
Expect<Equal<QueryResult<never>, typeof deleteWherePrepared>>;

const deleteReturningAll = await db.delete(users).returning();
Expect<Equal<InferModel<typeof users>[], typeof deleteReturningAll>>;

const deleteReturningAllStmt = db.delete(users).returning().prepare();
const deleteReturningAllPrepared = await deleteReturningAllStmt.execute();
Expect<Equal<InferModel<typeof users>[], typeof deleteReturningAllPrepared>>;

const deleteReturningPartial = await db.delete(users).returning({
	myId: users.id,
	myHomeCity: users.homeCity,
});
Expect<Equal<{ myId: number; myHomeCity: number }[], typeof deleteReturningPartial>>;

const deleteReturningPartialStmt = db.delete(users).returning({
	myId: users.id,
	myHomeCity: users.homeCity,
}).prepare();
const deleteReturningPartialPrepared = await deleteReturningPartialStmt.execute();
Expect<Equal<{ myId: number; myHomeCity: number }[], typeof deleteReturningPartialPrepared>>;
