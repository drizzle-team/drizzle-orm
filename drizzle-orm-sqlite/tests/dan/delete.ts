import { RunResult } from 'better-sqlite3';
import { eq } from 'drizzle-orm/expressions';
import { RunResult as AsyncRunResult } from 'sqlite3';

import { Equal, Expect } from 'tests/utils';
import { InferModel } from '~/index';
import { asyncDb, bunDb, db } from './db';
import { users } from './tables';

const deleteAll = db.delete(users).execute();
Expect<Equal<RunResult, typeof deleteAll>>;

const deleteAllBun = bunDb.delete(users).execute();
Expect<Equal<void, typeof deleteAllBun>>;

const deleteAllAsync = asyncDb.delete(users).execute();
Expect<Equal<Promise<AsyncRunResult>, typeof deleteAllAsync>>;

const deleteWhere = db.delete(users).where(eq(users.id, 1)).execute();
Expect<Equal<RunResult, typeof deleteWhere>>;

const deleteWhereBun = bunDb.delete(users).where(eq(users.id, 1)).execute();
Expect<Equal<void, typeof deleteWhereBun>>;

const deleteReturningAll = db.delete(users).returning().execute();
Expect<Equal<InferModel<typeof users>[], typeof deleteReturningAll>>;

const deleteReturningAllBun = bunDb.delete(users).returning().execute();
Expect<Equal<InferModel<typeof users>[], typeof deleteReturningAllBun>>;

const deleteReturningPartial = db.delete(users).returning({
	myId: users.id,
	myHomeCity: users.homeCity,
}).execute();
Expect<Equal<{ myId: number; myHomeCity: number }[], typeof deleteReturningPartial>>;

const deleteReturningPartialBun = bunDb.delete(users).returning({
	myId: users.id,
	myHomeCity: users.homeCity,
}).execute();
Expect<Equal<{ myId: number; myHomeCity: number }[], typeof deleteReturningPartialBun>>;
