import { sql } from 'drizzle-orm';
import { eq, inArray } from 'drizzle-orm/expressions';
import { QueryResult } from 'pg';

import { Equal, Expect } from '../utils';
import { db } from './db';
import { users } from './tables';

const rawQuery = await db.execute(
	sql`select ${users.id}, ${users.class} from ${users} where ${inArray(users.id, [1, 2, 3])} and ${
		eq(users.class, 'A')
	}`,
);

Expect<Equal<QueryResult<Record<string, unknown>>, typeof rawQuery>>;
