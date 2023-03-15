import type { Equal} from 'tests/utils';
import { Expect } from 'tests/utils';
import { eq } from '~/expressions';
import type { MySqlRawQueryResult } from '~/mysql2';
import { db } from './db';
import { users } from './tables';

const deleteAll = await db.delete(users);
Expect<Equal<MySqlRawQueryResult, typeof deleteAll>>;

const deleteAllStmt = db.delete(users).prepare('deleteAllStmt');
const deleteAllPrepared = await deleteAllStmt.execute();
Expect<Equal<MySqlRawQueryResult, typeof deleteAllPrepared>>;

const deleteWhere = await db.delete(users).where(eq(users.id, 1));
Expect<Equal<MySqlRawQueryResult, typeof deleteWhere>>;

const deleteWhereStmt = db.delete(users).where(eq(users.id, 1)).prepare('deleteWhereStmt');
const deleteWherePrepared = await deleteWhereStmt.execute();
Expect<Equal<MySqlRawQueryResult, typeof deleteWherePrepared>>;

const deleteReturningAll = await db.delete(users);
Expect<Equal<MySqlRawQueryResult, typeof deleteReturningAll>>;

const deleteReturningAllStmt = db.delete(users).prepare('deleteReturningAllStmt');
const deleteReturningAllPrepared = await deleteReturningAllStmt.execute();
Expect<Equal<MySqlRawQueryResult, typeof deleteReturningAllPrepared>>;

const deleteReturningPartial = await db.delete(users);
Expect<Equal<MySqlRawQueryResult, typeof deleteReturningPartial>>;

const deleteReturningPartialStmt = db.delete(users).prepare('deleteReturningPartialStmt');
const deleteReturningPartialPrepared = await deleteReturningPartialStmt.execute();
Expect<Equal<MySqlRawQueryResult, typeof deleteReturningPartialPrepared>>;
