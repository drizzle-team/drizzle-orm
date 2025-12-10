import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import type { MsSqlDelete } from '~/mssql-core/index.ts';
import { drizzle } from '~/node-mssql';
import type { MsSqlQueryResult } from '~/node-mssql';
import { eq } from '~/sql/expressions';
import { sql } from '~/sql/sql.ts';
import { users } from './tables.ts';

const db = drizzle.mock();

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

const deleteOutputAll = await db.delete(users).output();
Expect<Equal<typeof users.$inferSelect[], typeof deleteOutputAll>>;

const deleteOutputAllStmt = db.delete(users).output().prepare();
const deleteOutputAllPrepared = await deleteOutputAllStmt.execute();
Expect<Equal<typeof users.$inferSelect[], typeof deleteOutputAllPrepared>>;

const deleteOutputPartial = await db.delete(users).output({ cityHome: users.homeCity });
Expect<Equal<{ cityHome: number }[], typeof deleteOutputPartial>>;

const deleteOutputPartialStmt = db.delete(users).output({ cityHome: users.homeCity }).prepare();
const deleteOutputPartialPrepared = await deleteOutputPartialStmt.execute();
Expect<Equal<{ cityHome: number }[], typeof deleteOutputPartialPrepared>>;

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
