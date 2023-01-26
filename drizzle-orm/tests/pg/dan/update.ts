import { eq } from 'drizzle-orm/expressions';
import { QueryResult } from 'pg';
import { Equal, Expect } from 'tests/utils';
import { db } from './db';
import { users } from './tables';

const update = await db.update(users)
	.set({
		text: 'John',
		age1: 30,
	})
	.where(eq(users.id, 1));
Expect<Equal<QueryResult<never>, typeof update>>;

const updateStmt = db.update(users)
	.set({
		text: 'John',
		age1: 30,
	})
	.where(eq(users.id, 1))
	.prepare('updateStmt');
const updatePrepared = await updateStmt.execute();
Expect<Equal<QueryResult<never>, typeof updatePrepared>>;

const updateReturning = await db.update(users)
	.set({
		text: 'John',
		age1: 30,
	})
	.where(eq(users.id, 1))
	.returning({
		text: users.text,
	});
Expect<Equal<{ text: string | null }[], typeof updateReturning>>;

const updateReturningStmt = db.update(users)
	.set({
		text: 'John',
		age1: 30,
	})
	.where(eq(users.id, 1))
	.returning({
		text: users.text,
	})
	.prepare('updateReturningStmt');
const updateReturningPrepared = await updateReturningStmt.execute();
Expect<Equal<{ text: string | null }[], typeof updateReturningPrepared>>;
