import type { RunResult } from 'better-sqlite3';
import { eq } from '~/expressions';

import type { Equal } from 'type-tests/utils';
import { Expect } from 'type-tests/utils';
import type { InferModel } from '~/table';
import { bunDb, db } from './db';
import { users } from './tables';

const deleteRun = db.delete(users).run();
Expect<Equal<RunResult, typeof deleteRun>>;

const deleteAll = db.delete(users).all();
Expect<Equal<never, typeof deleteAll>>;

const deleteGet = db.delete(users).get();
Expect<Equal<never, typeof deleteGet>>;

const deleteValues = db.delete(users).values();
Expect<Equal<never, typeof deleteValues>>;

const deleteRunBun = bunDb.delete(users).run();
Expect<Equal<void, typeof deleteRunBun>>;

const deleteAllBun = bunDb.delete(users).all();
Expect<Equal<never, typeof deleteAllBun>>;

const deleteGetBun = bunDb.delete(users).get();
Expect<Equal<never, typeof deleteGetBun>>;

const deleteValuesBun = bunDb.delete(users).values();
Expect<Equal<never, typeof deleteValuesBun>>;

const deleteRunWhere = db.delete(users).where(eq(users.id, 1)).run();
Expect<Equal<RunResult, typeof deleteRunWhere>>;

const deleteAllWhere = db.delete(users).where(eq(users.id, 1)).all();
Expect<Equal<never, typeof deleteAllWhere>>;

const deleteGetWhere = db.delete(users).where(eq(users.id, 1)).get();
Expect<Equal<never, typeof deleteGetWhere>>;

const deleteValuesWhere = db.delete(users).where(eq(users.id, 1)).values();
Expect<Equal<never, typeof deleteValuesWhere>>;

const deleteRunBunWhere = bunDb.delete(users).where(eq(users.id, 1)).run();
Expect<Equal<void, typeof deleteRunBunWhere>>;

const deleteAllBunWhere = bunDb.delete(users).where(eq(users.id, 1)).all();
Expect<Equal<never, typeof deleteAllBunWhere>>;

const deleteGetBunWhere = bunDb.delete(users).where(eq(users.id, 1)).get();
Expect<Equal<never, typeof deleteGetBunWhere>>;

const deleteValuesBunWhere = bunDb.delete(users).where(eq(users.id, 1)).values();
Expect<Equal<never, typeof deleteValuesBunWhere>>;

const deleteRunReturning = db.delete(users).returning().run();
Expect<Equal<RunResult, typeof deleteRunReturning>>;

const deleteAllReturning = db.delete(users).returning().all();
Expect<Equal<InferModel<typeof users>[], typeof deleteAllReturning>>;

const deleteGetReturning = db.delete(users).returning().get();
Expect<Equal<InferModel<typeof users> | undefined, typeof deleteGetReturning>>;

const deleteValuesReturning = db.delete(users).returning().values();
Expect<Equal<any[][], typeof deleteValuesReturning>>;

const deleteRunBunReturning = bunDb.delete(users).returning().run();
Expect<Equal<void, typeof deleteRunBunReturning>>;

const deleteAllBunReturning = bunDb.delete(users).returning().all();
Expect<Equal<InferModel<typeof users>[], typeof deleteAllBunReturning>>;

const deleteGetBunReturning = bunDb.delete(users).returning().get();
Expect<Equal<InferModel<typeof users> | undefined, typeof deleteGetBunReturning>>;

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
