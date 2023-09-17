import type { RunResult } from 'better-sqlite3';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { eq } from '~/expressions.ts';
import { type DrizzleTypeError } from '~/utils.ts';
import { bunDb, db } from './db.ts';
import { users } from './tables.ts';

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

const updateLimit = db
	.update(users)
	.set({
		name: 'John',
		age1: 30,
	})
	.limit(1)
	.run();
Expect<Equal<RunResult, typeof updateLimit>>;

const updateLimitBun = bunDb
	.update(users)
	.set({
		name: 'John',
		age1: 30,
	})
	.limit(1)
	.run();
Expect<Equal<void, typeof updateLimitBun>>;

const updateAll = db
	.update(users)
	.set({
		name: 'John',
		age1: 30,
	})
	.all();
Expect<Equal<DrizzleTypeError<'.all() cannot be used without .returning()'>, typeof updateAll>>;

const updateAllBun = bunDb.update(users)
	.set({
		name: 'John',
		age1: 30,
	})
	.all();
Expect<Equal<DrizzleTypeError<'.all() cannot be used without .returning()'>, typeof updateAllBun>>;

const updateGet = db.update(users)
	.set({
		name: 'John',
		age1: 30,
	}).get();
Expect<Equal<DrizzleTypeError<'.get() cannot be used without .returning()'>, typeof updateGet>>;

const updateGetBun = bunDb.update(users)
	.set({
		name: 'John',
		age1: 30,
	}).get();
Expect<Equal<DrizzleTypeError<'.get() cannot be used without .returning()'>, typeof updateGetBun>>;

const updateAllReturningAll = db.update(users)
	.set({
		name: 'John',
		age1: 30,
	})
	.where(eq(users.id, 1))
	.returning()
	.all();
Expect<Equal<typeof users.$inferSelect[], typeof updateAllReturningAll>>;

const updateAllReturningAllBun = bunDb.update(users)
	.set({
		name: 'John',
		age1: 30,
	})
	.where(eq(users.id, 1))
	.returning()
	.all();
Expect<Equal<typeof users.$inferSelect[], typeof updateAllReturningAllBun>>;

const updateGetReturningAll = db.update(users)
	.set({
		name: 'John',
		age1: 30,
	})
	.where(eq(users.id, 1))
	.returning()
	.get();
Expect<Equal<typeof users.$inferSelect, typeof updateGetReturningAll>>;

const updateGetReturningAllBun = bunDb.update(users)
	.set({
		name: 'John',
		age1: 30,
	})
	.where(eq(users.id, 1))
	.returning()
	.get();
Expect<Equal<typeof users.$inferSelect, typeof updateGetReturningAllBun>>;
