import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import type { SingleStoreDelete } from '~/singlestore-core/index.ts';
import type { SingleStoreRawQueryResult } from '~/singlestore/index.ts';
import { eq } from '~/sql/expressions/index.ts';
import { sql } from '~/sql/sql.ts';
import { db } from './db.ts';
import { users } from './tables.ts';

const deleteAll = await db.delete(users);
Expect<Equal<SingleStoreRawQueryResult, typeof deleteAll>>;

const deleteAllStmt = db.delete(users).prepare();
const deleteAllPrepared = await deleteAllStmt.execute();
Expect<Equal<SingleStoreRawQueryResult, typeof deleteAllPrepared>>;

const deleteWhere = await db.delete(users).where(eq(users.id, 1));
Expect<Equal<SingleStoreRawQueryResult, typeof deleteWhere>>;

const deleteWhereStmt = db.delete(users).where(eq(users.id, 1)).prepare();
const deleteWherePrepared = await deleteWhereStmt.execute();
Expect<Equal<SingleStoreRawQueryResult, typeof deleteWherePrepared>>;

const deleteReturningAll = await db.delete(users);
Expect<Equal<SingleStoreRawQueryResult, typeof deleteReturningAll>>;

const deleteReturningAllStmt = db.delete(users).prepare();
const deleteReturningAllPrepared = await deleteReturningAllStmt.execute();
Expect<Equal<SingleStoreRawQueryResult, typeof deleteReturningAllPrepared>>;

const deleteReturningPartial = await db.delete(users);
Expect<Equal<SingleStoreRawQueryResult, typeof deleteReturningPartial>>;

const deleteReturningPartialStmt = db.delete(users).prepare();
const deleteReturningPartialPrepared = await deleteReturningPartialStmt.execute();
Expect<Equal<SingleStoreRawQueryResult, typeof deleteReturningPartialPrepared>>;

{
	function dynamic<T extends SingleStoreDelete>(qb: T) {
		return qb.where(sql``);
	}

	const qbBase = db.delete(users).$dynamic();
	const qb = dynamic(qbBase);
	const result = await qb;
	Expect<Equal<SingleStoreRawQueryResult, typeof result>>;
}

{
	db
		.delete(users)
		.where(sql``)
		// @ts-expect-error method was already called
		.where(sql``);

	db
		.delete(users)
		.$dynamic()
		.where(sql``)
		.where(sql``);
}

{
	db.delete(users).where(sql``).limit(1).orderBy(sql``);
}
