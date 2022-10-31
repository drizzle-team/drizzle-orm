import { RunResult } from 'better-sqlite3';
import { eq } from 'drizzle-orm/expressions';
import { Equal, Expect } from 'tests/utils';
import { InferModel } from '~/index';
import { db } from './db';
import { users } from './tables';

const deleteAll = db.delete(users).execute();

Expect<Equal<RunResult, typeof deleteAll>>;

const deleteWhere = db.delete(users).where(eq(users.id, 1)).execute();

Expect<Equal<RunResult, typeof deleteWhere>>;

const deleteReturningAll = db.delete(users).returning().execute();

Expect<Equal<InferModel<typeof users>[], typeof deleteReturningAll>>;

const deleteReturningPartial = db.delete(users).returning({
	myId: users.id,
	myHomeCity: users.homeCity,
}).execute();

Expect<Equal<{ myId: number; myHomeCity: number }[], typeof deleteReturningPartial>>;
