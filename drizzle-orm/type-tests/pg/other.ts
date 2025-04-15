import type { QueryResult } from 'pg';
import { eq, inArray } from '~/sql/expressions/index.ts';
import { sql } from '~/sql/sql.ts';

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
