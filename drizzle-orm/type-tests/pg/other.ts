import type { QueryResult } from 'pg';
import { and, eq, inArray, or } from '~/sql/expressions/index.ts';
import { type SQL, sql } from '~/sql/sql.ts';

import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { db } from './db.ts';
import { users } from './tables.ts';

const rawQuery = await db.execute(
	sql`select ${users.id}, ${users.class} from ${users} where ${inArray(users.id, [1, 2, 3])} and ${
		eq(users.class, 'A')
	}`,
);

Expect<Equal<QueryResult<Record<string, unknown>>, typeof rawQuery>>;

const mandatoryAnd = and(eq(users.id, 1), eq(users.class, 'A'));
const mandatoryOr = or(eq(users.id, 1), eq(users.class, 'A'));
const optionalCondition: SQL | undefined = Math.random() > 0.5 ? eq(users.id, 1) : undefined;
const mixedOptionalAnd = and(eq(users.id, 1), optionalCondition);
const mixedOptionalOr = or(eq(users.id, 1), optionalCondition);
const optionalOr = or(optionalCondition);

Expect<Equal<SQL, typeof mandatoryAnd>>;
Expect<Equal<SQL, typeof mandatoryOr>>;
Expect<Equal<SQL, typeof mixedOptionalAnd>>;
Expect<Equal<SQL, typeof mixedOptionalOr>>;
Expect<Equal<SQL | undefined, typeof optionalOr>>;
