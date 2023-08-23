import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { eq } from '~/expressions.ts';
import type { MySqlRawQueryResult } from '~/mysql2/index.ts';
import { db } from './db.ts';
import { users } from './tables.ts';

const deleteAll = await db.delete(users);
Expect<Equal<MySqlRawQueryResult, typeof deleteAll>>;

const deleteAllStmt = db.delete(users).prepare();
const deleteAllPrepared = await deleteAllStmt.execute();
Expect<Equal<MySqlRawQueryResult, typeof deleteAllPrepared>>;

const deleteWhere = await db.delete(users).where(eq(users.id, 1));
Expect<Equal<MySqlRawQueryResult, typeof deleteWhere>>;

const deleteWhereStmt = db.delete(users).where(eq(users.id, 1)).prepare();
const deleteWherePrepared = await deleteWhereStmt.execute();
Expect<Equal<MySqlRawQueryResult, typeof deleteWherePrepared>>;

const deleteReturningAll = await db.delete(users);
Expect<Equal<MySqlRawQueryResult, typeof deleteReturningAll>>;

const deleteReturningAllStmt = db.delete(users).prepare();
const deleteReturningAllPrepared = await deleteReturningAllStmt.execute();
Expect<Equal<MySqlRawQueryResult, typeof deleteReturningAllPrepared>>;

const deleteReturningPartial = await db.delete(users);
Expect<Equal<MySqlRawQueryResult, typeof deleteReturningPartial>>;

const deleteReturningPartialStmt = db.delete(users).prepare();
const deleteReturningPartialPrepared = await deleteReturningPartialStmt.execute();
Expect<Equal<MySqlRawQueryResult, typeof deleteReturningPartialPrepared>>;
