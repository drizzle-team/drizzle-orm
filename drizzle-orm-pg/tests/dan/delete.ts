import { eq } from 'drizzle-orm/expressions';
import { QueryResult } from 'pg';
import { Equal, Expect } from 'tests/utils';
import { InferModel } from '~/index';
import { db } from './db';
import { users } from './tables';

const deleteAll = await db.delete(users);

Expect<Equal<QueryResult<any>, typeof deleteAll>>;

const deleteWhere = await db.delete(users).where(eq(users.id, 1));

Expect<Equal<QueryResult<any>, typeof deleteWhere>>;

const deleteReturningAll = await db.delete(users).returning();

Expect<Equal<InferModel<typeof users>[], typeof deleteReturningAll>>;

const deleteReturningPartial = await db.delete(users).returning({
	myId: users.id,
	myHomeCity: users.homeCity,
});

Expect<Equal<{ myId: number; myHomeCity: number }[], typeof deleteReturningPartial>>;
