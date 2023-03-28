import type { QueryResult } from 'pg';
import type { Equal } from 'tests/utils';
import { Expect } from 'tests/utils';
import { eq } from '~/expressions';
import type { InferModel } from '~/table';
import { db } from './db';
import { users } from './tables';

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
Expect<Equal<InferModel<typeof users>[], typeof deleteReturningAll>>;

const deleteReturningAllStmt = db.delete(users).returning().prepare('deleteReturningAllStmt');
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
}).prepare('deleteReturningPartialStmt');
const deleteReturningPartialPrepared = await deleteReturningPartialStmt.execute();
Expect<Equal<{ myId: number; myHomeCity: number }[], typeof deleteReturningPartialPrepared>>;
