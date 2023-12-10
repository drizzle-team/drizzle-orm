import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { eq } from '~/expressions.ts';
import type { MsSqlDelete } from '~/mssql-core/index.ts';
import { drizzle } from '~/node-mssql';
import type { MsSqlQueryResult } from '~/node-mssql';
import { sql } from '~/sql/sql.ts';
import { users } from './tables.ts';

const db = drizzle({} as any);

const deleteAll = await db.delete(users);
Expect<Equal<MsSqlQueryResult, typeof deleteAll>>;

const deleteAllStmt = db.delete(users).prepare();
const deleteAllPrepared = await deleteAllStmt.execute();
Expect<Equal<MsSqlQueryResult, typeof deleteAllPrepared>>;

const deleteWhere = await db.delete(users).where(eq(users.id, 1));
Expect<Equal<MsSqlQueryResult, typeof deleteWhere>>;

const deleteWhereStmt = db.delete(users).where(eq(users.id, 1)).prepare();
const deleteWherePrepared = await deleteWhereStmt.execute();
Expect<Equal<MsSqlQueryResult, typeof deleteWherePrepared>>;

const deleteReturningAll = await db.delete(users);
Expect<Equal<MsSqlQueryResult, typeof deleteReturningAll>>;

const deleteReturningAllStmt = db.delete(users).prepare();
const deleteReturningAllPrepared = await deleteReturningAllStmt.execute();
Expect<Equal<MsSqlQueryResult, typeof deleteReturningAllPrepared>>;

const deleteReturningPartial = await db.delete(users);
Expect<Equal<MsSqlQueryResult, typeof deleteReturningPartial>>;

const deleteReturningPartialStmt = db.delete(users).prepare();
const deleteReturningPartialPrepared = await deleteReturningPartialStmt.execute();
Expect<Equal<MsSqlQueryResult, typeof deleteReturningPartialPrepared>>;

{
	function dynamic<T extends MsSqlDelete>(qb: T) {
		return qb.where(sql``);
	}

	const qbBase = db.delete(users).$dynamic();
	const qb = dynamic(qbBase);
	const result = await qb;
	Expect<Equal<MsSqlQueryResult, typeof result>>;
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
