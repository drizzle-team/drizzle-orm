import type { Equal } from 'type-tests/utils';
import { Expect } from 'type-tests/utils';
import { d1Db } from './db';
import { type NewUser, users } from './tables';
import { D1Batch } from '~/d1';

const batch = new D1Batch();

const selectResult = d1Db
	.select({ id: users.id })
	.from(users)
	.runInBatch(batch);

Expect<Equal<Promise<{ id: number }[]>, typeof selectResult>>;

const newUser: NewUser = {
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
	serialNotNull: 1,
};

const insertResult = d1Db.insert(users).values(newUser).runInBatch(batch)
Expect<Equal<Promise<undefined[]>, typeof insertResult>>;

const update1Result = d1Db.update(users).set({ class: 'C' }).runInBatch(batch)
Expect<Equal<Promise<undefined[]>, typeof update1Result>>;

const update2Result = d1Db.update(users).set({ class: 'C' }).returning({ id: users.id }).runInBatch(batch)
Expect<Equal<Promise<{ id: number }[]>, typeof update2Result>>;

const deleteResult = d1Db.delete(users).runInBatch(batch);
Expect<Equal<Promise<undefined[]>, typeof deleteResult>>;
