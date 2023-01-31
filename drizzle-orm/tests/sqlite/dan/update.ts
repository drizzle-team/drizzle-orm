import { RunResult } from 'better-sqlite3';
import { Equal, Expect } from 'tests/utils';
import { eq } from '~/expressions';
import { InferModel } from '~/sqlite-core/table';
import { bunDb, db } from './db';
import { users } from './tables';

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
Expect<Equal<never, typeof updateAll>>;

const updateAllBun = bunDb.update(users)
	.set({
		name: 'John',
		age1: 30,
	})
	.all();
Expect<Equal<never, typeof updateAllBun>>;

const updateGet = db.update(users)
	.set({
		name: 'John',
		age1: 30,
	}).get();
Expect<Equal<never, typeof updateGet>>;

const updateGetBun = bunDb.update(users)
	.set({
		name: 'John',
		age1: 30,
	}).get();
Expect<Equal<never, typeof updateGetBun>>;

const updateAllReturningAll = db.update(users)
	.set({
		name: 'John',
		age1: 30,
	})
	.where(eq(users.id, 1))
	.returning()
	.all();
Expect<Equal<InferModel<typeof users>[], typeof updateAllReturningAll>>;

const updateAllReturningAllBun = bunDb.update(users)
	.set({
		name: 'John',
		age1: 30,
	})
	.where(eq(users.id, 1))
	.returning()
	.all();
Expect<Equal<InferModel<typeof users>[], typeof updateAllReturningAllBun>>;

const updateGetReturningAll = db.update(users)
	.set({
		name: 'John',
		age1: 30,
	})
	.where(eq(users.id, 1))
	.returning()
	.get();
Expect<Equal<InferModel<typeof users>, typeof updateGetReturningAll>>;

const updateGetReturningAllBun = bunDb.update(users)
	.set({
		name: 'John',
		age1: 30,
	})
	.where(eq(users.id, 1))
	.returning()
	.get();
Expect<Equal<InferModel<typeof users>, typeof updateGetReturningAllBun>>;
