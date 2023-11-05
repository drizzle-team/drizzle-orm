import type { QueryResult } from 'pg';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { eq } from '~/expressions.ts';
import type { PgUpdate } from '~/pg-core/index.ts';
import { sql } from '~/sql/sql.ts';
import { db } from './db.ts';
import { users } from './tables.ts';

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

{
	function dynamic<T extends PgUpdate>(qb: T) {
		return qb.where(sql``).returning();
	}

	const qbBase = db.update(users).set({}).$dynamic();
	const qb = dynamic(qbBase);
	const result = await qb;
	Expect<Equal<typeof users.$inferSelect[], typeof result>>;
}

{
	function withReturning<T extends PgUpdate>(qb: T) {
		return qb.returning();
	}

	const qbBase = db.update(users).set({}).$dynamic();
	const qb = withReturning(qbBase);
	const result = await qb;
	Expect<Equal<typeof users.$inferSelect[], typeof result>>;
}

{
	db
		.update(users)
		.set({})
		.returning()
		// @ts-expect-error method was already called
		.returning();

	db
		.update(users)
		.set({})
		.where(sql``)
		// @ts-expect-error method was already called
		.where(sql``);
}
