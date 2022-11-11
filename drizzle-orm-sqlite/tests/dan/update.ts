import { RunResult } from 'better-sqlite3';
import { eq } from 'drizzle-orm/expressions';
import { Equal, Expect } from 'tests/utils';
import { db } from './db';
import { users } from './tables';

const update = db.update(users).set({
	text: 'John',
	age1: 30,
})
	.where(eq(users.id, 1)).execute();

Expect<Equal<RunResult, typeof update>>;

const updateReturning = db.update(users).set({
	text: 'John',
	age1: 30,
})
	.where(eq(users.id, 1))
	.returning({
		text: users.text,
	}).execute();

Expect<Equal<{ text: string | null }[], typeof updateReturning>>;
